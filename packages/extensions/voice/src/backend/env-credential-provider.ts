/**
 * Environment-based Credential Provider
 * 
 * Reads ElevenLabs credentials from environment variables.
 * This is the simplest implementation where each tenant deployment
 * has their own .env file with their credentials.
 * 
 * SECURITY: In production, tenants deploy their own instance
 * with their own .env. The platform never sees these values.
 */

import type { VoiceCredentialProvider, TenantVoiceConfig } from "../types.js";
import { TenantVoiceConfigSchema } from "../types.js";

/**
 * Environment variable names
 */
const ENV_KEYS = {
  API_KEY: "ELEVENLABS_API_KEY",
  AGENT_ID: "ELEVENLABS_AGENT_ID",
  AGENT_NAME: "ELEVENLABS_AGENT_NAME",
  AGENT_DESCRIPTION: "ELEVENLABS_AGENT_DESCRIPTION",
  AVATAR_URL: "ELEVENLABS_AVATAR_URL",
  VOICE_ENABLED: "ELEVENLABS_VOICE_ENABLED",
  FIRST_MESSAGE: "ELEVENLABS_FIRST_MESSAGE",
  RATE_LIMIT_MESSAGES_PER_MINUTE: "ELEVENLABS_RATE_LIMIT_MESSAGES_PER_MINUTE",
  RATE_LIMIT_VOICE_MINUTES_PER_DAY: "ELEVENLABS_RATE_LIMIT_VOICE_MINUTES_PER_DAY",
  RATE_LIMIT_MAX_CONCURRENT: "ELEVENLABS_RATE_LIMIT_MAX_CONCURRENT",
} as const;

export class EnvCredentialProvider implements VoiceCredentialProvider {
  /**
   * Get ElevenLabs API key from environment.
   * 
   * CRITICAL: This key should only exist in the tenant's .env,
   * never in the platform's infrastructure.
   */
  async getElevenLabsApiKey(_tenantId: string): Promise<string> {
    const apiKey = process.env[ENV_KEYS.API_KEY];
    
    if (!apiKey) {
      throw new Error(
        `ElevenLabs API key not configured. ` +
        `Set ${ENV_KEYS.API_KEY} in your environment.`
      );
    }
    
    // Never log the key!
    return apiKey;
  }

  /**
   * Check if ElevenLabs is properly configured
   */
  isConfigured(): boolean {
    return !!(process.env[ENV_KEYS.API_KEY] && process.env[ENV_KEYS.AGENT_ID]);
  }

  /**
   * Get full tenant voice config from environment.
   * Returns a safe "unconfigured" state if credentials are missing.
   */
  async getTenantVoiceConfig(_tenantId: string): Promise<TenantVoiceConfig> {
    const agentId = process.env[ENV_KEYS.AGENT_ID];
    const apiKey = process.env[ENV_KEYS.API_KEY];
    
    // If credentials are missing, return a safe "not configured" state
    // This allows the widget to show a helpful message instead of crashing
    if (!agentId || !apiKey) {
      console.warn(
        `[VoiceBackend] ElevenLabs not configured. ` +
        `Set ${ENV_KEYS.API_KEY} and ${ENV_KEYS.AGENT_ID} in your environment.`
      );
      return {
        agentId: "not-configured",
        agentName: "AI Assistant",
        agentDescription: "Voice assistant (not configured)",
        voiceEnabled: false,
        textOnlyMode: true,
        maxSessionDuration: 0,
        connectionType: "websocket",
        rateLimits: {
          messagesPerMinute: 0,
          voiceMinutesPerDay: 0,
          maxConcurrentSessions: 0,
        },
      } as TenantVoiceConfig;
    }

    const rawConfig = {
      agentId,
      agentName: process.env[ENV_KEYS.AGENT_NAME] ?? "AI Assistant",
      agentDescription: process.env[ENV_KEYS.AGENT_DESCRIPTION],
      avatarUrl: process.env[ENV_KEYS.AVATAR_URL],
      voiceEnabled: process.env[ENV_KEYS.VOICE_ENABLED] !== "false",  // Default to true if configured
      firstMessage: process.env[ENV_KEYS.FIRST_MESSAGE],
      rateLimits: {
        messagesPerMinute: parseInt(
          process.env[ENV_KEYS.RATE_LIMIT_MESSAGES_PER_MINUTE] ?? "60",
          10
        ),
        voiceMinutesPerDay: parseInt(
          process.env[ENV_KEYS.RATE_LIMIT_VOICE_MINUTES_PER_DAY] ?? "30",
          10
        ),
        maxConcurrentSessions: parseInt(
          process.env[ENV_KEYS.RATE_LIMIT_MAX_CONCURRENT] ?? "5",
          10
        ),
      },
    };

    // Validate config
    const parsed = TenantVoiceConfigSchema.safeParse(rawConfig);
    if (!parsed.success) {
      throw new Error(
        `Invalid voice configuration: ${parsed.error.message}`
      );
    }

    return parsed.data as TenantVoiceConfig;
  }
}

/**
 * Create a credential provider from explicit values.
 * Useful for testing or programmatic configuration.
 */
export function createCredentialProvider(
  apiKey: string,
  config: TenantVoiceConfig
): VoiceCredentialProvider {
  return {
    async getElevenLabsApiKey() {
      return apiKey;
    },
    async getTenantVoiceConfig() {
      return config;
    },
  };
}
