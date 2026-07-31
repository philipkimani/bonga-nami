/**
 * ElevenLabs Signed URL Route
 * 
 * Provides signed WebSocket URLs for connecting to ElevenLabs Conversational AI.
 * This is required for secure client-side connections.
 * 
 * SECURITY CONTROLS:
 * 1. Rate limiting: 30 requests/min per IP (prevents abuse)
 * 2. Origin validation: Only allowed domains can request signed URLs
 * 3. Signed URLs are short-lived (15 minutes)
 * 4. API key never exposed to client
 * 
 * The widget calls this endpoint to get a short-lived signed URL,
 * then connects directly to ElevenLabs (no data passes through our server).
 */

import express, { Request, Response, NextFunction } from "express";
import { getPlatformConfig, getAllowedWidgetDomains } from "./admin-config.js";

const router = express.Router();

// ============================================================================
// RATE LIMITING (30 requests per minute per IP - more restrictive for signed URLs)
//
// SCALING NOTE:
// In-memory rate limiting works for single-instance deployments.
// For multi-instance (horizontal scaling), migrate to Redis using the
// `rate-limiter-flexible` package with a RedisStore backend.
//
// TODO: Redis-backed upgrade path:
//   1. Install `rate-limiter-flexible` package
//   2. Replace this Map with `RateLimiterRedis` from rate-limiter-flexible
//   3. Configure Redis connection from REDIS_URL environment variable
//   4. Keep the same window/limit parameters for backwards compatibility
//   5. Add fallback to in-memory if Redis is unavailable (graceful degradation)
// ============================================================================

const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 30; // Lower limit for signed URLs (more sensitive)

function rateLimitMiddleware(req: Request, res: Response, next: NextFunction): void {
  const clientIp = req.ip || req.socket.remoteAddress || "unknown";
  const now = Date.now();
  
  const state = rateLimitMap.get(clientIp);
  
  if (!state || now > state.resetTime) {
    rateLimitMap.set(clientIp, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
    next();
    return;
  }
  
  if (state.count >= RATE_LIMIT_MAX) {
    res.status(429).json({ 
      error: "Rate limit exceeded",
      code: "RATE_LIMIT_EXCEEDED",
      retryAfter: Math.ceil((state.resetTime - now) / 1000)
    });
    return;
  }
  
  state.count++;
  next();
}

// ============================================================================
// ORIGIN VALIDATION
// ============================================================================

function validateOrigin(req: Request, res: Response, next: NextFunction): void {
  const origin = req.get("origin") || req.get("referer");
  const allowedDomains = getAllowedWidgetDomains();
  
  // If no domains configured, allow all (development mode)
  if (allowedDomains.length === 0) {
    next();
    return;
  }
  
  // Same-origin requests allowed
  if (!origin) {
    next();
    return;
  }
  
  let hostname: string;
  try {
    const url = new URL(origin);
    hostname = url.hostname;
  } catch {
    res.status(403).json({ error: "Invalid origin", code: "INVALID_ORIGIN" });
    return;
  }
  
  // Normalize allowed domains to hostnames (handle both "example.com" and "https://example.com")
  const normalizedDomains = allowedDomains.map(domain => {
    if (domain.startsWith("http://") || domain.startsWith("https://")) {
      try {
        return new URL(domain).hostname;
      } catch {
        return domain;
      }
    }
    return domain;
  });
  
  const isAllowed = normalizedDomains.some(domain => {
    if (hostname === domain) return true;
    if (domain.startsWith("*.")) {
      const baseDomain = domain.slice(2);
      return hostname === baseDomain || hostname.endsWith("." + baseDomain);
    }
    return false;
  });
  
  if (!isAllowed) {
    console.warn(`[ElevenLabs] Origin rejected for signed-url: ${origin} (hostname: ${hostname})`);
    res.status(403).json({ error: "Origin not allowed", code: "ORIGIN_NOT_ALLOWED" });
    return;
  }
  
  next();
}

// Apply security middleware
router.use(rateLimitMiddleware);
router.use(validateOrigin);

/**
 * GET /api/elevenlabs/signed-url
 * 
 * Returns a signed WebSocket URL for ElevenLabs conversation.
 * Protected by rate limiting and origin validation.
 * 
 * Query params:
 *   - agent_id: Optional override for the agent ID
 */
router.get("/signed-url", async (req, res) => {
  try {
    const config = getPlatformConfig();
    const agentId = (req.query.agent_id as string) || config.elevenLabs.agentId;
    const apiKey = config.elevenLabs.apiKey;

    if (!agentId) {
      return res.status(400).json({ 
        error: "Agent ID not configured",
        message: "Please configure ElevenLabs Agent ID in Platform Settings" 
      });
    }

    if (!apiKey) {
      return res.status(400).json({ 
        error: "API key not configured",
        message: "Please configure ElevenLabs API Key in Platform Settings" 
      });
    }

    // Get signed URL from ElevenLabs
    const response = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversation/get_signed_url?agent_id=${agentId}`,
      {
        method: "GET",
        headers: {
          "xi-api-key": apiKey,
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[ElevenLabs] Signed URL error:", response.status, errorText);
      return res.status(response.status).json({ 
        error: "Failed to get signed URL from ElevenLabs",
        details: errorText,
      });
    }

    const data = await response.json();
    
    // Return the signed URL
    res.json({
      signed_url: data.signed_url,
      agent_id: agentId,
      expires_at: data.expires_at,
    });

  } catch (error) {
    console.error("[ElevenLabs] Signed URL error:", error);
    res.status(500).json({ 
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Unknown error" 
    });
  }
});

export default router;
export { router as elevenLabsRouter };
