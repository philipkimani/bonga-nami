/**
 * Mock Voice Backend
 * 
 * In-memory implementation for testing and demos.
 * Simulates ElevenLabs behavior without making real API calls.
 */

import type {
  VoiceBackend,
  VoicePublicConfig,
  VoiceSession,
  VoiceUsageMetrics,
  TenantVoiceConfig,
} from "../types.js";
import { randomUUID } from "crypto";

/**
 * Mock tenant configurations
 */
const MOCK_TENANT_CONFIGS: Record<string, TenantVoiceConfig> = {
  "platform-client": {
    agentId: "mock-agent-demo-123",
    agentName: "Demo Assistant",
    agentDescription: "AI-powered customer support for demo purposes",
    voiceEnabled: true,
    firstMessage: "Hello! How can I help you today?",
    rateLimits: {
      messagesPerMinute: 60,
      voiceMinutesPerDay: 30,
      maxConcurrentSessions: 5,
    },
  },
  "hotel-client": {
    agentId: "mock-agent-hotel-456",
    agentName: "Hotel Concierge",
    agentDescription: "Your personal hotel assistant",
    voiceEnabled: true,
    firstMessage: "Welcome! How may I assist you with your stay?",
    rateLimits: {
      messagesPerMinute: 30,
      voiceMinutesPerDay: 60,
      maxConcurrentSessions: 10,
    },
  },
};

/**
 * Default config for unknown tenants
 */
const DEFAULT_CONFIG: TenantVoiceConfig = {
  agentId: "mock-agent-default",
  agentName: "AI Assistant",
  voiceEnabled: false,
  rateLimits: {
    messagesPerMinute: 10,
    voiceMinutesPerDay: 5,
    maxConcurrentSessions: 1,
  },
};

export class MockVoiceBackend implements VoiceBackend {
  private sessions: Map<string, VoiceSession> = new Map();
  private usageByTenant: Map<string, {
    textMessages: number;
    voiceSessions: number;
    voiceMinutes: number;
    messagesThisMinute: number;
    lastMinuteReset: number;
  }> = new Map();

  /**
   * Get public config for a tenant
   */
  async getPublicConfig(tenantId: string): Promise<VoicePublicConfig> {
    const config = MOCK_TENANT_CONFIGS[tenantId] ?? DEFAULT_CONFIG;
    
    // Return only public fields (no API keys, no rate limit details)
    return {
      agentId: config.agentId,
      agentName: config.agentName,
      agentDescription: config.agentDescription,
      avatarUrl: config.avatarUrl,
      voiceEnabled: config.voiceEnabled,
      firstMessage: config.firstMessage,
    };
  }

  /**
   * Create a new voice session
   */
  async createSession(
    tenantId: string,
    userId?: string,
    mode: "text" | "voice" = "text"
  ): Promise<VoiceSession> {
    const config = MOCK_TENANT_CONFIGS[tenantId] ?? DEFAULT_CONFIG;
    
    // Check if voice is enabled for voice mode
    if (mode === "voice" && !config.voiceEnabled) {
      throw new Error("Voice is not enabled for this tenant");
    }

    const session: VoiceSession = {
      sessionId: `mock-session-${randomUUID()}`,
      tenantId,
      userId,
      mode,
      startedAt: new Date(),
      messageCount: 0,
      voiceDurationSeconds: 0,
      status: "active",
    };

    this.sessions.set(session.sessionId, session);

    // Update usage tracking
    const usage = this.getOrCreateUsage(tenantId);
    if (mode === "voice") {
      usage.voiceSessions++;
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

    // Calculate duration for voice sessions
    if (session.mode === "voice") {
      const durationMs = session.endedAt.getTime() - session.startedAt.getTime();
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

      // Update tenant usage
      const usage = this.getOrCreateUsage(session.tenantId);
      usage.textMessages += metrics.messageCount;
      usage.messagesThisMinute += metrics.messageCount;
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
    
    const config = MOCK_TENANT_CONFIGS[tenantId] ?? DEFAULT_CONFIG;
    const limits = config.rateLimits!;
    const usage = this.getOrCreateUsage(tenantId);

    // Reset minute counter if needed (for tracking only)
    const now = Date.now();
    if (now - usage.lastMinuteReset > 60000) {
      usage.messagesThisMinute = 0;
      usage.lastMinuteReset = now;
    }

    // === RATE LIMITING DISABLED ===
    // Uncomment the checks below to re-enable rate limiting
    
    /*
    // Check message rate limit
    if (usage.messagesThisMinute >= limits.messagesPerMinute) {
      return {
        allowed: false,
        reason: `Message rate limit exceeded (${limits.messagesPerMinute}/min)`,
      };
    }

    // Check daily voice limit
    if (usage.voiceMinutes >= limits.voiceMinutesPerDay) {
      return {
        allowed: false,
        reason: `Daily voice limit exceeded (${limits.voiceMinutesPerDay} minutes)`,
      };
    }

    // Check concurrent sessions
    const activeSessions = Array.from(this.sessions.values()).filter(
      (s) => s.tenantId === tenantId && s.status === "active"
    );
    if (activeSessions.length >= limits.maxConcurrentSessions) {
      return {
        allowed: false,
        reason: `Max concurrent sessions reached (${limits.maxConcurrentSessions})`,
      };
    }
    */

    // Always allow - client manages their own ElevenLabs limits
    return {
      allowed: true,
      remaining: {
        messagesPerMinute: limits.messagesPerMinute - usage.messagesThisMinute,
        voiceMinutesPerDay: limits.voiceMinutesPerDay - usage.voiceMinutes,
      },
    };
  }

  /**
   * Get usage metrics for a tenant
   */
  async getUsageMetrics(
    tenantId: string,
    periodStart: Date,
    periodEnd: Date
  ): Promise<VoiceUsageMetrics> {
    const usage = this.getOrCreateUsage(tenantId);

    // Count sessions in period
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
      textMessageCount: usage.textMessages,
      voiceSessionCount: voiceSessions.length,
      voiceMinutes: totalVoiceMinutes,
      peakConcurrentSessions: sessionsInPeriod.filter(
        (s) => s.status === "active"
      ).length,
    };
  }

  /**
   * Get or create usage tracking for a tenant
   */
  private getOrCreateUsage(tenantId: string) {
    if (!this.usageByTenant.has(tenantId)) {
      this.usageByTenant.set(tenantId, {
        textMessages: 0,
        voiceSessions: 0,
        voiceMinutes: 0,
        messagesThisMinute: 0,
        lastMinuteReset: Date.now(),
      });
    }
    return this.usageByTenant.get(tenantId)!;
  }

  /**
   * Reset all mock data (for testing)
   */
  reset(): void {
    this.sessions.clear();
    this.usageByTenant.clear();
  }

  /**
   * Add or update a mock tenant config (for testing)
   */
  setTenantConfig(tenantId: string, config: TenantVoiceConfig): void {
    MOCK_TENANT_CONFIGS[tenantId] = config;
  }
}
