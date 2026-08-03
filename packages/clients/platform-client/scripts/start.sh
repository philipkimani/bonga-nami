#!/bin/sh
# ============================================================================
# Ruskins AI Platform — Production Startup Script
# ============================================================================
#
# RUNTIME ONLY - No database operations
#
# This script does ONE thing: start the Node.js server.
# Database schema setup is handled separately during client onboarding.
#
# ENTERPRISE ARCHITECTURE:
# - Onboarding: Run `pnpm run db:setup` once per client
# - Runtime: Instant server startup (<1 second)
# - Scalable: 100s of clients, zero startup overhead
#
# ============================================================================

echo "============================================================"
echo "  🚀 Ruskins AI Platform - Starting..."
echo "============================================================"

# Start the server immediately - no database operations
exec node /app/packages/clients/platform-client/dist/server.js
