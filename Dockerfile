# ============================================================================
# Bonga Nami — Production Dockerfile
# ============================================================================
# 
# ARCHITECTURE:
# - Same container for ALL clients
# - TENANT_ID env var identifies the deployment
# - ALL business config is done via Admin Console (/admin)
#
# First Boot:
#   1. Deploy to Railway/Docker
#   2. Set TENANT_ID and DATABASE_URL env vars
#   3. Go to /admin to configure everything else:
#      - Industry (e-commerce, hospitality, healthcare, etc.)
#      - ElevenLabs API Key and Agent ID
#      - Twilio credentials (if using voice/SMS)
#      - Backend API URL
#
# ============================================================================

FROM node:20-alpine

WORKDIR /app

# Install OpenSSL and libc6-compat (required for Prisma on Alpine)
RUN apk add --no-cache openssl libc6-compat

# Install pnpm
RUN npm install -g pnpm

# Copy workspace files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY tsconfig.base.json tsconfig.json ./

# Copy all package.json files for dependency resolution
COPY packages/core/package.json ./packages/core/
COPY packages/clients/platform-client/package.json ./packages/clients/platform-client/
COPY packages/extensions/payments/package.json ./packages/extensions/payments/
COPY packages/extensions/voice/package.json ./packages/extensions/voice/
COPY packages/extensions/knowledge-base/package.json ./packages/extensions/knowledge-base/
COPY packages/extensions/whatsapp/package.json ./packages/extensions/whatsapp/

# Copy Prisma schema for client generation
COPY packages/clients/platform-client/prisma ./packages/clients/platform-client/prisma/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Force cache bust for prisma generate and build steps
ARG CACHEBUST=3

# Generate Prisma client (must run after install, before build)
RUN cd packages/clients/platform-client && npx prisma generate

# Copy source code
COPY packages ./packages

# Build all packages
RUN pnpm build

# Build the admin console React app
RUN cd packages/clients/platform-client/src/ui/admin-console-react && npm install && npm run build

# Copy startup script and make executable
COPY packages/clients/platform-client/scripts/start.sh /app/start.sh
RUN chmod +x /app/start.sh

# Expose port
ENV PORT=3000
ENV NODE_ENV=production
EXPOSE 3000

# Health check - instant startup, no grace period needed
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Start via startup script (handles DB migrations automatically)
CMD ["/app/start.sh"]
