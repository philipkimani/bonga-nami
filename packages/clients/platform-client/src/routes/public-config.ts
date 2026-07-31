/**
 * Public Config Route
 * 
 * Exposes non-sensitive configuration for the chat widget.
 * This endpoint does NOT require authentication.
 * 
 * SECURITY CONTROLS:
 * 1. Only expose what's needed for the widget UI (no API keys)
 * 2. Origin validation - only allowed domains can fetch config
 * 3. Rate limiting - prevent abuse (100 requests/min per IP)
 * 
 * ENTERPRISE COMPLIANCE:
 * - Kenya DPA 2019: No personal data exposed
 * - Banks/Telcos: Domain whitelist prevents unauthorized embedding
 */

import express, { Request, Response, NextFunction } from "express";
import { getPlatformConfig, getAllowedWidgetDomains } from "./admin-config.js";

const router = express.Router();

// ============================================================================
// RATE LIMITING (Per IP, 100 requests per minute)
// ============================================================================

const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX = 100; // requests per window

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

// Clean up old rate limit entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, state] of rateLimitMap.entries()) {
    if (now > state.resetTime) {
      rateLimitMap.delete(ip);
    }
  }
}, 5 * 60 * 1000);

// ============================================================================
// ORIGIN VALIDATION (Domain Whitelist)
// ============================================================================

function validateOrigin(req: Request, res: Response, next: NextFunction): void {
  const origin = req.get("origin") || req.get("referer");
  const allowedDomains = getAllowedWidgetDomains();
  
  // If no domains configured, allow all (development mode)
  if (allowedDomains.length === 0) {
    next();
    return;
  }
  
  // Always allow same-origin requests (no origin header)
  if (!origin) {
    next();
    return;
  }
  
  // Parse origin to get hostname
  let hostname: string;
  try {
    const url = new URL(origin);
    hostname = url.hostname;
  } catch {
    res.status(403).json({ 
      error: "Invalid origin",
      code: "INVALID_ORIGIN"
    });
    return;
  }
  
  // Normalize allowed domains to hostnames (handle both "example.com" and "https://example.com")
  const normalizedDomains = allowedDomains.map(domain => {
    // If it looks like a URL, extract the hostname
    if (domain.startsWith("http://") || domain.startsWith("https://")) {
      try {
        return new URL(domain).hostname;
      } catch {
        return domain; // Keep as-is if parsing fails
      }
    }
    // Already a hostname or wildcard pattern
    return domain;
  });
  
  // Check if hostname matches any allowed domain
  const isAllowed = normalizedDomains.some(domain => {
    // Exact match
    if (hostname === domain) return true;
    // Wildcard subdomain match (*.example.com)
    if (domain.startsWith("*.")) {
      const baseDomain = domain.slice(2);
      return hostname === baseDomain || hostname.endsWith("." + baseDomain);
    }
    return false;
  });
  
  if (!isAllowed) {
    console.warn(`[PublicConfig] Origin rejected: ${origin} (hostname: ${hostname}, allowed hostnames: ${normalizedDomains.join(", ")})`);
    res.status(403).json({ 
      error: "Origin not allowed",
      code: "ORIGIN_NOT_ALLOWED",
      hint: "Configure allowed domains in Admin Console → Platform Settings"
    });
    return;
  }
  
  next();
}

// Apply security middleware to all routes
router.use(rateLimitMiddleware);
router.use(validateOrigin);

/**
 * GET /api/config/public
 * 
 * Returns public configuration for the chat widget.
 * Protected by origin validation and rate limiting.
 */
router.get("/public", (req, res) => {
  try {
    const config = getPlatformConfig();
    
    // Only expose what the widget needs (NO secrets!)
    const publicConfig = {
      elevenLabs: {
        agentId: config.elevenLabs.agentId,
        // Never expose API key!
      },
      conversationMode: config.conversationMode,
      conversationFlow: {
        firstMessageMode: config.conversationFlow.firstMessageMode,
        waitForUserFirst: config.conversationFlow.waitForUserFirst,
        greeting: config.conversationFlow.greeting,
        maxIdlePrompts: config.conversationFlow.maxIdlePrompts,
        inactivityTimeout: config.conversationFlow.inactivityTimeout,
        maxDuration: config.conversationFlow.maxDuration,
      },
      widget: {
        primaryColor: config.widget?.primaryColor || '#6366f1',
        secondaryColor: config.widget?.secondaryColor || '#8b5cf6',
        title: config.widget?.title || 'AI Assistant',
        subtitle: config.widget?.subtitle || 'How can I help you today?',
        position: config.widget?.position || 'bottom-right',
        widgetWidth: config.widget?.widgetWidth ?? 400,
        widgetHeight: config.widget?.widgetHeight ?? 600,
        buttonSize: config.widget?.buttonSize ?? 56,
        borderRadius: config.widget?.borderRadius ?? 16,
        showLanguageSelector: config.widget?.showLanguageSelector !== false,
        poweredByText: config.widget?.poweredByText || 'Powered by Ruskins AI',
        poweredByLink: config.widget?.poweredByLink ?? 'https://ruskinsconsulting.com',
        showPoweredBy: config.widget?.showPoweredBy !== false,
      },
      branding: {
        companyName: config.branding?.companyName || '',
        logoUrl: config.branding?.logoUrl || '',
      },
    };

    res.json(publicConfig);
  } catch (error) {
    console.error("[PublicConfig] Error:", error);
    res.status(500).json({ error: "Failed to load configuration" });
  }
});

/**
 * GET /api/config/widget
 * 
 * Minimal config just for widget initialization.
 */
router.get("/widget", (req, res) => {
  try {
    const config = getPlatformConfig();
    
    // Absolute minimum for widget to work
    res.json({
      agentId: config.elevenLabs.agentId,
      mode: config.conversationMode,
      color: config.widget?.primaryColor || '#6366f1',
      title: config.widget?.title || 'AI Assistant',
    });
  } catch (error) {
    console.error("[PublicConfig] Error:", error);
    res.status(500).json({ error: "Failed to load configuration" });
  }
});

export default router;
export { router as publicConfigRouter };
