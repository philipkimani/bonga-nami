/**
 * Voice Extension Types
 * 
 * Tenant-aware voice/conversational AI types.
 * These are designed for multi-tenant SaaS where each client
 * has their own ElevenLabs account and credentials.
 * 
 * KEY PRINCIPLE: Platform never stores client API keys.
 * Keys are passed per-request or stored encrypted in client's infrastructure.
 */

import { z } from "zod";

/**
 * ============================================================================
 * TENANT VOICE CONFIGURATION
 * ============================================================================
 * 
 * Configuration that a tenant provides for voice capabilities.
 * This is what gets stored in the tenant's infrastructure.
 */
export interface TenantVoiceConfig {
  /** ElevenLabs Agent ID (from tenant's ElevenLabs account) */
  agentId: string;
  
  /** Display name for the voice agent in UI */
  agentName: string;
  
  /** Optional description shown in UI */
  agentDescription?: string;
  
  /** Avatar/logo URL for the agent */
  avatarUrl?: string;
  
  /** Whether voice (WebRTC) is enabled, or text-only */
  voiceEnabled: boolean;
  
  /** Whether to force text-only mode */
  textOnlyMode?: boolean;
  
  /** Custom first message when conversation starts */
  firstMessage?: string;
  
  /** Rate limits for this tenant's voice usage */
  rateLimits?: VoiceRateLimits;
}

/**
 * Rate limits per tenant tier
 */
export interface VoiceRateLimits {
  /** Max text messages per minute */
  messagesPerMinute: number;
  
  /** Max voice minutes per day */
  voiceMinutesPerDay: number;
  
  /** Max concurrent voice sessions */
  maxConcurrentSessions: number;
}

/**
 * Zod schema for validating tenant voice config
 */
export const TenantVoiceConfigSchema = z.object({
  agentId: z.string().min(1, "Agent ID is required"),
  agentName: z.string().min(1, "Agent name is required"),
  agentDescription: z.string().optional(),
  avatarUrl: z.string().url().optional(),
  voiceEnabled: z.boolean().default(false),
  textOnlyMode: z.boolean().optional(),
  firstMessage: z.string().optional(),
  rateLimits: z.object({
    messagesPerMinute: z.number().int().positive().default(60),
    voiceMinutesPerDay: z.number().int().positive().default(30),
    maxConcurrentSessions: z.number().int().positive().default(5),
  }).optional(),
});

/**
 * ============================================================================
 * PUBLIC CONFIG (Sent to Client)
 * ============================================================================
 * 
 * Safe configuration that can be sent to the browser.
 * NEVER includes API keys or sensitive data.
 */
export interface VoicePublicConfig {
  /** Agent ID - safe to expose (needed for ElevenLabs SDK) */
  agentId: string;
  
  /** Display name */
  agentName: string;
  
  /** Description */
  agentDescription?: string;
  
  /** Avatar URL */
  avatarUrl?: string;
  
  /** Whether voice is enabled */
  voiceEnabled: boolean;
  
  /** Whether to force text-only mode */
  textOnlyMode?: boolean;
  
  /** Custom first message */
  firstMessage?: string;
}

/**
 * ============================================================================
 * VOICE SESSION
 * ============================================================================
 * 
 * Represents an active voice/chat session.
 * Used for tracking, billing, and rate limiting.
 */
export interface VoiceSession {
  /** Unique session identifier */
  sessionId: string;
  
  /** Tenant this session belongs to */
  tenantId: string;
  
  /** User within the tenant */
  userId?: string;
  
  /** Session type */
  mode: "text" | "voice";
  
  /** When the session started */
  startedAt: Date;
  
  /** When the session ended (if ended) */
  endedAt?: Date;
  
  /** Total messages in this session */
  messageCount: number;
  
  /** Voice duration in seconds (if voice mode) */
  voiceDurationSeconds?: number;
  
  /** Session status */
  status: "active" | "ended" | "error";
}

/**
 * ============================================================================
 * VOICE SESSION TOKEN
 * ============================================================================
 * 
 * JWT payload for signed session tokens.
 * Used to authenticate WebSocket connections without exposing API keys.
 */
export interface VoiceSessionTokenPayload {
  /** Tenant ID */
  tenantId: string;
  
  /** User ID within tenant */
  userId?: string;
  
  /** Session ID */
  sessionId: string;
  
  /** Agent ID to connect to */
  agentId: string;
  
  /** Token type discriminator */
  type: "voice_session";
  
  /** When token was issued (Unix timestamp) */
  iat: number;
  
  /** When token expires (Unix timestamp) */
  exp: number;
}

/**
 * ============================================================================
 * VOICE USAGE METRICS
 * ============================================================================
 * 
 * Metrics for billing and monitoring.
 * Platform can aggregate these without seeing conversation content.
 */
export interface VoiceUsageMetrics {
  /** Tenant ID */
  tenantId: string;
  
  /** Period start */
  periodStart: Date;
  
  /** Period end */
  periodEnd: Date;
  
  /** Total text messages */
  textMessageCount: number;
  
  /** Total voice sessions */
  voiceSessionCount: number;
  
  /** Total voice minutes */
  voiceMinutes: number;
  
  /** Peak concurrent sessions */
  peakConcurrentSessions: number;
}

/**
 * ============================================================================
 * VOICE BACKEND CONTRACT
 * ============================================================================
 * 
 * Abstract interface for voice backends.
 * Allows swapping between different implementations:
 * - ElevenLabs (production)
 * - Mock (testing/demos)
 * - Other providers (future)
 */
export interface VoiceBackend {
  /**
   * Get public config for a tenant (safe to send to browser)
   */
  getPublicConfig(tenantId: string): Promise<VoicePublicConfig>;
  
  /**
   * Create a new voice session
   */
  createSession(
    tenantId: string,
    userId?: string,
    mode?: "text" | "voice"
  ): Promise<VoiceSession>;
  
  /**
   * End a voice session
   */
  endSession(sessionId: string): Promise<VoiceSession>;
  
  /**
   * Record usage for billing
   */
  recordUsage(
    sessionId: string,
    metrics: {
      messageCount?: number;
      voiceDurationSeconds?: number;
    }
  ): Promise<void>;
  
  /**
   * Check rate limits for a tenant
   */
  checkRateLimits(tenantId: string): Promise<{
    allowed: boolean;
    reason?: string;
    remaining?: {
      messagesPerMinute: number;
      voiceMinutesPerDay: number;
    };
  }>;
  
  /**
   * Get usage metrics for a tenant
   */
  getUsageMetrics(
    tenantId: string,
    periodStart: Date,
    periodEnd: Date
  ): Promise<VoiceUsageMetrics>;
}

/**
 * ============================================================================
 * CREDENTIAL PROVIDER CONTRACT
 * ============================================================================
 * 
 * Interface for retrieving tenant credentials.
 * This is implemented by the CLIENT, not the platform.
 * 
 * CRITICAL: Platform code NEVER stores or logs these credentials.
 * They're fetched at request time and used immediately.
 */
export interface VoiceCredentialProvider {
  /**
   * Get ElevenLabs API key for a tenant.
   * Called at session start time.
   * 
   * @param tenantId - The tenant requesting credentials
   * @returns The decrypted API key (handle with care!)
   */
  getElevenLabsApiKey(tenantId: string): Promise<string>;
  
  /**
   * Get the full tenant voice config.
   * 
   * @param tenantId - The tenant ID
   * @returns Full config including agent ID
   */
  getTenantVoiceConfig(tenantId: string): Promise<TenantVoiceConfig>;
}

/**
 * ============================================================================
 * WEBHOOK EVENTS
 * ============================================================================
 * 
 * Events that can be sent to a webhook for billing/analytics.
 * These are designed to NOT contain conversation content.
 */
export type VoiceWebhookEvent = 
  | VoiceSessionStartedEvent
  | VoiceSessionEndedEvent
  | VoiceUsageReportEvent;

export interface VoiceSessionStartedEvent {
  type: "voice.session.started";
  tenantId: string;
  sessionId: string;
  mode: "text" | "voice";
  timestamp: string;
}

export interface VoiceSessionEndedEvent {
  type: "voice.session.ended";
  tenantId: string;
  sessionId: string;
  durationSeconds: number;
  messageCount: number;
  timestamp: string;
}

export interface VoiceUsageReportEvent {
  type: "voice.usage.report";
  tenantId: string;
  periodStart: string;
  periodEnd: string;
  metrics: VoiceUsageMetrics;
  timestamp: string;
}
/**
 * ============================================================================
 * DYNAMIC VARIABLES
 * ============================================================================
 * 
 * Dynamic variables allow passing user context to conversations.
 * These are replaced in prompts at runtime.
 * 
 * 📚 ElevenLabs Documentation:
 * - https://elevenlabs.io/docs/agents-platform/customization/dynamic-variables
 * 
 * Example usage in agent prompt:
 *   "Hello {{user_name}}! I see you have {{cart_items}} items in your cart."
 * 
 * When starting conversation, pass:
 *   { user_name: "John", cart_items: "3" }
 */

/**
 * Dynamic variable values to pass to conversation
 */
export interface DynamicVariables {
  /** User's name for personalization */
  user_name?: string;
  
  /** User's email */
  user_email?: string;
  
  /** Number of items in cart */
  cart_items?: string;
  
  /** Cart total amount */
  cart_total?: string;
  
  /** User's preferred language */
  language?: string;
  
  /** User's timezone */
  timezone?: string;
  
  /** Current page/location in app */
  current_page?: string;
  
  /** User's membership tier */
  membership_tier?: string;
  
  /** Any custom variables */
  [key: string]: string | undefined;
}

/**
 * Zod schema for dynamic variables validation
 */
export const DynamicVariablesSchema = z.record(z.string().optional());

/**
 * Context to pass when starting a conversation
 */
export interface ConversationContext {
  /** Dynamic variables for prompt substitution */
  dynamicVariables?: DynamicVariables;
  
  /** Custom metadata to associate with conversation */
  metadata?: Record<string, unknown>;
  
  /** Override first message */
  firstMessage?: string;
  
  /** Override agent system prompt (if allowed) */
  systemPromptOverride?: string;
}

/**
 * ============================================================================
 * CONVERSATION EVENTS
 * ============================================================================
 * 
 * Events emitted during conversation for analytics and actions.
 * 
 * 📚 ElevenLabs Documentation:
 * - https://elevenlabs.io/docs/agents-platform/customization/conversation-events
 */

export type ConversationEventType =
  | "conversation.started"
  | "conversation.ended"
  | "conversation.message.user"
  | "conversation.message.agent"
  | "conversation.tool.called"
  | "conversation.tool.completed"
  | "conversation.error"
  | "conversation.interrupt";

export interface ConversationEvent<T = unknown> {
  /** Event type */
  type: ConversationEventType;
  
  /** Conversation/session ID */
  conversationId: string;
  
  /** Tenant ID */
  tenantId: string;
  
  /** Timestamp */
  timestamp: Date;
  
  /** Event-specific data */
  data: T;
}

/**
 * Tool call event data
 */
export interface ToolCallEventData {
  /** Tool ID that was called */
  toolId: string;
  
  /** Tool name */
  toolName: string;
  
  /** Parameters passed to tool */
  parameters: Record<string, unknown>;
  
  /** Where tool executed */
  executionContext: "server" | "client";
}

/**
 * Tool completed event data
 */
export interface ToolCompletedEventData extends ToolCallEventData {
  /** Whether tool succeeded */
  success: boolean;
  
  /** Tool result (if any) */
  result?: unknown;
  
  /** Error message (if failed) */
  error?: string;
  
  /** Execution duration in ms */
  durationMs: number;
}