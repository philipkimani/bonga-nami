# ============================================================================
# Bonga Nami — Platform Client Dockerfile
# ============================================================================
# 
# ARCHITECTURE: True PaaS
#   - Same container for ALL clients
#   - TENANT_ID env var identifies the deployment
#   - All business config done via Admin Console (/admin)
#
# DEPLOYMENT (Railway): 
#   1. New Project → Deploy from GitHub
#   2. Set Root Directory to: packages/clients/platform-client
#   3. Set TENANT_ID env var to client name (e.g., "shopkenya")
#   4. Deploy, then configure via Admin Console
#
# FIRST BOOT:
#   Go to /admin and configure:
#   - Industry (e-commerce, hospitality, healthcare, etc.)
#   - ElevenLabs API Key and Agent ID
#   - Twilio credentials (if using voice/SMS)
#   - Backend API URL
#
# ============================================================================

FROM node:20-slim

RUN npm install -g pnpm@10

WORKDIR /app

# Since Root Directory is set to this client folder,
# we need to copy from the monorepo root (3 levels up in context)
# Railway provides the full repo, Root Directory just sets working dir for config

# Copy workspace files from repo root
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY tsconfig.base.json tsconfig.json ./

# Copy all package.json files for dependency resolution
COPY packages/core/package.json ./packages/core/
COPY packages/clients/platform-client/package.json ./packages/clients/platform-client/
COPY packages/extensions/ecommerce/package.json ./packages/extensions/ecommerce/
COPY packages/extensions/hotel/package.json ./packages/extensions/hotel/
COPY packages/extensions/payments/package.json ./packages/extensions/payments/
COPY packages/extensions/voice/package.json ./packages/extensions/voice/
COPY packages/extensions/knowledge-base/package.json ./packages/extensions/knowledge-base/
COPY packages/extensions/whatsapp/package.json ./packages/extensions/whatsapp/
COPY packages/extensions/upsell/package.json ./packages/extensions/upsell/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY packages/core ./packages/core
COPY packages/extensions ./packages/extensions
COPY packages/clients/platform-client ./packages/clients/platform-client

# Build this client and dependencies only
RUN pnpm -r --sort --filter=@platform/client... build

# Verify build
RUN ls -la packages/clients/platform-client/dist/

ENV PORT=3000
ENV NODE_ENV=production
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

CMD ["node", "packages/clients/platform-client/dist/server.js"]

