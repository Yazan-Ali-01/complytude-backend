#!/usr/bin/env bash
# Fails if any existing migration was modified, renamed or deleted since <base> (only new files may
# be added). Applied migrations are never edited: a change goes in a new numbered file.
#
#   scripts/check-migrations-append-only.sh <base-ref-or-sha>
set -euo pipefail

BASE="${1:?usage: $0 <base-ref-or-sha>}"
DIR="scripts/migrations"

changes=$(git diff --name-status --no-renames "${BASE}...HEAD" -- "$DIR")
edited=$(awk '$1 != "A" { print }' <<<"$changes")

if [[ -n "$edited" ]]; then
  echo "Existing migrations were changed (only new files may be added under ${DIR}):" >&2
  echo "$edited" >&2
  exit 1
fi
added=$(awk '$1 == "A"' <<<"$changes" | grep -c . || true)
echo "Migrations append-only: OK (${added} added since ${BASE})"
