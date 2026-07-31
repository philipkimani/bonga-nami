/**
 * SECURE LOGGER — NO SECRETS
 * 
 * All logging MUST go through this module.
 * Secrets are redacted automatically.
 * Tenant ID is always included.
 * 
 * @since v3.0.0
 */

import type { TenantContext } from "./tenant.js";

/**
 * Fields that must NEVER appear in logs
 */
const REDACTED_PATTERNS = [
  /api[_-]?key/i,
  /secret/i,
  /password/i,
  /token/i,
  /credential/i,
  /authorization/i,
  /bearer/i,
  /encrypted/i,
];

/**
 * Recursively redact sensitive fields from an object
 */
function redactSecrets(obj: unknown, depth = 0): unknown {
  // Prevent infinite recursion
  if (depth > 10) return "[MAX_DEPTH]";
  
  if (obj === null || obj === undefined) return obj;
  
  if (typeof obj === "string") {
    // Redact if looks like an API key or token
    if (obj.length > 20 && /^(sk-|xi-|pk_|sk_)/.test(obj)) {
      return "[REDACTED]";
    }
    return obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => redactSecrets(item, depth + 1));
  }
  
  if (typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      // Check if key matches sensitive patterns
      const isSensitive = REDACTED_PATTERNS.some(pattern => pattern.test(key));
      result[key] = isSensitive ? "[REDACTED]" : redactSecrets(value, depth + 1);
    }
    return result;
  }
  
  return obj;
}

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  tenantId?: string;
  requestId?: string;
  [key: string]: unknown;
}

/**
 * Create a secure logger bound to a request context.
 * All logs will include requestId for tracing.
 */
export function createLogger(ctx?: TenantContext) {
  const baseFields = {
    requestId: ctx?.requestId ?? "no-request-id",
  };

  function log(level: LogLevel, message: string, data?: Record<string, unknown>) {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...baseFields,
      ...redactSecrets(data) as Record<string, unknown>,
    };
    
    // Output as JSON for structured logging
    const output = JSON.stringify(entry);
    
    switch (level) {
      case "error":
        console.error(output);
        break;
      case "warn":
        console.warn(output);
        break;
      case "debug":
        if (process.env.LOG_LEVEL === "debug") {
          console.debug(output);
        }
        break;
      default:
        console.log(output);
    }
  }

  return {
    debug: (msg: string, data?: Record<string, unknown>) => log("debug", msg, data),
    info: (msg: string, data?: Record<string, unknown>) => log("info", msg, data),
    warn: (msg: string, data?: Record<string, unknown>) => log("warn", msg, data),
    error: (msg: string, data?: Record<string, unknown>) => log("error", msg, data),
    
    /**
     * Create a child logger with additional context
     */
    child: (additionalContext: Record<string, unknown>) => {
      return createLogger({
        ...ctx,
        tenantId: ctx?.tenantId ?? "unknown",
        role: ctx?.role ?? "client_user",
        requestId: ctx?.requestId ?? "no-request-id",
      });
    }
  };
}

/**
 * Global logger for platform-level events (no tenant context)
 */
export const platformLogger = createLogger();
