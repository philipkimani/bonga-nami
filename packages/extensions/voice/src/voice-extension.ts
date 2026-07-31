/**
 * Voice Extension - Main Extension Implementation
 * 
 * This extension:
 * - ✅ Hooks into the chatbot engine
 * - ✅ Provides tenant-aware voice configuration
 * - ✅ Manages voice sessions with rate limiting
 * - ✅ Tracks usage for billing (without storing content)
 * - ✅ Proxies to ElevenLabs on behalf of tenants
 * - ❌ Never stores or logs API keys
 * - ❌ Never sees conversation content
 */

import type { ChatbotExtensionV1, ExtensionContext } from "@platform/core";
import type {
  VoiceBackend,
  VoiceCredentialProvider,
  VoiceSession,
  VoicePublicConfig,
} from "./types.js";
import { MockVoiceBackend } from "./backend/mock-backend.js";
import { ElevenLabsVoiceBackend } from "./backend/elevenlabs-backend.js";
import { EnvCredentialProvider } from "./backend/env-credential-provider.js";

/**
 * Voice Extension Configuration
 */
export interface VoiceExtensionConfig {
  /**
   * Backend to use for voice operations
   * - 'mock': In-memory mock for testing
   * - 'elevenlabs': Production ElevenLabs backend
   */
  backend: "mock" | "elevenlabs";

  /**
   * Credential provider for fetching tenant API keys.
   * If not provided, uses EnvCredentialProvider which reads from environment.
   */
  credentialProvider?: VoiceCredentialProvider;

  /**
   * Webhook URL for billing events.
   * Events are sent without conversation content.
   */
  webhookUrl?: string;

  /**
   * Enable debug logging (never logs credentials)
   */
  debug?: boolean;
}

/**
 * Voice Extension State
 * Tracks active sessions and usage
 */
interface VoiceExtensionState {
  activeSessions: Map<string, VoiceSession>;
  sessionsByTenant: Map<string, Set<string>>;
}

/**
 * Create Voice Extension
 * 
 * @param config - Extension configuration
 * @returns ChatbotExtensionV1 instance
 */
export function createVoiceExtension(
  config: VoiceExtensionConfig
): ChatbotExtensionV1 {
  // Initialize credential provider
  const credentialProvider: VoiceCredentialProvider =
    config.credentialProvider ?? new EnvCredentialProvider();

  // Initialize backend based on config
  const backend: VoiceBackend =
    config.backend === "mock"
      ? new MockVoiceBackend()
      : new ElevenLabsVoiceBackend(credentialProvider);

  // Extension state
  const state: VoiceExtensionState = {
    activeSessions: new Map(),
    sessionsByTenant: new Map(),
  };

  // Debug logger (never logs credentials)
  const log = config.debug
    ? (msg: string, data?: Record<string, unknown>) =>
        console.log(`[voice] ${msg}`, data ? JSON.stringify(data) : "")
    : () => {};

  return {
    async onInitialize() {
      log("✅ Extension initialized", { backend: config.backend });
    },

    async beforeResponse(input: string, context: ExtensionContext) {
      const tenantId = context.tenant.tenantId;
      const lowerInput = input.toLowerCase();

      // Intent: Get voice configuration
      if (
        lowerInput.includes("voice config") ||
        lowerInput.includes("voice settings")
      ) {
        log("🎤 Voice config intent detected", { tenantId });

        try {
          const publicConfig = await backend.getPublicConfig(tenantId);
          context.response = {
            message: formatVoiceConfigResponse(publicConfig),
          };
        } catch (error) {
          log("❌ Failed to get voice config", {
            tenantId,
            error: String(error),
          });
          context.response = {
            message:
              "Voice is not configured for this account. Please contact your administrator.",
          };
        }
      }

      // Intent: Start voice session
      if (
        lowerInput.includes("start voice") ||
        lowerInput.includes("voice call") ||
        lowerInput.includes("talk to")
      ) {
        log("🎤 Start voice intent detected", { tenantId });

        // Check rate limits first
        const rateLimitCheck = await backend.checkRateLimits(tenantId);
        if (!rateLimitCheck.allowed) {
          context.response = {
            message: `Voice rate limit reached: ${rateLimitCheck.reason}. Please try again later.`,
          };
          return;
        }

        try {
          const session = await backend.createSession(
            tenantId,
            context.tenant.sessionId,
            "voice"
          );

          // Track session
          state.activeSessions.set(session.sessionId, session);
          if (!state.sessionsByTenant.has(tenantId)) {
            state.sessionsByTenant.set(tenantId, new Set());
          }
          state.sessionsByTenant.get(tenantId)!.add(session.sessionId);

          // Emit session started event
          context.intent = {
            type: "voice.session.started",
            sessionId: session.sessionId,
            mode: session.mode,
          };

          log("✅ Voice session created", {
            sessionId: session.sessionId,
            tenantId,
          });
        } catch (error) {
          log("❌ Failed to create voice session", {
            tenantId,
            error: String(error),
          });
          context.response = {
            message:
              "Failed to start voice session. Please try again.",
          };
        }
      }

      // Intent: End voice session
      if (
        lowerInput.includes("end call") ||
        lowerInput.includes("hang up") ||
        lowerInput.includes("stop voice")
      ) {
        log("📴 End voice intent detected", { tenantId });

        const tenantSessions = state.sessionsByTenant.get(tenantId);
        if (tenantSessions && tenantSessions.size > 0) {
          // End all active sessions for this tenant
          for (const sessionId of tenantSessions) {
            try {
              const session = await backend.endSession(sessionId);
              state.activeSessions.delete(sessionId);

              // Emit session ended event
              context.intent = {
                type: "voice.session.ended",
                sessionId: session.sessionId,
                durationSeconds:
                  session.voiceDurationSeconds ?? 0,
                messageCount: session.messageCount,
              };

              log("✅ Voice session ended", {
                sessionId,
                duration: session.voiceDurationSeconds,
              });
            } catch (error) {
              log("❌ Failed to end session", {
                sessionId,
                error: String(error),
              });
            }
          }
          tenantSessions.clear();
        }
      }
    },

    async afterResponse(output: string, context: ExtensionContext) {
      const tenantId = context.tenant.tenantId;
      const tenantSessions = state.sessionsByTenant.get(tenantId);

      // Record usage for active sessions
      if (tenantSessions && tenantSessions.size > 0) {
        for (const sessionId of tenantSessions) {
          try {
            await backend.recordUsage(sessionId, {
              messageCount: 1,
            });
          } catch (error) {
            log("⚠️ Failed to record usage", {
              sessionId,
              error: String(error),
            });
          }
        }
      }
    },

    async onShutdown() {
      log("🛑 Shutting down, ending all sessions");

      // End all active sessions
      for (const [sessionId] of state.activeSessions) {
        try {
          await backend.endSession(sessionId);
        } catch {
          // Best effort cleanup
        }
      }

      state.activeSessions.clear();
      state.sessionsByTenant.clear();
    },
  };
}

/**
 * Format voice config for display
 */
function formatVoiceConfigResponse(config: VoicePublicConfig): string {
  return [
    "🎤 **Voice Configuration**",
    "",
    `**Agent:** ${config.agentName}`,
    config.agentDescription ? `**Description:** ${config.agentDescription}` : "",
    `**Voice Enabled:** ${config.voiceEnabled ? "Yes" : "No (text only)"}`,
    config.firstMessage ? `**Greeting:** "${config.firstMessage}"` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * ============================================================================
 * VOICE API HANDLERS
 * ============================================================================
 * 
 * These are exported for use in route handlers.
 * They provide the API layer for the voice extension.
 */

export interface VoiceApiHandlers {
  /**
   * GET /api/voice/config
   * Returns public voice config (safe for browser)
   */
  getConfig(tenantId: string): Promise<VoicePublicConfig>;

  /**
   * POST /api/voice/session
   * Creates a new voice session and returns a signed token
   */
  createSession(
    tenantId: string,
    userId?: string,
    mode?: "text" | "voice"
  ): Promise<{ session: VoiceSession; token: string }>;

  /**
   * DELETE /api/voice/session/:sessionId
   * Ends a voice session
   */
  endSession(sessionId: string): Promise<VoiceSession>;

  /**
   * GET /api/voice/usage
   * Returns usage metrics for billing
   */
  getUsage(
    tenantId: string,
    periodStart: Date,
    periodEnd: Date
  ): Promise<{
    textMessageCount: number;
    voiceSessionCount: number;
    voiceMinutes: number;
  }>;
}

/**
 * Create Voice API handlers
 * 
 * @param backend - Voice backend to use
 * @param tokenSigner - Function to sign session tokens
 */
export function createVoiceApiHandlers(
  backend: VoiceBackend,
  tokenSigner: (payload: Record<string, unknown>) => string
): VoiceApiHandlers {
  return {
    async getConfig(tenantId: string) {
      return backend.getPublicConfig(tenantId);
    },

    async createSession(tenantId, userId, mode = "text") {
      // Check rate limits
      const rateLimitCheck = await backend.checkRateLimits(tenantId);
      if (!rateLimitCheck.allowed) {
        throw new Error(`Rate limit exceeded: ${rateLimitCheck.reason}`);
      }

      // Create session
      const session = await backend.createSession(tenantId, userId, mode);

      // Sign token (short-lived, 5 minutes)
      const token = tokenSigner({
        tenantId,
        userId,
        sessionId: session.sessionId,
        type: "voice_session",
      });

      return { session, token };
    },

    async endSession(sessionId: string) {
      return backend.endSession(sessionId);
    },

    async getUsage(tenantId, periodStart, periodEnd) {
      const metrics = await backend.getUsageMetrics(
        tenantId,
        periodStart,
        periodEnd
      );
      return {
        textMessageCount: metrics.textMessageCount,
        voiceSessionCount: metrics.voiceSessionCount,
        voiceMinutes: metrics.voiceMinutes,
      };
    },
  };
}
