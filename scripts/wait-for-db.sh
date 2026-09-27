#!/bin/bash

max_attempts=30
attempt=0

while [ $attempt -lt $max_attempts ]; do
    if docker exec complytude-postgres pg_isready -U postgres > /dev/null 2>&1; then
        echo "✅ Database is ready"
        exit 0
    fi
    attempt=$((attempt + 1))
    if [ $attempt -eq 1 ] || [ $((attempt % 5)) -eq 0 ]; then
        echo "⏳ Waiting for database... ($attempt/$max_attempts)"
    fi
    sleep 1
done

echo "❌ Database failed to become ready after ${max_attempts} seconds"
echo "Try running: pnpm services:up"
exit 1

