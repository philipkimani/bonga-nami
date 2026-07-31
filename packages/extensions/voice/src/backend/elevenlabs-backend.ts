/**
 * ElevenLabs Voice Backend
 * 
 * Production implementation that proxies to ElevenLabs API.
 * 
 * 📚 ElevenLabs Documentation Reference:
 * - Agents Platform: https://elevenlabs.io/docs/agents-platform/
 * - WebSocket API: https://elevenlabs.io/docs/agents-platform/integrate/websocket
 * - Developer Quickstart: https://elevenlabs.io/docs/developers/
 * 
 * KEY PRINCIPLES:
 * - API keys are fetched per-request from credential provider
 * - Keys are NEVER logged or stored in memory beyond the request
 * - Conversation content is NOT stored, only usage metrics
 * - Each tenant uses their own ElevenLabs account
 */

import type {
  VoiceBackend,
  VoiceCredentialProvider,
  VoicePublicConfig,
  VoiceSession,
  VoiceUsageMetrics,
} from "../types.js";
import { randomUUID } from "crypto";

/**
 * ElevenLabs Voice Backend
 * 
 * This backend:
 * - Fetches credentials from provider at request time
 * - Manages sessions with usage tracking
 * - NEVER stores API keys or conversation content
 */
export class ElevenLabsVoiceBackend implements VoiceBackend {
  private credentialProvider: VoiceCredentialProvider;
  
  // Session storage (in production, use Redis or similar)
  private sessions: Map<string, VoiceSession> = new Map();
  
  // Usage tracking (in production, persist to database)
  private usageByTenant: Map<string, UsageTracker> = new Map();

  constructor(credentialProvider: VoiceCredentialProvider) {
    this.credentialProvider = credentialProvider;
  }

  /**
   * Check if properly configured
   */
  isConfigured(): boolean {
    return (this.credentialProvider as any).isConfigured?.() ?? true;
  }

  /**
   * Get public config for a tenant (safe for browser)
   */
  async getPublicConfig(tenantId: string): Promise<VoicePublicConfig> {
    // Fetch from credential provider (reads tenant's .env)
    const config = await this.credentialProvider.getTenantVoiceConfig(tenantId);

    // Return ONLY public fields
    // NEVER include API key or sensitive rate limit details
    // Also indicate if not configured so widget can show setup message
    return {
      agentId: config.agentId,
      agentName: config.agentName,
      agentDescription: config.agentDescription,
      avatarUrl: config.avatarUrl,
      voiceEnabled: config.voiceEnabled,
      textOnlyMode: config.textOnlyMode ?? !config.voiceEnabled,
      firstMessage: config.firstMessage,
      // Flag for widget to show configuration help
      configured: config.agentId !== "not-configured",
    } as VoicePublicConfig;
  }

  /**
   * Create a new voice session
   */
  async createSession(
    tenantId: string,
    userId?: string,
    mode: "text" | "voice" = "text"
  ): Promise<VoiceSession> {
    // Get config to validate voice is enabled
    const config = await this.credentialProvider.getTenantVoiceConfig(tenantId);

    if (mode === "voice" && !config.voiceEnabled) {
      throw new Error("Voice mode is not enabled for this account");
    }

    const session: VoiceSession = {
      sessionId: `el-session-${randomUUID()}`,
      tenantId,
      userId,
      mode,
      startedAt: new Date(),
      messageCount: 0,
      voiceDurationSeconds: 0,
      status: "active",
    };

    this.sessions.set(session.sessionId, session);

    // Track usage
    const usage = this.getOrCreateUsage(tenantId);
    if (mode === "voice") {
      usage.voiceSessionCount++;
    }

    return session;
  }

  /**
   * End a voice session
   */
  async endSession(sessionId: string): Promise<VoiceSession> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    session.endedAt = new Date();
    session.status = "ended";

    // Calculate duration
    if (session.mode === "voice") {
      const durationMs =
        session.endedAt.getTime() - session.startedAt.getTime();
      session.voiceDurationSeconds = Math.floor(durationMs / 1000);

      // Update usage
      const usage = this.getOrCreateUsage(session.tenantId);
      usage.voiceMinutes += session.voiceDurationSeconds / 60;
    }

    return session;
  }

  /**
   * Record usage for billing
   */
  async recordUsage(
    sessionId: string,
    metrics: {
      messageCount?: number;
      voiceDurationSeconds?: number;
    }
  ): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    if (metrics.messageCount) {
      session.messageCount += metrics.messageCount;

      const usage = this.getOrCreateUsage(session.tenantId);
      usage.textMessageCount += metrics.messageCount;
      usage.addMessageToRateWindow();
    }

    if (metrics.voiceDurationSeconds) {
      session.voiceDurationSeconds =
        (session.voiceDurationSeconds ?? 0) + metrics.voiceDurationSeconds;
    }
  }

  /**
   * Check rate limits for a tenant
   * 
   * NOTE: Rate limiting is currently DISABLED.
   * Clients pay for their own ElevenLabs API usage, so they manage
   * their own limits directly with ElevenLabs.
   * 
   * To re-enable, uncomment the checks below.
   */
  async checkRateLimits(tenantId: string): Promise<{
    allowed: boolean;
    reason?: string;
    remaining?: {
      messagesPerMinute: number;
      voiceMinutesPerDay: number;
    };
  }> {
    // RATE LIMITING DISABLED - Clients manage their own ElevenLabs usage
    // Keeping code structure for future use
    
    const config = await this.credentialProvider.getTenantVoiceConfig(tenantId);
    const limits = config.rateLimits ?? {
      messagesPerMinute: 60,
      voiceMinutesPerDay: 30,
      maxConcurrentSessions: 5,
    };

    const usage = this.getOrCreateUsage(tenantId);
    const messagesThisMinute = usage.getMessagesInLastMinute();

    // === RATE LIMITING DISABLED ===
    // Uncomment the checks below to re-enable rate limiting
    
    /*
    // Check per-minute rate
    if (messagesThisMinute >= limits.messagesPerMinute) {
      return {
        allowed: false,
        reason: `Rate limit: ${limits.messagesPerMinute} messages/minute`,
      };
    }

    // Check daily voice limit
    if (usage.voiceMinutes >= limits.voiceMinutesPerDay) {
      return {
        allowed: false,
        reason: `Daily limit: ${limits.voiceMinutesPerDay} voice minutes`,
      };
    }

    // Check concurrent sessions
    const activeSessions = Array.from(this.sessions.values()).filter(
      (s) => s.tenantId === tenantId && s.status === "active"
    );
    if (activeSessions.length >= limits.maxConcurrentSessions) {
      return {
        allowed: false,
        reason: `Max ${limits.maxConcurrentSessions} concurrent sessions`,
      };
    }
    */

    // Always allow - client manages their own ElevenLabs limits
    return {
      allowed: true,
      remaining: {
        messagesPerMinute: limits.messagesPerMinute - messagesThisMinute,
        voiceMinutesPerDay: limits.voiceMinutesPerDay - usage.voiceMinutes,
      },
    };
  }

  /**
   * Get usage metrics for billing
   */
  async getUsageMetrics(
    tenantId: string,
    periodStart: Date,
    periodEnd: Date
  ): Promise<VoiceUsageMetrics> {
    const usage = this.getOrCreateUsage(tenantId);

    // Filter sessions by period
    const sessionsInPeriod = Array.from(this.sessions.values()).filter(
      (s) =>
        s.tenantId === tenantId &&
        s.startedAt >= periodStart &&
        s.startedAt <= periodEnd
    );

    const voiceSessions = sessionsInPeriod.filter((s) => s.mode === "voice");
    const totalVoiceMinutes = voiceSessions.reduce(
      (sum, s) => sum + (s.voiceDurationSeconds ?? 0) / 60,
      0
    );

    return {
      tenantId,
      periodStart,
      periodEnd,
      textMessageCount: usage.textMessageCount,
      voiceSessionCount: voiceSessions.length,
      voiceMinutes: totalVoiceMinutes,
      peakConcurrentSessions: Math.max(
        ...sessionsInPeriod.map((_, i, arr) =>
          arr.filter((s) => s.status === "active").length
        ),
        0
      ),
    };
  }

  /**
   * Get or create usage tracker for tenant
   */
  private getOrCreateUsage(tenantId: string): UsageTracker {
    if (!this.usageByTenant.has(tenantId)) {
      this.usageByTenant.set(tenantId, new UsageTracker());
    }
    return this.usageByTenant.get(tenantId)!;
  }
}

/**
 * Usage tracker with sliding window rate limiting
 */
class UsageTracker {
  textMessageCount = 0;
  voiceSessionCount = 0;
  voiceMinutes = 0;

  // Sliding window for rate limiting
  private messageTimestamps: number[] = [];
  private readonly windowMs = 60_000; // 1 minute

  addMessageToRateWindow(): void {
    const now = Date.now();
    this.messageTimestamps.push(now);

    // Clean old timestamps
    this.messageTimestamps = this.messageTimestamps.filter(
      (ts) => now - ts < this.windowMs
    );
  }

  getMessagesInLastMinute(): number {
    const now = Date.now();
    return this.messageTimestamps.filter((ts) => now - ts < this.windowMs)
      .length;
  }
}
