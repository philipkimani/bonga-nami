/**
 * Voice API Routes
 * 
 * Tenant-aware voice/conversational AI endpoints.
 * These routes provide:
 * - Public config (safe for browser)
 * - Session management with signed tokens
 * - Usage metrics for billing
 * 
 * SECURITY:
 * - API keys NEVER leave the server
 * - Sessions are authenticated via signed JWT tokens
 * - Usage is tracked without storing conversation content
 */

import express from "express";
import { createHmac, randomUUID } from "crypto";
import { 
  getTenantContext, 
  createLogger,
  createExtensionContext 
} from "@platform/core";
import {
  createVoiceExtension,
  createVoiceApiHandlers,
  MockVoiceBackend,
  ElevenLabsVoiceBackend,
  EnvCredentialProvider,
  type VoiceBackend,
} from "@platform/voice-extension";

export const voiceRouter = express.Router();

// ============================================================================
// BACKEND SETUP
// ============================================================================

/**
 * Select backend based on environment.
 * In production, each tenant deployment has their own .env with their
 * ElevenLabs credentials.
 */
const USE_MOCK = process.env.VOICE_BACKEND !== "elevenlabs";

const credentialProvider = new EnvCredentialProvider();
const backend: VoiceBackend = USE_MOCK
  ? new MockVoiceBackend()
  : new ElevenLabsVoiceBackend(credentialProvider);

// Initialize extension (for intent handling in chat)
export const voiceExtension = createVoiceExtension({
  backend: USE_MOCK ? "mock" : "elevenlabs",
  credentialProvider,
  debug: process.env.NODE_ENV !== "production",
});

// ============================================================================
// TOKEN SIGNING
// ============================================================================

/**
 * Get JWT secret from environment or generate one.
 * In production, this MUST be set in the tenant's .env
 */
const JWT_SECRET = process.env.JWT_SECRET || process.env.ELEVENLABS_API_KEY || "dev-secret-change-me";

/**
 * Sign a session token (simple HMAC-based JWT)
 * 
 * NOTE: For production, consider using jsonwebtoken package.
 * This is a minimal implementation for the demo.
 */
function signToken(payload: Record<string, unknown>): string {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  
  const fullPayload = {
    ...payload,
    iat: now,
    exp: now + 300, // 5 minute expiry
  };

  const headerB64 = Buffer.from(JSON.stringify(header)).toString("base64url");
  const payloadB64 = Buffer.from(JSON.stringify(fullPayload)).toString("base64url");
  
  const signature = createHmac("sha256", JWT_SECRET)
    .update(`${headerB64}.${payloadB64}`)
    .digest("base64url");

  return `${headerB64}.${payloadB64}.${signature}`;
}

/**
 * Verify and decode a session token
 */
function verifyToken(token: string): Record<string, unknown> | null {
  try {
    const [headerB64, payloadB64, signature] = token.split(".");
    
    const expectedSignature = createHmac("sha256", JWT_SECRET)
      .update(`${headerB64}.${payloadB64}`)
      .digest("base64url");

    if (signature !== expectedSignature) {
      return null;
    }

    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString());
    
    // Check expiry
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

// Create API handlers
const apiHandlers = createVoiceApiHandlers(backend, signToken);

// ============================================================================
// ROUTES
// ============================================================================

/**
 * GET /api/voice/signed-url
 * 
 * Get a signed URL for ElevenLabs WebSocket connection.
 * This is used by the VoiceChatWidget to establish a conversation.
 * 
 * Response:
 * - signedUrl: URL with authentication token for WebSocket connection
 * - agentId: ElevenLabs agent ID
 * - expiresIn: Token expiry time in seconds
 */
voiceRouter.get("/signed-url", async (req: any, res: any) => {
  const tenantCtx = getTenantContext(req);
  const logger = createLogger(tenantCtx);

  try {
    logger.info("voice_signed_url_request", {});

    const config = await apiHandlers.getConfig(tenantCtx.tenantId);
    
    // For mock backend, return a mock signed URL
    if (USE_MOCK) {
      const mockToken = signToken({
        tenantId: tenantCtx.tenantId,
        agentId: config.agentId,
        type: "voice_session",
      });
      
      res.json({
        signedUrl: `wss://api.elevenlabs.io/v1/convai/conversation?agent_id=${config.agentId}&token=${mockToken}`,
        agentId: config.agentId,
        expiresIn: 300,
      });
      return;
    }
    
    // For real ElevenLabs, get signed URL from the backend
    // The ElevenLabs API provides signed URLs for authenticated connections
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      throw new Error("ELEVENLABS_API_KEY not configured");
    }
    
    // Generate signed URL using ElevenLabs conversation API
    // https://elevenlabs.io/docs/api-reference/conversational-ai/get-signed-url
    const response = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversation/get_signed_url?agent_id=${config.agentId}`,
      {
        method: "GET",
        headers: {
          "xi-api-key": apiKey,
        },
      }
    );
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`ElevenLabs API error: ${error}`);
    }
    
    const data = await response.json() as { signed_url: string };
    
    logger.info("voice_signed_url_success", { agentId: config.agentId });
    
    res.json({
      signedUrl: data.signed_url,
      agentId: config.agentId,
      expiresIn: 300,
    });
  } catch (error) {
    logger.error("voice_signed_url_error", {
      error: error instanceof Error ? error.message : String(error),
    });
    
    res.status(500).json({
      error: "Failed to generate signed URL",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * GET /api/voice/config
 * 
 * Returns public voice configuration for the tenant.
 * This is safe to call from the browser.
 * 
 * Response:
 * - agentId: ElevenLabs agent ID
 * - agentName: Display name
 * - voiceEnabled: Whether voice (WebRTC) is enabled
 * - firstMessage: Custom greeting
 * 
 * NEVER returns: API keys, rate limit details
 */
voiceRouter.get("/config", async (req: any, res: any) => {
  const tenantCtx = getTenantContext(req);
  const logger = createLogger(tenantCtx);

  try {
    logger.info("voice_config_request", {});

    const config = await apiHandlers.getConfig(tenantCtx.tenantId);

    logger.info("voice_config_success", {
      agentName: config.agentName,
      voiceEnabled: config.voiceEnabled,
    });

    res.json(config);
  } catch (error) {
    logger.error("voice_config_error", {
      error: error instanceof Error ? error.message : String(error),
    });

    // Return a safe error (don't leak internal details)
    res.status(500).json({
      error: "Voice configuration not available",
      message: "Please contact your administrator to configure voice.",
    });
  }
});

/**
 * POST /api/voice/session
 * 
 * Creates a new voice session and returns a signed URL for WebSocket connection.
 * The widget uses this to establish the ElevenLabs connection.
 * 
 * Request body:
 * - userId: Optional user identifier
 * - dynamicVariables: Optional variables for personalization
 * - metadata: Optional metadata about the session
 * 
 * Response:
 * - sessionId: Unique session identifier
 * - signedUrl: Signed WebSocket URL for ElevenLabs connection
 * - expiresAt: Timestamp when the session expires
 */
voiceRouter.post("/session", async (req: any, res: any) => {
  const tenantCtx = getTenantContext(req);
  const logger = createLogger(tenantCtx);

  try {
    const { userId, dynamicVariables, metadata } = req.body;

    logger.info("voice_session_request", { userId, metadata });

    // Get the voice config to get the agent ID
    const config = await apiHandlers.getConfig(tenantCtx.tenantId);
    
    if (!config.voiceEnabled) {
      return res.status(400).json({
        error: "Voice not enabled",
        message: "Voice is not enabled for this tenant.",
      });
    }

    // Generate session ID
    const sessionId = randomUUID();
    const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes

    // Get signed URL from ElevenLabs (or mock)
    let signedUrl: string;
    
    if (USE_MOCK) {
      // For mock backend, create a mock signed URL
      const mockToken = signToken({
        tenantId: tenantCtx.tenantId,
        sessionId,
        agentId: config.agentId,
        type: "voice_session",
        dynamicVariables: dynamicVariables || {},
      });
      signedUrl = `wss://api.elevenlabs.io/v1/convai/conversation?agent_id=${config.agentId}&token=${mockToken}`;
    } else {
      // For real ElevenLabs, get signed URL from the API
      const apiKey = process.env.ELEVENLABS_API_KEY;
      if (!apiKey) {
        throw new Error("ELEVENLABS_API_KEY not configured");
      }
      
      // Build URL with dynamic variables as query params
      // ElevenLabs passes these to the conversation for prompt substitution
      const url = new URL(
        `https://api.elevenlabs.io/v1/convai/conversation/get_signed_url`
      );
      url.searchParams.set("agent_id", config.agentId);
      
      const response = await fetch(url.toString(), {
        method: "GET",
        headers: {
          "xi-api-key": apiKey,
        },
      });
      
      if (!response.ok) {
        const error = await response.text();
        throw new Error(`ElevenLabs API error: ${error}`);
      }
      
      const data = await response.json() as { signed_url: string };
      
      // Append dynamic variables to the signed URL as query params
      // These will be passed to the conversation on connect
      if (dynamicVariables && Object.keys(dynamicVariables).length > 0) {
        const wsUrl = new URL(data.signed_url);
        Object.entries(dynamicVariables).forEach(([key, value]) => {
          if (value !== undefined) {
            wsUrl.searchParams.set(key, String(value));
          }
        });
        signedUrl = wsUrl.toString();
      } else {
        signedUrl = data.signed_url;
      }
    }

    logger.info("voice_session_created", {
      sessionId,
      agentId: config.agentId,
      hasDynamicVariables: !!dynamicVariables && Object.keys(dynamicVariables).length > 0,
    });

    // Return session with signedUrl (what the widget expects)
    res.json({
      sessionId,
      signedUrl,
      expiresAt,
      dynamicVariables: dynamicVariables || {},
      // Also include for backwards compatibility
      conversationToken: null,
    });
  } catch (error) {
    logger.error("voice_session_error", {
      error: error instanceof Error ? error.message : String(error),
    });

    // Check if it's a rate limit error
    if (error instanceof Error && error.message.includes("Rate limit")) {
      return res.status(429).json({
        error: "Rate limit exceeded",
        message: error.message,
      });
    }

    res.status(500).json({
      error: "Failed to create session",
      message: error instanceof Error ? error.message : "Please try again later.",
    });
  }
});

/**
 * DELETE /api/voice/session/:sessionId
 * 
 * Ends a voice session.
 * 
 * Response:
 * - session: Final session details with duration/message count
 */
voiceRouter.delete("/session/:sessionId", async (req: any, res: any) => {
  const tenantCtx = getTenantContext(req);
  const logger = createLogger(tenantCtx);

  const { sessionId } = req.params;

  try {
    logger.info("voice_session_end_request", { sessionId });

    const session = await apiHandlers.endSession(sessionId);

    logger.info("voice_session_ended", {
      sessionId,
      durationSeconds: session.voiceDurationSeconds,
      messageCount: session.messageCount,
    });

    res.json({
      session: {
        sessionId: session.sessionId,
        mode: session.mode,
        status: session.status,
        messageCount: session.messageCount,
        durationSeconds: session.voiceDurationSeconds,
      },
    });
  } catch (error) {
    // Session not found is OK - the actual session is with ElevenLabs
    // Our local tracking is optional for metrics
    logger.info("voice_session_end_cleanup", {
      sessionId,
      note: "Session not in local store (direct ElevenLabs connection)",
    });

    // Return success anyway - the ElevenLabs session handles itself
    res.json({
      session: {
        sessionId,
        status: "ended",
        messageCount: 0,
        durationSeconds: 0,
      },
    });
  }
});

/**
 * GET /api/voice/usage
 * 
 * Returns usage metrics for the tenant.
 * Used for billing and monitoring.
 * 
 * Query params:
 * - start: ISO date string (default: 24 hours ago)
 * - end: ISO date string (default: now)
 * 
 * Response:
 * - textMessageCount: Total text messages
 * - voiceSessionCount: Total voice sessions
 * - voiceMinutes: Total voice minutes
 */
voiceRouter.get("/usage", async (req: any, res: any) => {
  const tenantCtx = getTenantContext(req);
  const logger = createLogger(tenantCtx);

  try {
    // Parse date range from query params
    const now = new Date();
    const defaultStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const periodStart = req.query.start
      ? new Date(req.query.start as string)
      : defaultStart;
    const periodEnd = req.query.end
      ? new Date(req.query.end as string)
      : now;

    logger.info("voice_usage_request", {
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
    });

    const usage = await apiHandlers.getUsage(
      tenantCtx.tenantId,
      periodStart,
      periodEnd
    );

    logger.info("voice_usage_success", usage);

    res.json({
      tenantId: tenantCtx.tenantId,
      period: {
        start: periodStart.toISOString(),
        end: periodEnd.toISOString(),
      },
      ...usage,
    });
  } catch (error) {
    logger.error("voice_usage_error", {
      error: error instanceof Error ? error.message : String(error),
    });

    res.status(500).json({
      error: "Failed to get usage",
      message: "Please try again later.",
    });
  }
});

/**
 * POST /api/voice/verify-token
 * 
 * Verifies a session token.
 * Used by the client to validate tokens before WebSocket connection.
 * 
 * Request body:
 * - token: The JWT to verify
 * 
 * Response:
 * - valid: boolean
 * - payload: Token payload if valid
 */
voiceRouter.post("/verify-token", async (req: any, res: any) => {
  const tenantCtx = getTenantContext(req);
  const logger = createLogger(tenantCtx);

  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        valid: false,
        error: "Token is required",
      });
    }

    const payload = verifyToken(token);

    if (!payload) {
      logger.warn("voice_token_invalid", {});
      return res.json({
        valid: false,
        error: "Invalid or expired token",
      });
    }

    // Verify tenant matches
    if (payload.tenantId !== tenantCtx.tenantId) {
      logger.warn("voice_token_tenant_mismatch", {
        tokenTenant: payload.tenantId,
        requestTenant: tenantCtx.tenantId,
      });
      return res.json({
        valid: false,
        error: "Token tenant mismatch",
      });
    }

    logger.info("voice_token_verified", {
      sessionId: payload.sessionId,
    });

    res.json({
      valid: true,
      payload: {
        tenantId: payload.tenantId,
        sessionId: payload.sessionId,
        agentId: payload.agentId,
        type: payload.type,
      },
    });
  } catch (error) {
    logger.error("voice_token_verify_error", {
      error: error instanceof Error ? error.message : String(error),
    });

    res.json({
      valid: false,
      error: "Token verification failed",
    });
  }
});
