#!/usr/bin/env bash
# Tests ecs-deploy.sh against a stub `aws` CLI (no AWS needed):
#   - each service gets a new revision whose app container is pinned to the SHA's image digest,
#     with sidecars and Terraform's settings unchanged and read-only fields stripped;
#   - rolling back is the same command with an older SHA, pinning that SHA's digest;
#   - a deployment the circuit breaker rolls back (rolloutState FAILED) fails the command.
#
#   bash scripts/deploy/test-ecs-deploy.sh
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
mkdir -p "$WORK/bin"

cat >"$WORK/bin/aws" <<'STUB'
#!/usr/bin/env bash
# Records every call; answers from the environment the test sets.
echo "$*" >>"$STUB_LOG"
args="$*"
arg() { # value after a flag
  local flag="$1"; shift
  while [[ $# -gt 0 ]]; do [[ "$1" == "$flag" ]] && { echo "$2"; return; }; shift; done
}
case "$1 $2" in
  "ecr describe-images")
    repo=$(arg --repository-name "$@"); tag=$(arg --image-ids "$@"); tag="${tag#imageTag=}"
    echo "sha256:${repo//\//-}-${tag}" ;;
  "ecr describe-repositories")
    echo "123456789012.dkr.ecr.eu-central-1.amazonaws.com/$(arg --repository-names "$@")" ;;
  "ecs describe-task-definition")
    family=$(arg --task-definition "$@"); app="${family#complytude-staging-}"
    cat <<JSON
{"taskDefinitionArn":"arn:aws:ecs:eu-central-1:123456789012:task-definition/${family}:7",
 "family":"${family}","revision":7,"status":"ACTIVE","requiresAttributes":[],"compatibilities":["FARGATE"],
 "registeredAt":"2026-01-01T00:00:00Z","registeredBy":"arn:aws:iam::123456789012:user/terraform",
 "cpu":"512","memory":"1024","networkMode":"awsvpc",
 "containerDefinitions":[
   {"name":"${app}","image":"123456789012.dkr.ecr.eu-central-1.amazonaws.com/complytude/${app}:bootstrap","secrets":[{"name":"DB_HOST","valueFrom":"arn:secret:DB_HOST::"}]},
   {"name":"gotenberg","image":"gotenberg/gotenberg:8"}]}
JSON
    ;;
  "ecs register-task-definition")
    json=$(arg --cli-input-json "$@")
    n=$(ls "$STUB_DIR" | grep -c '^registered-' || true)
    echo "$json" >"$STUB_DIR/registered-$n.json"
    echo "arn:aws:ecs:eu-central-1:123456789012:task-definition/$(jq -r .family <<<"$json"):$((8 + n))" ;;
  "ecs update-service") echo '{}' ;;
  "ecs describe-services") echo "${ROLLOUT_STATE:-COMPLETED}" ;;
  *) echo "unexpected aws call: $args" >&2; exit 3 ;;
esac
STUB
chmod +x "$WORK/bin/aws"

export PATH="$WORK/bin:$PATH" POLL_SECONDS=0 TIMEOUT_SECONDS=5
failures=0
check() { # description, command...
  local what="$1"; shift
  if "$@"; then echo "ok   - $what"; else echo "FAIL - $what"; failures=$((failures + 1)); fi
}

run_deploy() { # sha, rollout state
  rm -rf "$WORK/stub" && mkdir -p "$WORK/stub"
  export STUB_DIR="$WORK/stub" STUB_LOG="$WORK/stub/calls.log" ROLLOUT_STATE="$2"
  bash "$HERE/ecs-deploy.sh" --env staging --sha "$1" >"$WORK/stub/out.log" 2>&1
}

registered() { # index, jq filter
  jq -r "$2" "$WORK/stub/registered-$1.json"
}

# 1. A deploy pins every app to its SHA's digest and leaves the rest as Terraform set it
check "deploy of a healthy SHA succeeds" run_deploy abc123 COMPLETED
check "four revisions registered" test "$(ls "$WORK/stub" | grep -c '^registered-')" -eq 4
check "api image pinned to the SHA digest" test \
  "$(registered 0 '.containerDefinitions[] | select(.name=="api") | .image')" = \
  "123456789012.dkr.ecr.eu-central-1.amazonaws.com/complytude/api@sha256:complytude-api-abc123"
check "sidecar image untouched" test \
  "$(registered 0 '.containerDefinitions[] | select(.name=="gotenberg") | .image')" = "gotenberg/gotenberg:8"
check "secrets and sizing kept" test \
  "$(registered 0 '[.containerDefinitions[0].secrets[0].name, .cpu, .memory] | join(",")')" = "DB_HOST,512,1024"
check "read-only fields stripped" test \
  "$(registered 0 '[has("taskDefinitionArn"), has("revision"), has("status"), has("registeredAt")] | any')" = "false"
check "each service pointed at its new revision" \
  grep -q "ecs update-service --cluster complytude-staging --service complytude-staging-worker-ai --task-definition arn:aws:ecs:eu-central-1:123456789012:task-definition/complytude-staging-worker-ai:9" "$WORK/stub/calls.log"

# 2. Rolling back is the same command with an older SHA
check "rollback to an older SHA succeeds" run_deploy old999 COMPLETED
check "rollback pins the older SHA's digest" test \
  "$(registered 3 '.containerDefinitions[0].image')" = \
  "123456789012.dkr.ecr.eu-central-1.amazonaws.com/complytude/worker-generation@sha256:complytude-worker-generation-old999"

# 3. A deployment the circuit breaker rolled back fails the command
if run_deploy bad000 FAILED; then deploy_failed=no; else deploy_failed=yes; fi
check "a FAILED rollout fails the deploy" test "$deploy_failed" = yes
check "and says the circuit breaker rolled it back" grep -q "circuit breaker rolled it back" "$WORK/stub/out.log"

# 4. A deployment that never settles fails after the timeout
if run_deploy slow111 IN_PROGRESS; then slow_failed=no; else slow_failed=yes; fi
check "a rollout that never completes fails" test "$slow_failed" = yes

if (( failures > 0 )); then
  echo "${failures} check(s) failed"
  exit 1
fi
echo "All checks passed"
