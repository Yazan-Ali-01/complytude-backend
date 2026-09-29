#!/usr/bin/env bash
# Tests put-app-secrets.sh against a stub `aws` CLI (no AWS needed):
#   - a first fill without every required key writes nothing;
#   - a complete fill writes every key the task definitions reference (optional ones empty) and
#     never prints a value;
#   - rotating one key keeps the others; a too-short signing key is refused;
#   - the db-app secret gets a generated password.
#
#   bash scripts/deploy/test-put-app-secrets.sh
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
mkdir -p "$WORK/bin" "$WORK/store"

cat >"$WORK/bin/aws" <<'STUB'
#!/usr/bin/env bash
# Secrets Manager in a directory: one file per secret id
arg() {
  local flag="$1"; shift
  while [[ $# -gt 0 ]]; do [[ "$1" == "$flag" ]] && { echo "$2"; return; }; shift; done
}
id=$(arg --secret-id "$@")
file="$STUB_STORE/${id//\//_}"
case "$1 $2" in
  "secretsmanager get-secret-value")
    [[ -f "$file" ]] || { echo "ResourceNotFoundException" >&2; exit 254; }
    cat "$file" ;;
  "secretsmanager put-secret-value")
    source=$(arg --secret-string "$@")
    [[ "$source" == file://* ]] || { echo "value passed on the command line" >&2; exit 3; }
    cp "${source#file://}" "$file" ;;
  *) echo "unexpected aws call: $*" >&2; exit 3 ;;
esac
STUB
chmod +x "$WORK/bin/aws"

export PATH="$WORK/bin:$PATH" STUB_STORE="$WORK/store"
SCRIPT="$HERE/put-app-secrets.sh"
APP="$WORK/store/complytude_staging_app"
failures=0
check() {
  local what="$1"; shift
  if "$@"; then echo "ok   - $what"; else echo "FAIL - $what"; failures=$((failures + 1)); fi
}
value() { jq -r --arg k "$1" '.[$k]' "$2"; }

# 1. Missing required keys: refused, nothing stored
set +e
STRIPE_SECRET_KEY=sk_test_aaaaaaaaaaaaaaaaaaaa bash "$SCRIPT" --env staging >"$WORK/out1" 2>&1
status=$?
set -e
check "refuses a fill without every required key" test "$status" -ne 0
check "stores nothing then" test ! -f "$APP"

# 2. Complete fill: generated signing keys, given Stripe/OpenAI, optional keys empty
STRIPE_SECRET_KEY=sk_test_aaaaaaaaaaaaaaaaaaaa STRIPE_WEBHOOK_SECRET=whsec_bbbbbbbbbbbbbbbbbbbb \
  OPENAI_API_KEY=sk-proj-cccccccccccccccccccc \
  bash "$SCRIPT" --env staging --generate JWT_ACCESS_SECRET --generate JWT_REFRESH_SECRET \
  --generate JWT_IDENTITY_SECRET --generate JWT_IDENTITY_REFRESH_SECRET \
  --generate BULL_BOARD_ADMIN_SECRET >"$WORK/out2" 2>&1
check "writes the secret" test -f "$APP"
check "every referenced key present" test "$(jq -r 'keys | length' "$APP")" -eq 11
check "optional keys are empty strings" test "$(value GOOGLE_CLIENT_SECRET "$APP")" = ""
check "generated keys are long" test "$(value JWT_ACCESS_SECRET "$APP" | wc -c)" -gt 40
check "generated keys differ" test "$(value JWT_ACCESS_SECRET "$APP")" != "$(value JWT_REFRESH_SECRET "$APP")"
check "no value printed" bash -c "! grep -qE 'sk_test|whsec|sk-proj|$(value JWT_ACCESS_SECRET "$APP")' '$WORK/out2'"

# 3. Rotate one key: the rest stays
before=$(value JWT_ACCESS_SECRET "$APP")
STRIPE_WEBHOOK_SECRET=whsec_rotatedrotatedrotated bash "$SCRIPT" --env staging >/dev/null
check "rotated key changed" test "$(value STRIPE_WEBHOOK_SECRET "$APP")" = "whsec_rotatedrotatedrotated"
check "other keys kept" test "$(value JWT_ACCESS_SECRET "$APP")" = "$before"

# 4. A short signing key is refused
set +e
JWT_ACCESS_SECRET=short bash "$SCRIPT" --env staging >/dev/null 2>&1
status=$?
set -e
check "short signing key refused" test "$status" -ne 0
check "stored value unchanged" test "$(value JWT_ACCESS_SECRET "$APP")" = "$before"

# 5. The db-app secret
bash "$SCRIPT" --env staging --secret db-app --generate DB_APP_PASSWORD >/dev/null
DB="$WORK/store/complytude_staging_db-app"
check "db-app password generated" test "$(value DB_APP_PASSWORD "$DB" | wc -c)" -gt 40

echo
if [[ $failures -gt 0 ]]; then
  echo "$failures check(s) failed"
  exit 1
fi
echo "all checks passed"
