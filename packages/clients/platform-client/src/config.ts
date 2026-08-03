/**
 * Platform Client Configuration — Infrastructure Only
 * 
 * This file contains ONLY infrastructure-level configuration that is the same
 * across all client deployments. All business-level configuration (industry,
 * channels, credentials) is managed through the Admin Console and stored in
 * the platform settings (via admin-config.ts).
 * 
 * PaaS ARCHITECTURE:
 * - Environment variables = Infrastructure (PORT, DATABASE_URL, NODE_ENV)
 * - Platform Settings (DB) = Business logic (Industry, Channels, Credentials)
 * 
 * DEPLOYMENT MODEL: Single-Tenant Instances
 * - Each client gets their own server, DB, Twilio account
 * - Full data isolation for Kenya DPA 2019 compliance
 * - Client is data controller, Ruskins is software vendor
 */

// ============================================================================
// INFRASTRUCTURE CONFIG — Set by deployment platform (Railway, etc.)
// ============================================================================

export const infraConfig = {
  // Server
  port: Number(process.env.PORT ?? 3001),
  host: process.env.HOST ?? "0.0.0.0",
  nodeEnv: process.env.NODE_ENV ?? "development",
  
  // Database
  databaseUrl: process.env.DATABASE_URL ?? "",
  
  // Redis (optional, for caching/sessions)
  redisUrl: process.env.REDIS_URL ?? "",
  
  // Logging
  logLevel: process.env.LOG_LEVEL ?? "info",
  
  // CORS (comma-separated origins)
  corsOrigins: process.env.CORS_ORIGINS?.split(",") ?? [
    'http://localhost:3000',
    'http://localhost:3001',
  ],
};

// ============================================================================
// TENANT ID — Deployment label (logging only)
// ============================================================================

/**
 * Tenant ID is a LABEL for this deployment, used only for:
 * - Log identification (which deployment generated this log)
 * - Database record key (though only one exists per deployment)
 * 
 * It is NOT a security boundary. Each deployment is isolated by infrastructure
 * (own server, own DB, own Twilio), not by database WHERE clauses.
 * 
 * Defaults to "default" - only change if you need to distinguish deployments
 * in centralized logging.
 */
export const tenantId = process.env.TENANT_ID || "default";

// ============================================================================
// STARTUP LOGGING
// ============================================================================

// Minimal startup log - no business config here
if (process.env.NODE_ENV !== "test") {
  console.log(`[config] Infrastructure loaded: PORT=${infraConfig.port}, ENV=${infraConfig.nodeEnv}`);
}
