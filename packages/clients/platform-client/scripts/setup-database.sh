#!/bin/sh
# ============================================================================
# Bonga Nami — Database Setup Script (One-Time Onboarding)
# ============================================================================
#
# RUN THIS ONCE per client during onboarding, NOT on every container restart.
#
# Usage:
#   DATABASE_URL="postgresql://..." ./scripts/setup-database.sh
#
# Or via npm:
#   DATABASE_URL="postgresql://..." pnpm run db:setup
#
# This script:
# 1. Validates the DATABASE_URL
# 2. Creates all tables from schema.prisma
# 3. Verifies the setup was successful
#
# ============================================================================

set -e

echo "============================================================"
echo "  📦 Bonga Nami - Database Setup"
echo "============================================================"
echo ""

# Validate DATABASE_URL
if [ -z "$DATABASE_URL" ]; then
  echo "❌ ERROR: DATABASE_URL environment variable is required"
  echo ""
  echo "Usage:"
  echo "  DATABASE_URL=\"postgresql://user:pass@host/db\" ./scripts/setup-database.sh"
  echo ""
  exit 1
fi

if ! echo "$DATABASE_URL" | grep -qE "^postgres(ql)?://"; then
  echo "❌ ERROR: DATABASE_URL must start with postgresql:// or postgres://"
  echo "   Got: ${DATABASE_URL:0:30}..."
  exit 1
fi

echo "✅ DATABASE_URL validated"
echo ""

# Run Prisma db push
echo "🔧 Creating database schema..."
echo ""

npx prisma db push --accept-data-loss=false

echo ""
echo "✅ Database schema created successfully!"
echo ""

# Verify by checking if PlatformSettings table exists
echo "🔍 Verifying setup..."

node -e "
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  prisma.\$queryRawUnsafe('SELECT COUNT(*) FROM \"PlatformSettings\"')
    .then(() => { 
      console.log('✅ Database verification passed');
      prisma.\$disconnect();
      process.exit(0);
    })
    .catch((e) => { 
      console.error('❌ Verification failed:', e.message);
      prisma.\$disconnect();
      process.exit(1);
    });
"

echo ""
echo "============================================================"
echo "  ✅ Database setup complete!"
echo "============================================================"
echo ""
echo "Next steps:"
echo "  1. Deploy to Railway (database is ready)"
echo "  2. Container will start instantly (no DB setup needed)"
echo ""
