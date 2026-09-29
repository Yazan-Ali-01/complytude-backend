#!/usr/bin/env bash
# Sets the application's credentials in AWS Secrets Manager, outside Terraform, so their values
# never pass through tfvars or Terraform state (Terraform only creates the containers).
#
#   scripts/deploy/put-app-secrets.sh --env staging [--secret app|db-app] [--generate KEY]...
#
# Values come from environment variables named like the keys, for the keys you want to set:
#
#   STRIPE_SECRET_KEY=sk_live_… STRIPE_WEBHOOK_SECRET=whsec_… \
#     scripts/deploy/put-app-secrets.sh --env staging
#
# --generate KEY sets KEY to a new random value (JWT signing keys, the Bull Board secret, the app
# DB password). Keys you don't give keep their current value, so one key can be rotated alone.
# The result must hold every key the ECS task definitions reference (a missing key stops the
# tasks from starting); the script refuses to write it otherwise. Values are never printed.
set -euo pipefail

usage() {
  echo "usage: $0 --env <staging|production> [--secret app|db-app] [--generate KEY]..." >&2
  exit 2
}

ENV=""
SECRET="app"
GENERATE=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --env) ENV="${2:-}"; shift 2 ;;
    --secret) SECRET="${2:-}"; shift 2 ;;
    --generate) GENERATE+=("${2:-}"); shift 2 ;;
    -h|--help) usage ;;
    *) echo "unknown argument: $1" >&2; usage ;;
  esac
done
[[ "$ENV" =~ ^(staging|production)$ ]] || usage

PROJECT="${PROJECT:-complytude}"
case "$SECRET" in
  app)
    # Referenced by the task definitions (infra/modules/ecs/services.tf). SSO client secrets and
    # Cohere may be empty (that provider or reranking is then off); the rest may not.
    REQUIRED=(JWT_ACCESS_SECRET JWT_REFRESH_SECRET JWT_IDENTITY_SECRET JWT_IDENTITY_REFRESH_SECRET
      STRIPE_SECRET_KEY STRIPE_WEBHOOK_SECRET BULL_BOARD_ADMIN_SECRET OPENAI_API_KEY)
    OPTIONAL=(GOOGLE_CLIENT_SECRET MICROSOFT_CLIENT_SECRET COHERE_API_KEY)
    ;;
  db-app)
    REQUIRED=(DB_APP_PASSWORD)
    OPTIONAL=()
    ;;
  *) echo "unknown secret: $SECRET (app or db-app)" >&2; exit 2 ;;
esac
# ${a[@]+"${a[@]}"}: an empty array is "unbound" under set -u in bash 3 (macOS)
ALL=("${REQUIRED[@]}" ${OPTIONAL[@]+"${OPTIONAL[@]}"})
SECRET_ID="${PROJECT}/${ENV}/${SECRET}"

min_length() {
  case "$1" in
    JWT_*|BULL_BOARD_ADMIN_SECRET|DB_APP_PASSWORD) echo 32 ;;
    STRIPE_*|OPENAI_API_KEY) echo 20 ;;
    *) echo 0 ;;
  esac
}

is_known() {
  local key="$1" k
  for k in "${ALL[@]}"; do [[ "$k" == "$key" ]] && return 0; done
  return 1
}

for key in ${GENERATE[@]+"${GENERATE[@]}"}; do
  is_known "$key" || { echo "--generate $key: not a key of the $SECRET secret" >&2; exit 2; }
done

# Current value, or {} before the first fill
current=$(aws secretsmanager get-secret-value --secret-id "$SECRET_ID" \
  --query SecretString --output text 2>/dev/null) || current="{}"
[[ -n "$current" && "$current" != "None" ]] || current="{}"
jq -e 'type == "object"' >/dev/null <<<"$current" || { echo "$SECRET_ID does not hold a JSON object" >&2; exit 1; }

updates="{}"
changed=()
for key in "${ALL[@]}"; do
  value=""
  generated=false
  for g in ${GENERATE[@]+"${GENERATE[@]}"}; do
    if [[ "$g" == "$key" ]]; then
      # Letters and digits only: safe in a Postgres password and in any env file
      value=$(openssl rand -base64 64 | tr -dc 'A-Za-z0-9' | head -c 48)
      generated=true
    fi
  done
  if [[ "$generated" == false && -n "${!key+x}" ]]; then
    value="${!key}"
  elif [[ "$generated" == false ]]; then
    continue
  fi
  min=$(min_length "$key")
  if [[ -n "$value" && ${#value} -lt $min ]]; then
    echo "$key: at least $min characters" >&2
    exit 1
  fi
  updates=$(jq -c --arg k "$key" --arg v "$value" '. + {($k): $v}' <<<"$updates")
  changed+=("$key")
done

merged=$(jq -c -s '.[0] + .[1]' <(echo "$current") <(echo "$updates"))

# Optional keys must exist (empty is fine): ECS fails a task whose secret key is absent
for key in ${OPTIONAL[@]+"${OPTIONAL[@]}"}; do
  merged=$(jq -c --arg k "$key" 'if has($k) then . else . + {($k): ""} end' <<<"$merged")
done
missing=()
for key in "${REQUIRED[@]}"; do
  jq -e --arg k "$key" '(.[$k] // "") | length > 0' >/dev/null <<<"$merged" || missing+=("$key")
done
if [[ ${#missing[@]} -gt 0 ]]; then
  echo "refusing to write $SECRET_ID: no value for ${missing[*]} (set them, or --generate)" >&2
  exit 1
fi
if [[ ${#changed[@]} -eq 0 && "$merged" == "$(jq -c . <<<"$current")" ]]; then
  echo "$SECRET_ID: nothing to change"
  exit 0
fi

# Through a private file, not argv: other processes can read a command line
tmp=$(mktemp)
chmod 600 "$tmp"
trap 'rm -f "$tmp"' EXIT
jq -c . <<<"$merged" >"$tmp"
aws secretsmanager put-secret-value --secret-id "$SECRET_ID" \
  --secret-string "file://$tmp" >/dev/null
echo "$SECRET_ID updated: ${changed[*]+${changed[*]}}"
