#!/usr/bin/env bash
# Deploys (or rolls back to) one git SHA on every ECS service of an environment.
#
#   scripts/deploy/ecs-deploy.sh --env staging --sha <git-sha> [--smoke https://api-staging.example.com]
#
# For each app it resolves the image digest that <sha> was pushed as, registers a new revision of
# the service's task definition (the family's latest, so Terraform's environment and secrets are
# kept) with only the app container's image changed to repo@digest, and points the service at it.
# It then waits for every deployment to finish: exit 0 when all reach rolloutState COMPLETED,
# exit 1 when any reports FAILED (the circuit breaker rolled it back) or the wait times out.
# Rolling back is the same command with an earlier SHA.
set -euo pipefail

ENVIRONMENT=""
SHA=""
SMOKE_URL=""
PROJECT="${PROJECT:-complytude}"
APPS="${APPS:-api worker-ai worker-ingestion worker-generation}"
TIMEOUT_SECONDS="${TIMEOUT_SECONDS:-1200}"
POLL_SECONDS="${POLL_SECONDS:-15}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env) ENVIRONMENT="$2"; shift 2 ;;
    --sha) SHA="$2"; shift 2 ;;
    --smoke) SMOKE_URL="$2"; shift 2 ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

if [[ -z "$ENVIRONMENT" || -z "$SHA" ]]; then
  echo "Usage: $0 --env <staging|production> --sha <git-sha> [--smoke <api-base-url>]" >&2
  exit 2
fi

CLUSTER="${PROJECT}-${ENVIRONMENT}"
# Parallel arrays (macOS ships bash 3.2, without associative arrays)
SERVICES=()
REVISIONS=()

for app in $APPS; do
  repo="${PROJECT}/${app}"
  service="${PROJECT}-${ENVIRONMENT}-${app}"

  digest=$(aws ecr describe-images --repository-name "$repo" \
    --image-ids "imageTag=${SHA}" \
    --query 'imageDetails[0].imageDigest' --output text)
  if [[ -z "$digest" || "$digest" == "None" ]]; then
    echo "No ${repo} image tagged ${SHA}" >&2
    exit 1
  fi
  repo_uri=$(aws ecr describe-repositories --repository-names "$repo" \
    --query 'repositories[0].repositoryUri' --output text)
  image="${repo_uri}@${digest}"

  current=$(aws ecs describe-task-definition --task-definition "$service" \
    --query 'taskDefinition')
  if ! jq -e --arg c "$app" 'any(.containerDefinitions[]; .name == $c)' \
    <<<"$current" >/dev/null; then
    echo "Task definition ${service} has no container named ${app}" >&2
    exit 1
  fi
  # Only the app container changes; sidecars (Gotenberg) and everything Terraform set stay
  rendered=$(jq --arg c "$app" --arg image "$image" '
    .containerDefinitions |= map(if .name == $c then .image = $image else . end)
    | del(.taskDefinitionArn, .revision, .status, .requiresAttributes,
          .compatibilities, .registeredAt, .registeredBy, .deregisteredAt)' \
    <<<"$current")

  arn=$(aws ecs register-task-definition --cli-input-json "$rendered" \
    --query 'taskDefinition.taskDefinitionArn' --output text)
  aws ecs update-service --cluster "$CLUSTER" --service "$service" \
    --task-definition "$arn" >/dev/null
  echo "${service}: deploying ${image} as ${arn}"
  SERVICES+=("$service")
  REVISIONS+=("$arn")
done

deadline=$(( $(date +%s) + TIMEOUT_SECONDS ))
failed=0
for i in "${!SERVICES[@]}"; do
  service="${SERVICES[$i]}"
  arn="${REVISIONS[$i]}"
  while :; do
    state=$(aws ecs describe-services --cluster "$CLUSTER" --services "$service" \
      --query "services[0].deployments[?taskDefinition=='${arn}'] | [0].rolloutState" \
      --output text)
    case "$state" in
      COMPLETED) echo "${service}: deployed"; break ;;
      FAILED)
        echo "${service}: deployment FAILED; the circuit breaker rolled it back" >&2
        failed=1; break ;;
    esac
    if (( $(date +%s) > deadline )); then
      echo "${service}: still ${state} after ${TIMEOUT_SECONDS}s" >&2
      failed=1; break
    fi
    sleep "$POLL_SECONDS"
  done
done

if (( failed )); then
  exit 1
fi

if [[ -n "$SMOKE_URL" ]]; then
  curl --fail --silent --show-error --retry 5 --retry-delay 5 --retry-all-errors \
    "${SMOKE_URL%/}/api/health" >/dev/null
  echo "Smoke test passed: ${SMOKE_URL%/}/api/health"
fi

echo "All services run ${SHA}"
