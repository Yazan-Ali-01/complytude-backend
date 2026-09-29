#!/usr/bin/env bash
# Fails when the ECR scan of an app image has CRITICAL findings (HIGH are reported, not fatal:
# the Alpine/Node base image carries some the team can't fix per build).
#
#   scripts/deploy/ecr-scan-gate.sh <repository> <tag>
set -euo pipefail

REPOSITORY="$1"
TAG="$2"
FAIL_ON="${FAIL_ON:-CRITICAL}"

aws ecr wait image-scan-complete --repository-name "$REPOSITORY" \
  --image-id "imageTag=${TAG}"
counts=$(aws ecr describe-image-scan-findings --repository-name "$REPOSITORY" \
  --image-id "imageTag=${TAG}" \
  --query 'imageScanFindings.findingSeverityCounts' --output json)
if [[ "$counts" == "null" ]]; then
  counts='{}'
fi
echo "${REPOSITORY}:${TAG} scan findings: ${counts}"

blocking=0
for severity in $FAIL_ON; do
  count=$(jq --arg s "$severity" '.[$s] // 0' <<<"$counts")
  if (( count > 0 )); then
    echo "${REPOSITORY}:${TAG} has ${count} ${severity} findings" >&2
    blocking=1
  fi
done
exit "$blocking"
