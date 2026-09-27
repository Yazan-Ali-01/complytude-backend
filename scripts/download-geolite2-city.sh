#!/usr/bin/env bash
#
# Download MaxMind GeoLite2-City database for session geo enrichment.
#
# Prerequisites:
#   1. MaxMind account: https://www.maxmind.com/en/geolite2/signup
#   2. License key: https://www.maxmind.com/en/accounts/current/license-key
#
# Usage:
#   MAXMIND_LICENSE_KEY=your_key ./scripts/download-geolite2-city.sh
#   Or: export MAXMIND_LICENSE_KEY=your_key && ./scripts/download-geolite2-city.sh
#
# Output: ./data/GeoLite2-City.mmdb (or MAXMIND_DB_PATH if set)
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DB_PATH="${MAXMIND_DB_PATH:-$PROJECT_ROOT/data/GeoLite2-City.mmdb}"
OUTPUT_DIR="$(dirname "$DB_PATH")"

if [[ -z "${MAXMIND_LICENSE_KEY:-}" ]]; then
  echo "Error: MAXMIND_LICENSE_KEY is required." >&2
  echo "Get a free key at https://www.maxmind.com/en/geolite2/signup" >&2
  echo "Usage: MAXMIND_LICENSE_KEY=your_key $0" >&2
  exit 1
fi

mkdir -p "$OUTPUT_DIR"
TEMP_DIR="$(mktemp -d)"
trap "rm -rf '$TEMP_DIR'" EXIT

echo "Downloading GeoLite2-City..."
curl -sS -o "$TEMP_DIR/GeoLite2-City.tar.gz" \
  "https://download.maxmind.com/app/geoip_download?edition_id=GeoLite2-City&license_key=${MAXMIND_LICENSE_KEY}&suffix=tar.gz"

echo "Extracting..."
tar -xzf "$TEMP_DIR/GeoLite2-City.tar.gz" -C "$TEMP_DIR"

# Path format: GeoLite2-City_YYYYMM01/GeoLite2-City.mmdb
EXTRACTED_DIR="$(find "$TEMP_DIR" -maxdepth 1 -type d -name "GeoLite2-City_*" 2>/dev/null | head -1)"
if [[ -z "$EXTRACTED_DIR" ]] || [[ ! -f "$EXTRACTED_DIR/GeoLite2-City.mmdb" ]]; then
  echo "Error: Could not find GeoLite2-City.mmdb in archive." >&2
  exit 1
fi

mv "$EXTRACTED_DIR/GeoLite2-City.mmdb" "$DB_PATH"

echo "Done. Database saved to: $DB_PATH"
echo "Set in .env: MAXMIND_DB_PATH=$DB_PATH"
