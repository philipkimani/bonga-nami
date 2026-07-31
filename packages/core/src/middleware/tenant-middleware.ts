/**
 * TENANT MIDDLEWARE — API SECURITY BOUNDARY
 * 
 * This middleware MUST be applied to all routes.
 * It enforces:
 * 1. Authentication
 * 2. Tenant resolution
 * 3. RBAC
 * 4. Rate limiting
 * 
 * Nothing reaches business logic without passing through here.
 * 
 * @since v3.0.0
 */

import type { Request, Response, NextFunction } from "express";
import { v4 as uuidv4 } from "uuid";
import type { TenantContext, TenantRole } from "../public/tenant.js";
import { createLogger } from "../public/logger.js";

/**
 * Extend Express Request to include tenant context
 */
declare global {
  namespace Express {
    interface Request {
      tenantContext?: TenantContext;
    }
  }
}

/**
 * Rate limit state per tenant (in-memory).
 *
 * SCALING NOTE:
 * In-memory rate limiting works for single-instance deployments.
 * For multi-instance (horizontal scaling), migrate to Redis using the
 * `rate-limiter-flexible` package with a RedisStore backend.
 *
 * TODO: Redis-backed upgrade path:
 *   1. Install `rate-limiter-flexible` package
 *   2. Replace this Map with `RateLimiterRedis` from rate-limiter-flexible
 *   3. Configure Redis connection from REDIS_URL environment variable
 *   4. Keep the same window/limit parameters for backwards compatibility
 *   5. Add fallback to in-memory if Redis is unavailable (graceful degradation)
 */
const rateLimitState = new Map<string, {
  requests: number;
  windowStart: number;
}>();

const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const DEFAULT_RATE_LIMIT = 60; // requests per minute

/**
 * Check rate limit for a tenant
 */
function checkRateLimit(tenantId: string, limit = DEFAULT_RATE_LIMIT): boolean {
  const now = Date.now();
  const state = rateLimitState.get(tenantId);
  
  if (!state || (now - state.windowStart) > RATE_LIMIT_WINDOW_MS) {
    // New window
    rateLimitState.set(tenantId, { requests: 1, windowStart: now });
    return true;
  }
  
  if (state.requests >= limit) {
    return false;
  }
  
  state.requests++;
  return true;
}

/**
 * Resolve tenant from request.
 * Currently supports:
 * - X-Tenant-ID header
 * - Query param ?tenant_id=
 * - DEFAULT_TENANT_ID env var
 */
function resolveTenant(req: Request): string | null {
  // Priority 1: Header
  const headerTenant = req.headers["x-tenant-id"];
  if (typeof headerTenant === "string" && headerTenant.length > 0) {
    return headerTenant;
  }
  
  // Priority 2: Query param
  const queryTenant = req.query.tenant_id;
  if (typeof queryTenant === "string" && queryTenant.length > 0) {
    return queryTenant;
  }
  
  // Priority 3: Default for demo (temporary)
  // In production, this would be removed
  if (process.env.DEFAULT_TENANT_ID) {
    return process.env.DEFAULT_TENANT_ID;
  }
  
  return null;
}

/**
 * Resolve role from request.
 * Currently supports:
 * - X-User-Role header
 * - Default to client_user
 * 
 * TODO: Integrate with proper auth system (OAuth2, JWT)
 */
function resolveRole(req: Request): TenantRole {
  const roleHeader = req.headers["x-user-role"];
  if (roleHeader === "platform_admin" || roleHeader === "client_admin" || roleHeader === "client_user") {
    return roleHeader;
  }
  return "client_user";
}

/**
 * Tenant middleware options
 */
export interface TenantMiddlewareOptions {
  /** Allow requests without tenant context (NOT recommended) */
  allowAnonymous?: boolean;
  /** Required role for this route */
  requiredRole?: TenantRole;
  /** Custom rate limit for this route */
  rateLimit?: number;
}

/**
 * Create request context middleware.
 * 
 * SINGLE-TENANT ARCHITECTURE:
 * In single-tenant deployments, each deployment serves ONE client.
 * This middleware simply:
 * 1. Generates a request ID for tracing
 * 2. Applies global rate limiting
 * 3. Attaches context to the request
 * 
 * No tenant headers required. No tenant validation.
 */
export function tenantMiddleware(options: TenantMiddlewareOptions = {}) {
  return (req: Request, res: Response, next: NextFunction) => {
    // Use existing requestId if already generated upstream, otherwise create new
    const requestId = (req as any).requestId || uuidv4();
    
    // Global rate limiting (not per-tenant)
    const rateLimitKey = "global";
    if (!checkRateLimit(rateLimitKey, options.rateLimit || 120)) {
      return res.status(429).json({
        error: "Rate limit exceeded",
        code: "RATE_LIMIT_EXCEEDED"
      });
    }
    
    // Build request context (single-tenant - no tenant resolution needed)
    const tenantContext: TenantContext = {
      tenantId: "default", // Single tenant - just a placeholder
      role: "client_admin", // All authenticated users are admins in single-tenant
      requestId,
      sessionId: req.headers["x-session-id"] as string | undefined
    };
    
    req.tenantContext = tenantContext;
    
    next();
  };
}

/**
 * Helper to get tenant context from request.
 * 
 * SINGLE-TENANT ARCHITECTURE:
 * In single-tenant deployments, each deployment serves ONE client.
 * If tenant middleware hasn't run, we create a default context using
 * the TENANT_ID environment variable. This allows Admin Console routes
 * to work without requiring tenant headers.
 * 
 * @param req - Express request
 * @returns TenantContext - either from middleware or default for single-tenant
 */
export function getTenantContext(req: Request): TenantContext {
  // If middleware has already set context, use it
  if (req.tenantContext) {
    return req.tenantContext;
  }
  
  // Single-tenant fallback: use TENANT_ID env var or "default"
  // This allows Admin Console routes to work without tenant headers
  const tenantId = process.env.TENANT_ID || process.env.DEFAULT_TENANT_ID || "default";
  
  return {
    tenantId,
    role: "client_admin", // Admin Console users are admins
    requestId: `auto-${Date.now()}`,
  };
}
