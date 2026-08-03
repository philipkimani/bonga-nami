/**
 * Platform Client Server
 * 
 * Production-grade Express server with:
 * - Comprehensive error handling and diagnostics
 * - Graceful startup with detailed logging
 * - Health check integration
 * - Feature-flagged route loading
 * 
 * @module server
 */

import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { CSP_DIRECTIVES } from "./security/csp.js";
import cookieParser from "cookie-parser";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";

// ============================================================================
// STARTUP DIAGNOSTICS - Log everything before any imports can fail
// ============================================================================

const STARTUP_TIME = Date.now();

function log(level: "info" | "warn" | "error", message: string, data?: Record<string, unknown>) {
  const timestamp = new Date().toISOString();
  const prefix = level === "error" ? "❌" : level === "warn" ? "⚠️" : "→";
  console.log(`[${timestamp}] ${prefix} [startup] ${message}`, data ? JSON.stringify(data) : "");
}

log("info", "Starting platform client...");
log("info", "Node version", { version: process.version });
log("info", "Environment", { 
  NODE_ENV: process.env.NODE_ENV || "development",
  PORT: process.env.PORT || 3001,
});

// Note: ElevenLabs credentials are now configured via Admin Console
// They're stored in platform settings, not environment variables

// ============================================================================
// GLOBAL ERROR HANDLERS - Must be registered before any async code
// ============================================================================

process.on("uncaughtException", (err) => {
  log("error", "Uncaught exception - process will exit", { 
    error: err.message,
    stack: err.stack,
  });
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  log("error", "Unhandled promise rejection", { 
    reason: String(reason),
    promise: String(promise),
  });
  // Don't exit immediately - give time to log
  setTimeout(() => process.exit(1), 1000);
});

process.on("exit", (code) => {
  const uptime = ((Date.now() - STARTUP_TIME) / 1000).toFixed(1);
  log(code === 0 ? "info" : "error", `Process exiting`, { code, uptimeSeconds: uptime });
});

// Graceful shutdown
process.on("SIGTERM", () => {
  log("info", "Received SIGTERM, shutting down gracefully...");
  process.exit(0);
});

process.on("SIGINT", () => {
  log("info", "Received SIGINT, shutting down...");
  process.exit(0);
});

// ============================================================================
// MAIN STARTUP FUNCTION - Wrapped for error catching
// ============================================================================

async function startServer() {
  log("info", "Importing core dependencies...");
  
  // Import core modules with error catching
  let tenantMiddleware, platformLogger;
  try {
    const core = await import("@platform/core");
    tenantMiddleware = core.tenantMiddleware;
    platformLogger = core.platformLogger;
    log("info", "Core dependencies loaded");
  } catch (err) {
    log("error", "Failed to import @platform/core", { 
      error: err instanceof Error ? err.message : String(err) 
    });
    throw err;
  }

  // Import infrastructure config and platform settings
  let infraConfig, getPlatformConfig;
  try {
    const config = await import("./config.js");
    infraConfig = config.infraConfig;
    
    const adminConfig = await import("./routes/admin-config.js");
    getPlatformConfig = adminConfig.getPlatformConfig;
    
    const platformConfig = getPlatformConfig();
    log("info", "Config loaded", { 
      channels: platformConfig.channels,
    });
  } catch (err) {
    log("error", "Failed to import config", { 
      error: err instanceof Error ? err.message : String(err) 
    });
    throw err;
  }

  // Import health router (needed for marking ready)
  let healthRouter, markReady, markStartupError, updateComponentStatus;
  try {
    const health = await import("./routes/health.js");
    healthRouter = health.healthRouter;
    markReady = health.markReady;
    markStartupError = health.markStartupError;
    updateComponentStatus = health.updateComponentStatus;
    log("info", "Health router loaded");
  } catch (err) {
    log("error", "Failed to import health router", { 
      error: err instanceof Error ? err.message : String(err) 
    });
    throw err;
  }

  // Initialize Redis cache (optional - works without it).
  // CRITICAL: Do NOT await — Redis retries can take 60s+, which blocks app.listen()
  // and causes Railway healthcheck to fail. Run in background and update status on completion.
  if (!process.env.REDIS_URL) {
    log("info", "Redis cache disabled (no REDIS_URL configured)");
    updateComponentStatus("redis", "down", "Not configured");
  } else {
    updateComponentStatus("redis", "degraded", "Connecting...");
    void import("./services/redis.js").then(({ initializeRedis }) =>
      initializeRedis()
        .then((connected) => {
          if (connected) {
            log("info", "Redis cache initialized ✅");
            updateComponentStatus("redis", "up", "Connected");
          } else {
            log("warn", "Redis connection failed - running without cache");
            updateComponentStatus("redis", "down", "Connection failed");
          }
        })
        .catch((err) => {
          log("warn", "Redis initialization error - running without cache", {
            error: err instanceof Error ? err.message : String(err),
          });
          updateComponentStatus("redis", "down", err instanceof Error ? err.message : "Failed to connect");
        })
    );
  }

  // Import execute router (Code Execution Sandbox)
  let executeRouter;
  try {
    const execute = await import("./routes/execute.js");
    executeRouter = execute.default;
    log("info", "Execute router loaded (Code Execution Sandbox)");
  } catch (err) {
    log("error", "Failed to import execute router", { 
      error: err instanceof Error ? err.message : String(err) 
    });
    throw err;
  }

  // Import ElevenLabs config router (Configuration Generator)
  let elevenlabsConfigRouter;
  try {
    const elevenlabsConfig = await import("./routes/elevenlabs-config.js");
    elevenlabsConfigRouter = elevenlabsConfig.default;
    log("info", "ElevenLabs config router loaded");
  } catch (err) {
    log("error", "Failed to import elevenlabs-config router", { 
      error: err instanceof Error ? err.message : String(err) 
    });
    throw err;
  }

  // Import admin-config for CORS domain checking
  let getAllowedWidgetDomains: () => string[];
  try {
    const adminConfig = await import("./routes/admin-config.js");
    getAllowedWidgetDomains = adminConfig.getAllowedWidgetDomains;
    log("info", "Admin config loaded for CORS");
  } catch (err) {
    log("error", "Failed to import admin-config", { 
      error: err instanceof Error ? err.message : String(err) 
    });
    // Fallback: return empty array (allow all in dev mode)
    getAllowedWidgetDomains = () => [];
  }

  // ============================================================================
  // EXPRESS APP SETUP
  // ============================================================================

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  const app = express();

  // Security headers via Helmet
  app.use(helmet({
    contentSecurityPolicy: {
      directives: CSP_DIRECTIVES,
    },
    crossOriginEmbedderPolicy: false, // Allow embedding for widgets
  }));
  log("info", "Helmet security headers enabled");

  // Dynamic CORS configuration
  // Uses both environment variable (CORS_ORIGINS) and Admin Console (widget allowed domains)
  app.use(cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like server-to-server or curl)
      if (!origin) {
        callback(null, true);
        return;
      }
      
      // Static origins from env
      const staticOrigins = [
        ...infraConfig.corsOrigins,
      ];
      
      // Check static origins
      if (staticOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      
      // Check platform domain patterns (Railway, Vercel, Render, etc.)
      // Clients can add their own patterns via CORS_DOMAIN_PATTERNS env var
      const domainPatterns = process.env.CORS_DOMAIN_PATTERNS?.split(",") || [
        '\\.railway\\.app$',
        '\\.up\\.railway\\.app$',
      ];
      
      const matchesPattern = domainPatterns.some(pattern => {
        try {
          return new RegExp(pattern).test(origin);
        } catch {
          return false;
        }
      });
      
      if (matchesPattern) {
        callback(null, true);
        return;
      }
      
      // Check Admin Console allowed domains (dynamically loaded from DB)
      try {
        const allowedDomains: string[] = getAllowedWidgetDomains();
        
        // Extract hostname from origin for comparison
        let originHostname: string;
        try {
          originHostname = new URL(origin).hostname;
        } catch {
          callback(new Error("Invalid origin"), false);
          return;
        }
        
        // Normalize allowed domains and check
        const isAllowed = allowedDomains.some(domain => {
          // Extract hostname if it's a full URL
          let domainHostname = domain;
          if (domain.startsWith("http://") || domain.startsWith("https://")) {
            try {
              domainHostname = new URL(domain).hostname;
            } catch {
              // Keep original
            }
          }
          
          // Exact match
          if (originHostname === domainHostname) return true;
          
          // Wildcard subdomain match (*.example.com)
          if (domainHostname.startsWith("*.")) {
            const baseDomain = domainHostname.slice(2);
            return originHostname === baseDomain || originHostname.endsWith("." + baseDomain);
          }
          
          return false;
        });
        
        if (isAllowed) {
          callback(null, true);
          return;
        }
      } catch (err) {
        // Unexpected error - log and allow to prevent blocking legitimate requests
        log("error", "CORS check error", { origin, error: err instanceof Error ? err.message : String(err) });
        callback(null, true);
        return;
      }
      
      // Not allowed
      callback(new Error("Not allowed by CORS"), false);
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Client-ID', 'X-Tenant-ID', 'X-Session-ID', 'X-User-Role'],
    credentials: true
  }));

  // Core middleware
  // SECURITY: Global body size limit set to 1mb to prevent abuse.
  // Specific routes that need larger payloads (e.g., knowledge-base file upload)
  // should configure their own per-route middleware with a higher limit.
  app.use(express.json({
    limit: '1mb',
    verify: (req: any, _res, buf) => { req.rawBody = buf; },
  }));
  app.use(cookieParser());

  // Request ID generation and logging (before routes)
  app.use((req, _res, next) => {
    // Generate requestId early so it's available for all downstream logging
    const requestId = crypto.randomUUID();
    (req as any).requestId = requestId;
    
    if (req.path !== '/health' && req.path !== '/health/ready' && req.path !== '/health/live') {
      platformLogger.info("request", { 
        method: req.method, 
        path: req.path,
        requestId,
        userAgent: req.get('user-agent')?.substring(0, 50),
      });
    }
    next();
  });

  // ============================================================================
  // ROUTES - Health first (no auth required)
  // ============================================================================

  app.use("/health", healthRouter);
  log("info", "Health routes mounted at /health");

  // ============================================================================
  // AUTHENTICATION ROUTES - Must be before protected routes
  // ============================================================================
  
  let requireAuth: any;
  try {
    const auth = await import("./routes/auth.js");
    app.use("/api/auth", auth.authRouter);
    requireAuth = auth.requireAuth;
    log("info", "Auth routes mounted at /api/auth");
  } catch (err) {
    log("error", "Failed to load auth routes", { error: err instanceof Error ? err.message : String(err) });
    // Create a stub that always denies
    requireAuth = (_req: any, res: any) => res.status(503).json({ error: "Auth not available" });
  }

  // ============================================================================
  // WEBHOOK ROUTES - No tenant middleware (external services can't send headers)
  // ============================================================================
  
  // Code execution endpoint - runs LLM-generated code in sandbox
  // This is the primary endpoint for ElevenLabs execute_code tool
  app.use("/api/execute", executeRouter);
  app.use("/webhooks/execute", executeRouter); // Alias for ElevenLabs
  log("info", "Code execution mounted at /api/execute and /webhooks/execute");
  
  // ============================================================================
  // MESSAGING CHANNELS - FROZEN (Require Meta Business Verification / Live Site)
  // WhatsApp: Needs Meta Business verification (not viable for informal businesses)
  // Messenger: Needs live deployed site for webhook verification
  // Revisit when: Client has verified Meta Business Account + live deployment
  // ============================================================================
  
  // ElevenLabs configuration generator - helps with agent setup
  app.use("/api/elevenlabs-config", elevenlabsConfigRouter);
  log("info", "ElevenLabs config mounted at /api/elevenlabs-config");
  
  // Public config endpoint for widget (no auth required)
  try {
    const { publicConfigRouter } = await import("./routes/public-config.js");
    app.use("/api/config", publicConfigRouter);
    log("info", "Public config mounted at /api/config/public");
  } catch (err) {
    log("error", "Failed to load public-config routes", { error: err instanceof Error ? err.message : String(err) });
  }

  // ElevenLabs signed URL endpoint for widget (no auth required - rate limited in production)
  try {
    const { elevenLabsRouter } = await import("./routes/elevenlabs.js");
    app.use("/api/elevenlabs", elevenLabsRouter);
    log("info", "ElevenLabs routes mounted at /api/elevenlabs");
  } catch (err) {
    log("error", "Failed to load elevenlabs routes", { error: err instanceof Error ? err.message : String(err) });
  }

  // ============================================================================
  // ADMIN CONFIG ROUTES - Protected by authentication
  // These must be mounted BEFORE the tenant middleware for /api routes
  // ============================================================================
  
  try {
    const adminConfigRouter = (await import("./routes/admin-config.js")).default;
    // Protect admin config with authentication in production
    if (process.env.NODE_ENV === "production") {
      app.use("/api/admin/config", requireAuth, adminConfigRouter);
      log("info", "Admin Config routes enabled at /api/admin/config (auth required)");
    } else {
      app.use("/api/admin/config", adminConfigRouter);
      log("info", "Admin Config routes enabled at /api/admin/config (dev mode - no auth)");
    }
  } catch (err) {
    log("error", "Failed to load admin-config routes", { error: err instanceof Error ? err.message : String(err) });
  }

  // Knowledge Base routes - protected by auth in production
  try {
    const { knowledgeBaseRouter } = await import("./routes/knowledge-base.js");
    if (process.env.NODE_ENV === "production") {
      app.use("/api/knowledge-base", requireAuth, knowledgeBaseRouter);
    } else {
      app.use("/api/knowledge-base", knowledgeBaseRouter);
    }
    updateComponentStatus("knowledgeBase", "up");
    log("info", "Knowledge Base routes enabled at /api/knowledge-base");
  } catch (err) {
    updateComponentStatus("knowledgeBase", "down", err instanceof Error ? err.message : "Failed to load");
    log("error", "Failed to load knowledge-base routes", { error: err instanceof Error ? err.message : String(err) });
  }

  // Analytics routes - protected by auth in production
  try {
    const { analyticsRouter } = await import("./routes/analytics.js");
    if (process.env.NODE_ENV === "production") {
      app.use("/api/analytics", requireAuth, analyticsRouter);
    } else {
      app.use("/api/analytics", analyticsRouter);
    }
    log("info", "Analytics routes enabled at /api/analytics");
  } catch (err) {
    log("error", "Failed to load analytics routes", { error: err instanceof Error ? err.message : String(err) });
  }

  // ============================================================================
  // API ROUTES - Require tenant identification (external API calls)
  // ============================================================================

  // Apply tenant middleware to all /api routes EXCEPT those mounted above
  app.use("/api", tenantMiddleware({ allowAnonymous: false }));
  log("info", "API routes ready");

  // ============================================================================
  // CORE ROUTES - Always loaded (PaaS core features)
  // ============================================================================

  // Voice routes (ElevenLabs integration)
  try {
    const { voiceRouter } = await import("./routes/voice.js");
    app.use("/api/voice", voiceRouter);
    updateComponentStatus("voice", "up");
    log("info", "Voice routes enabled at /api/voice");
  } catch (err) {
    updateComponentStatus("voice", "down", err instanceof Error ? err.message : "Failed to load");
    log("error", "Failed to load voice routes", { error: err instanceof Error ? err.message : String(err) });
  }

  // Admin routes (other admin APIs - not config)
  // Note: These still require tenant header for now (external API access)
  try {
    const { adminRouter } = await import("./routes/admin.js");
    app.use("/api/admin", adminRouter);
    updateComponentStatus("admin", "up");
    log("info", "Admin API routes enabled at /api/admin");
  } catch (err) {
    updateComponentStatus("admin", "down", err instanceof Error ? err.message : "Failed to load");
    log("error", "Failed to load admin routes", { error: err instanceof Error ? err.message : String(err) });
  }

  // ============================================================================
  // TWILIO CHANNEL ROUTES - Loaded based on platform config
  // ============================================================================

  // Get current platform config for channel loading
  const platformConfig = getPlatformConfig();

  // Voice calls via Twilio (enabled in Platform Settings)
  if (platformConfig.channels.voiceCalls) {
    try {
      const { adminAssistantRouter, personalizationRouter } = await import("./routes/admin-assistant/index.js");
      app.use("/api/admin-assistant", adminAssistantRouter);
      
      // Twilio voice webhook
      app.use("/webhooks/admin-assistant/calls", (await import("./routes/admin-assistant/calls.js")).callsRouter);
      
      // ElevenLabs personalization webhook (used by both voice + WhatsApp)
      app.use("/webhooks/elevenlabs/personalization", personalizationRouter);
      
      // WhatsApp routes (always loaded with admin-assistant)
      app.use("/webhooks/admin-assistant/whatsapp", (await import("./routes/admin-assistant/whatsapp.js")).whatsappRouter);
      
      updateComponentStatus("twilioVoice", "up");
      updateComponentStatus("whatsapp", "up");
      log("info", "Twilio Voice + WhatsApp + Personalization routes enabled");
    } catch (err) {
      updateComponentStatus("twilioVoice", "down", err instanceof Error ? err.message : "Failed to load");
      log("error", "Failed to load Twilio Voice routes", { error: err instanceof Error ? err.message : String(err) });
    }
  } else {
    // Even without voice calls, load WhatsApp + admin-assistant if WhatsApp is enabled
    try {
      const { adminAssistantRouter, personalizationRouter } = await import("./routes/admin-assistant/index.js");
      app.use("/api/admin-assistant", adminAssistantRouter);
      app.use("/webhooks/elevenlabs/personalization", personalizationRouter);
      app.use("/webhooks/admin-assistant/whatsapp", (await import("./routes/admin-assistant/whatsapp.js")).whatsappRouter);
      updateComponentStatus("whatsapp", "up");
      log("info", "Admin Assistant + WhatsApp + Personalization routes enabled (voice disabled)");
    } catch (err) {
      log("error", "Failed to load admin assistant routes", { error: err instanceof Error ? err.message : String(err) });
    }
  }

  // SMS via Twilio (enabled in Platform Settings)
  if (platformConfig.channels.sms) {
    try {
      app.use("/webhooks/admin-assistant/sms", (await import("./routes/admin-assistant/sms.js")).smsRouter);
      updateComponentStatus("twilioSms", "up");
      log("info", "Twilio SMS routes enabled at /webhooks/admin-assistant/sms");
    } catch (err) {
      updateComponentStatus("twilioSms", "down", err instanceof Error ? err.message : "Failed to load");
      log("error", "Failed to load Twilio SMS routes", { error: err instanceof Error ? err.message : String(err) });
    }
  }

  // Email via SendGrid (enabled in Platform Settings)
  if (platformConfig.channels.email) {
    try {
      app.use("/webhooks/admin-assistant/email", (await import("./routes/admin-assistant/email.js")).emailRouter);
      updateComponentStatus("email", "up");
      log("info", "SendGrid Email routes enabled at /webhooks/admin-assistant/email");
    } catch (err) {
      updateComponentStatus("email", "down", err instanceof Error ? err.message : "Failed to load");
      log("error", "Failed to load Email routes", { error: err instanceof Error ? err.message : String(err) });
    }
  }

  // ============================================================================
  // STATIC UI - Route Structure:
  //   /           → Admin Console (requires auth in production)
  //   /ai_agent   → Chatbot/Voice Widget (public-facing)
  //   /widget     → Embedded widget bundle
  // ============================================================================

  const uiBasePath = path.join(__dirname, "..", "src", "ui");
  const storagePath = path.join(__dirname, "..", "src", "storage");

  app.use("/storage", express.static(storagePath));

  // CORS middleware for widget files - allow cross-origin embedding
  const widgetCorsMiddleware = (_req: express.Request, res: express.Response, next: express.NextFunction) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    next();
  };

  // Serve widget files - Priority order:
  // 1. dist/widget (built widget bundle)
  // 2. public/widget (embed.js loader)
  try {
    // Built widget bundle (from vite build:widget)
    const widgetDistPath = path.join(__dirname, "..", "dist", "widget");
    app.use("/widget", widgetCorsMiddleware, express.static(widgetDistPath));
    log("info", "Widget dist bundle mounted at /widget (CORS enabled)");
  } catch (err) {
    log("warn", "Widget dist not available");
  }
  
  try {
    // Public widget files (embed.js loader)
    const widgetPublicPath = path.join(__dirname, "..", "public", "widget");
    app.use("/widget", widgetCorsMiddleware, express.static(widgetPublicPath));
    log("info", "Widget public files mounted at /widget (CORS enabled)");
  } catch (err) {
    log("warn", "Widget public files not available");
  }
  
  // Legacy: Voice extension widget (fallback)
  try {
    const widgetPath = path.join(__dirname, "..", "..", "..", "extensions", "voice", "dist", "widget");
    app.use("/widget", express.static(widgetPath));
    log("info", "Voice widget bundle mounted at /widget (fallback)");
  } catch (err) {
    log("warn", "Voice widget bundle not available");
  }

  // AI Agent / Chatbot - PUBLIC (no auth required)
  // This is the customer-facing widget page
  const chatbotPath = path.join(uiBasePath, "chatbot");
  app.use("/ai_agent", express.static(chatbotPath));
  app.get("/ai_agent/{*path}", (_req, res) => {
    res.sendFile(path.join(chatbotPath, "index.html"));
  });
  // Also serve chatbot at /chat for convenience
  app.use("/chat", express.static(chatbotPath));
  app.get("/chat/{*path}", (_req, res) => {
    res.sendFile(path.join(chatbotPath, "index.html"));
  });
  log("info", "AI Agent (Chatbot) mounted at /ai_agent and /chat");

  // Admin Console at ROOT - Protected in production
  const adminConsolePath = path.join(uiBasePath, "admin-console-react", "dist");
  
  // Serve the SPA static assets (CSS, JS, images) without auth
  // The React app handles login UI and auth state client-side
  app.use("/", express.static(adminConsolePath));
  
  // Legacy redirects for backwards compatibility
  app.get("/admin", (_req, res) => res.redirect("/"));
  app.get("/admin/{*path}", (_req, res) => res.redirect("/"));
  app.get("/kb-admin", (_req, res) => res.redirect("/"));
  
  // SPA fallback - serve index.html for all root routes (Express 5 syntax)
  app.get("/{*path}", (req, res, next) => {
    // Don't serve admin for API/webhook routes
    if (req.path.startsWith("/api") || req.path.startsWith("/webhooks") || req.path.startsWith("/health")) {
      return next();
    }
    res.sendFile(path.join(adminConsolePath, "index.html"));
  });
  log("info", "Admin Console mounted at / (root)");
  log("info", "Chatbot UI mounted at /");

  // ============================================================================
  // ERROR HANDLING MIDDLEWARE
  // ============================================================================

  // 404 handler
  app.use((req, res) => {
    res.status(404).json({
      error: "Not Found",
      path: req.path,
      method: req.method,
    });
  });

  // Global error handler
  // eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any
  app.use((err: Error, req: any, res: any, _next: any) => {
    platformLogger.error("request_error", {
      error: err.message,
      stack: err.stack,
      path: req.path,
      method: req.method,
    });

    if (err.message === "Not allowed by CORS") {
      res.status(403).json({
        error: "Origin not allowed",
        code: "ORIGIN_NOT_ALLOWED",
        hint: "Add this domain in Admin Console → Platform Settings, or set WIDGET_ALLOWED_DOMAINS",
      });
      return;
    }

    res.status(500).json({
      error: "Internal Server Error",
      message: process.env.NODE_ENV === "development" ? err.message : "An unexpected error occurred",
      requestId: req.get("x-request-id"),
    });
  });

  // ============================================================================
  // START SERVER
  // ============================================================================

  const HOST = infraConfig.host;
  const PORT = infraConfig.port;

  return new Promise<void>((resolve, reject) => {
    const server = app.listen(PORT, HOST, () => {
      const startupDuration = Date.now() - STARTUP_TIME;
      const currentConfig = getPlatformConfig();
      
      log("info", `Server started successfully`, {
        host: HOST,
        port: PORT,
        startupMs: startupDuration,
      });
      
      console.log(`\n${"=".repeat(60)}`);
      console.log(`  🚀 Bonga Nami Running`);
      console.log(`${"=".repeat(60)}`);
      console.log(`  Admin Console: http://${HOST}:${PORT}/`);
      console.log(`  AI Agent:      http://${HOST}:${PORT}/ai_agent`);
      console.log(`  Health:        http://${HOST}:${PORT}/health/info`);
      console.log(`  Auth:          ${process.env.NODE_ENV === 'production' ? 'ENABLED' : 'dev mode (no auth)'}`);
      console.log(`  Startup:       ${startupDuration}ms`);
      console.log(`${"=".repeat(60)}\n`);

      // Mark as ready AFTER server is listening
      markReady();
      resolve();
    });

    server.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        log("error", `Port ${PORT} is already in use`, { port: PORT });
      } else if (err.code === "EACCES") {
        log("error", `Permission denied to bind to port ${PORT}`, { port: PORT });
      } else {
        log("error", "Server failed to start", { error: err.message, code: err.code });
      }
      markStartupError(err);
      reject(err);
    });

    // Graceful shutdown handler
    const shutdown = () => {
      log("info", "Shutting down server...");
      server.close(() => {
        log("info", "Server closed");
        process.exit(0);
      });
      
      // Force close after 10s
      setTimeout(() => {
        log("warn", "Forcing shutdown after timeout");
        process.exit(1);
      }, 10000);
    };

    process.on("SIGTERM", shutdown);
    process.on("SIGINT", shutdown);
  });
}

// ============================================================================
// ENTRY POINT
// ============================================================================

startServer().catch((err) => {
  log("error", "Fatal startup error", { 
    error: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });
  process.exit(1);
});
