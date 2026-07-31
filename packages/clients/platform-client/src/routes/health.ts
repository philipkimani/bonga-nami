/**
 * Health Check Routes - Production-Grade
 * 
 * Provides comprehensive health information for:
 * - Railway/Kubernetes health probes
 * - Load balancer health checks
 * - Monitoring and alerting systems
 * - Debugging deployment issues
 * 
 * Endpoints:
 * - GET /health       - Basic liveness check (for load balancers)
 * - GET /health/ready - Readiness check (are all dependencies up?)
 * - GET /health/live  - Liveness check (is the process alive?)
 * - GET /health/info  - Detailed system information
 */

import { Router } from "express";
import { infraConfig, tenantId } from "../config.js";
import { getPlatformConfig } from "./admin-config.js";
import { getRedisStatus, getCacheHitRate } from "../services/redis.js";

export const healthRouter = Router();

// Track startup time
const startupTime = new Date();
let isReady = false;
let startupError: Error | null = null;
const componentStatus: Record<string, { status: "up" | "down" | "degraded"; message?: string; lastCheck?: Date }> = {};

/**
 * Mark the application as ready (called after all routes are loaded)
 */
export function markReady() {
  isReady = true;
  console.log(`[health] ✅ Application marked as ready after ${Date.now() - startupTime.getTime()}ms`);
}

/**
 * Mark a startup error (called if initialization fails)
 */
export function markStartupError(error: Error) {
  startupError = error;
  isReady = false;
  console.error(`[health] ❌ Startup error:`, error.message);
}

/**
 * Update component health status
 */
export function updateComponentStatus(
  component: string, 
  status: "up" | "down" | "degraded", 
  message?: string
) {
  componentStatus[component] = { status, message, lastCheck: new Date() };
}

/**
 * GET /health
 * 
 * Basic health check - returns 200 if server is responding.
 * Used by Railway/load balancers for initial probe.
 */
healthRouter.get("/", (_req, res) => {
  // If there was a startup error, report it
  if (startupError) {
    res.status(503).json({
      status: "error",
      error: startupError.message,
      stack: process.env.NODE_ENV === "development" ? startupError.stack : undefined,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
    return;
  }

  // Basic health - just confirms the server is responding
  res.json({
    status: "ok",
    ready: isReady,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /health/ready
 * 
 * Readiness probe - returns 200 only when app is fully initialized.
 * Used by Kubernetes/Railway to know when to route traffic.
 */
healthRouter.get("/ready", (_req, res) => {
  if (startupError) {
    res.status(503).json({
      status: "error",
      ready: false,
      error: startupError.message,
      stack: process.env.NODE_ENV === "development" ? startupError.stack : undefined,
    });
    return;
  }

  if (!isReady) {
    res.status(503).json({
      status: "starting",
      ready: false,
      message: "Application is still initializing",
      startupDuration: Date.now() - startupTime.getTime(),
    });
    return;
  }

  res.json({
    status: "ok",
    ready: true,
    startupDuration: Date.now() - startupTime.getTime(),
  });
});

/**
 * GET /health/live
 * 
 * Liveness probe - returns 200 if process is alive.
 * Used by orchestrators to restart crashed containers.
 */
healthRouter.get("/live", (_req, res) => {
  // Check for critical issues that would require a restart
  const memUsage = process.memoryUsage();
  const heapUsedPercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;
  
  // If heap is >95% full, we might be in trouble
  if (heapUsedPercent > 95) {
    res.status(503).json({
      status: "unhealthy",
      reason: "memory_pressure",
      heapUsedPercent: heapUsedPercent.toFixed(1),
    });
    return;
  }

  res.json({
    status: "ok",
    pid: process.pid,
    uptime: process.uptime(),
  });
});

/**
 * GET /health/info
 * 
 * Detailed system information for debugging.
 * Shows all configuration, features, and component status.
 */
healthRouter.get("/info", (_req, res) => {
  const memUsage = process.memoryUsage();
  const platformConfig = getPlatformConfig();
  
  res.json({
    status: isReady ? "ok" : (startupError ? "error" : "starting"),
    ready: isReady,
    
    // Timing
    startupTime: startupTime.toISOString(),
    uptime: process.uptime(),
    uptimeFormatted: formatUptime(process.uptime()),
    
    // Error info (if any)
    error: startupError ? {
      message: startupError.message,
      stack: process.env.NODE_ENV === "development" ? startupError.stack : undefined,
    } : null,
    
    // Infrastructure configuration
    infrastructure: {
      nodeEnv: infraConfig.nodeEnv,
      port: infraConfig.port,
    },
    
    // Platform configuration (from Admin Console)
    platform: {
      tenantId,
      industry: platformConfig.industry,
      channels: platformConfig.channels,
      backendApiUrl: platformConfig.backendApiUrl ? '✅ set' : '❌ missing',
      elevenLabsConnected: platformConfig.elevenLabs.connected,
    },
    
    // Redis/Cache status
    cache: (() => {
      const redisStatus = getRedisStatus();
      return {
        available: redisStatus.available,
        status: redisStatus.status,
        hitRate: `${getCacheHitRate()}%`,
        stats: {
          hits: redisStatus.stats.hits,
          misses: redisStatus.stats.misses,
          errors: redisStatus.stats.errors,
        },
        error: redisStatus.error,
      };
    })(),
    
    // Component health
    components: componentStatus,
    
    // Environment (safe to expose)
    environment: {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      pid: process.pid,
    },
    
    // Memory
    memory: {
      heapUsed: formatBytes(memUsage.heapUsed),
      heapTotal: formatBytes(memUsage.heapTotal),
      heapUsedPercent: ((memUsage.heapUsed / memUsage.heapTotal) * 100).toFixed(1) + "%",
      rss: formatBytes(memUsage.rss),
      external: formatBytes(memUsage.external),
    },
    
    timestamp: new Date().toISOString(),
  });
});

// ============================================================================
// HELPERS
// ============================================================================

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  parts.push(`${secs}s`);
  
  return parts.join(" ");
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  return (bytes / (1024 * 1024 * 1024)).toFixed(1) + " GB";
}
