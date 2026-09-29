#!/usr/bin/env bash
# Smoke test of a built production image, run by CI before an image can ship:
#   1. every package the app's bundle requires loads inside the image;
#   2. the image boots as ECS runs it (NODE_ENV=production, TLS to Postgres verified against a CA,
#      Redis) and its health endpoint answers 200.
# Postgres (with a throwaway CA) and Redis run on a private Docker network and are removed at the
# end. Roles and migrations are applied from this checkout, so it needs psql and `pnpm install`.
# It never reads apps/api/.env: safe to run locally next to a dev database.
#
# Usage: scripts/ci/smoke-image.sh <api|worker-ai|worker-ingestion|worker-generation> <image>
set -euo pipefail

app=${1:?app}
image=${2:?image}
case $app in
  api) port=3000 health=/api/health/ready ;;
  worker-ai) port=3001 health=/health ;;
  worker-ingestion) port=3002 health=/health ;;
  worker-generation) port=3003 health=/health ;;
  *) echo "Unknown app: $app" >&2; exit 2 ;;
esac

name="smoke-$app-$$"
work=$(mktemp -d)
cleanup() {
  local status=$?
  if [ "$status" -ne 0 ] && docker inspect "$name-app" >/dev/null 2>&1; then
    echo "--- $app logs"
    docker logs --tail 60 "$name-app" 2>&1 || true
  fi
  docker rm -f "$name-app" "$name-db" "$name-redis" >/dev/null 2>&1 || true
  docker network rm "$name" >/dev/null 2>&1 || true
  rm -rf "$work"
  exit "$status"
}
trap cleanup EXIT

echo "== $app: packages the bundle requires"
docker run --rm -i --entrypoint node "$image" - "dist/apps/$app" < scripts/ci/check-bundle-requires.js

echo "== $app: database and Redis"
# Production verifies the database server certificate, so the server gets one from its own CA
openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj /CN=smoke-ca \
  -keyout "$work/ca.key" -out "$work/ca.crt" 2>/dev/null
openssl req -newkey rsa:2048 -nodes -subj /CN=db \
  -keyout "$work/server.key" -out "$work/server.csr" 2>/dev/null
printf 'subjectAltName=DNS:db\n' > "$work/san.ext"
openssl x509 -req -in "$work/server.csr" -CA "$work/ca.crt" -CAkey "$work/ca.key" -CAcreateserial \
  -days 1 -extfile "$work/san.ext" -out "$work/server.crt" 2>/dev/null
chmod 644 "$work"/*

docker network create "$name" >/dev/null
docker run -d --name "$name-db" --network "$name" --network-alias db -p 127.0.0.1::5432 \
  -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=complytude -v "$work:/certs:ro" \
  pgvector/pgvector:pg16 bash -c 'install -o postgres -m 600 /certs/server.key /certs/server.crt /tmp/ &&
    exec docker-entrypoint.sh postgres -c ssl=on -c ssl_cert_file=/tmp/server.crt -c ssl_key_file=/tmp/server.key' \
  >/dev/null
docker run -d --name "$name-redis" --network "$name" --network-alias redis redis:7-alpine >/dev/null

db_port=$(docker port "$name-db" 5432/tcp | head -1 | sed 's/.*://')
export PGPASSWORD=postgres
for _ in $(seq 1 60); do
  psql -h 127.0.0.1 -p "$db_port" -U postgres -d complytude -tAc 'SELECT 1' >/dev/null 2>&1 && break
  sleep 1
done

app_password=$(openssl rand -hex 16)
psql -h 127.0.0.1 -p "$db_port" -U postgres -d postgres -v ON_ERROR_STOP=1 -q \
  -v app_user=app_login -v app_password="$app_password" -v db_name=complytude \
  -f scripts/setup-app-user-role.sql >/dev/null
DB_HOST=127.0.0.1 DB_PORT=$db_port DB_NAME=complytude DB_USER=postgres DB_PASSWORD=postgres \
  pnpm exec ts-node --transpile-only scripts/migrate.ts >/dev/null

echo "== $app: boot"
secret() { openssl rand -hex 24; }
cat > "$work/app.env" <<EOF
DB_HOST=db
DB_PORT=5432
DB_NAME=complytude
DB_APP_USER=app_login
DB_APP_PASSWORD=$app_password
DB_SSL_ENABLED=true
DB_SSL_CA_PATH=/smoke/ca.crt
REDIS_HOST=redis
REDIS_PORT=6379
FRONTEND_URL=https://app.example.com
CORS_ORIGINS=https://app.example.com
TRUST_PROXY_HOPS=1
JWT_ACCESS_SECRET=$(secret)
JWT_REFRESH_SECRET=$(secret)
JWT_IDENTITY_SECRET=$(secret)
JWT_IDENTITY_REFRESH_SECRET=$(secret)
STRIPE_MODE=test
STRIPE_SECRET_KEY=sk_test_$(secret)
STRIPE_PUBLISHABLE_KEY=pk_test_$(secret)
STRIPE_WEBHOOK_SECRET=whsec_$(secret)
BULL_BOARD_ADMIN_SECRET=$(secret)
FROM_EMAIL=noreply@example.com
SUPPORT_EMAIL=support@example.com
OPENAI_API_KEY=sk-smoke-$(secret)
COHERE_API_KEY=smoke-$(secret)
GOTENBERG_URL=http://gotenberg.invalid:3000
EOF
docker run -d --name "$name-app" --network "$name" -p "127.0.0.1::$port" \
  -v "$work/ca.crt:/smoke/ca.crt:ro" --env-file "$work/app.env" "$image" >/dev/null
app_port=$(docker port "$name-app" "$port/tcp" | head -1 | sed 's/.*://')

for _ in $(seq 1 90); do
  if [ "$(docker inspect -f '{{.State.Running}}' "$name-app")" != true ]; then
    echo "$app exited during boot" >&2
    exit 1
  fi
  if curl -fsS "http://127.0.0.1:$app_port$health" >/dev/null 2>&1; then
    echo "$app is up: GET $health answered 200"
    exit 0
  fi
  sleep 2
done
echo "$app did not answer GET $health with 200 within 3 minutes" >&2
exit 1
