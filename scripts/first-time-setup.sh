#!/bin/bash
set -e

echo "🚀 Complytude First-Time Setup"
echo "================================"
echo ""

# Start services
echo "📦 Starting services (PostgreSQL + Redis)..."
pnpm services:up || exit 1

echo ""
echo "⏳ Waiting for database to be ready..."
bash scripts/wait-for-db.sh || exit 1

echo ""
echo "📊 Running database migrations..."
pnpm db:migrate || exit 1

echo ""
echo "✅ Setup complete!"
echo ""
echo "🎯 Next Steps:"
echo ""
echo "  1. Start development:"
echo "     pnpm dev"
echo ""
echo "  2. Visit your application:"
echo "     • API: http://localhost:3000/api"
echo "     • Docs: http://localhost:3000/docs"
echo ""
echo "  3. Run tests:"
echo "     pnpm test:e2e"
echo ""
echo "📚 For more commands, run: pnpm run"
echo ""

