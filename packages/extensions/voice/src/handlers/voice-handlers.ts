/**
 * Voice HTTP Handlers
 * 
 * Framework-agnostic HTTP handlers for voice API.
 * These handle the actual ElevenLabs API calls.
 */

import type {
  Handler,
  HttpRequest,
  HttpResponse,
  VoiceHandlerConfig,
  VoicePublicConfig,
  VoiceSessionResponse,
} from './types.js';

const ELEVENLABS_API_BASE = 'https://api.elevenlabs.io/v1';

/**
 * In-memory session store (use Redis in production)
 */
const activeSessions = new Map<string, {
  sessionId: string;
  userId?: string;
  startedAt: number;
  expiresAt: number;
}>();

/**
 * Create voice HTTP handlers
 */
export function createVoiceHandlers(config: VoiceHandlerConfig): {
  getConfig: Handler;
  createSession: Handler;
  endSession: Handler;
  listSessions: Handler;
} {
  const {
    apiKey,
    agentId,
    agentName = 'Voice Assistant',
    voiceEnabled = true,
    textOnlyMode = false,
    connectionType = 'websocket',
    maxSessionDuration = 1800000, // 30 min
  } = config;

  /**
   * GET /config - Returns public voice configuration
   */
  const getConfig: Handler = async () => {
    if (!apiKey || !agentId) {
      return {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
        body: { error: 'Voice not configured for this tenant' },
      };
    }

    const publicConfig: VoicePublicConfig = {
      agentId,
      agentName,
      voiceEnabled,
      textOnlyMode,
      maxSessionDuration,
      connectionType,
    };

    return {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: publicConfig,
    };
  };

  /**
   * POST /session - Creates a voice session with signed URL
   */
  const createSession: Handler = async (req) => {
    if (!apiKey || !agentId) {
      return {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
        body: { error: 'Voice not configured' },
      };
    }

    if (!voiceEnabled) {
      return {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
        body: { error: 'Voice is disabled' },
      };
    }

    try {
      const body = req.body as { userId?: string; metadata?: Record<string, unknown> } | undefined;
      const userId = body?.userId;

      let signedUrl: string | undefined;
      let conversationToken: string | undefined;

      if (connectionType === 'websocket') {
        // Get signed URL for WebSocket connection
        const response = await fetch(
          `${ELEVENLABS_API_BASE}/convai/conversation/get-signed-url?agent_id=${agentId}`,
          {
            method: 'GET',
            headers: { 'xi-api-key': apiKey },
          }
        );

        if (!response.ok) {
          const error = await response.text();
          console.error('[Voice] Failed to get signed URL:', error);
          return {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
            body: { error: 'Failed to create voice session' },
          };
        }

        const data = await response.json() as { signed_url?: string };
        signedUrl = data.signed_url;
      } else {
        // Get conversation token for WebRTC connection
        const response = await fetch(
          `${ELEVENLABS_API_BASE}/convai/conversation/token?agent_id=${agentId}`,
          {
            method: 'GET',
            headers: { 'xi-api-key': apiKey },
          }
        );

        if (!response.ok) {
          const error = await response.text();
          console.error('[Voice] Failed to get conversation token:', error);
          return {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
            body: { error: 'Failed to create voice session' },
          };
        }

        const data = await response.json() as { token?: string };
        conversationToken = data.token;
      }

      // Create session record
      const sessionId = `voice_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const now = Date.now();
      const expiresAt = now + maxSessionDuration;

      activeSessions.set(sessionId, {
        sessionId,
        userId,
        startedAt: now,
        expiresAt,
      });

      console.log(`[Voice] Session created: ${sessionId} for user: ${userId || 'anonymous'}`);

      const response: VoiceSessionResponse = {
        sessionId,
        signedUrl,
        conversationToken,
        expiresAt,
      };

      return {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: response,
      };
    } catch (error) {
      console.error('[Voice] Session creation error:', error);
      return {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
        body: { error: 'Internal server error' },
      };
    }
  };

  /**
   * DELETE /session/:sessionId - Ends a voice session
   */
  const endSession: Handler = async (req) => {
    const sessionId = req.params?.sessionId;
    
    if (!sessionId) {
      return {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
        body: { error: 'Session ID required' },
      };
    }

    const session = activeSessions.get(sessionId);
    if (!session) {
      return {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
        body: { error: 'Session not found' },
      };
    }

    activeSessions.delete(sessionId);
    console.log(`[Voice] Session ended: ${sessionId}`);

    return {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: {
        sessionId,
        durationMs: Date.now() - session.startedAt,
        ended: true,
      },
    };
  };

  /**
   * GET /session - Lists active sessions (admin/debug)
   */
  const listSessions: Handler = async () => {
    const sessions = Array.from(activeSessions.values());
    const now = Date.now();

    return {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: {
        count: sessions.length,
        sessions: sessions.map(s => ({
          sessionId: s.sessionId,
          userId: s.userId,
          startedAt: s.startedAt,
          expiresAt: s.expiresAt,
          isExpired: now > s.expiresAt,
        })),
      },
    };
  };

  return {
    getConfig,
    createSession,
    endSession,
    listSessions,
  };
}

/**
 * Get config from environment variables
 */
export function getConfigFromEnv(): VoiceHandlerConfig {
  return {
    apiKey: process.env.ELEVENLABS_API_KEY || '',
    agentId: process.env.ELEVENLABS_AGENT_ID || '',
    agentName: process.env.ELEVENLABS_AGENT_NAME || 'Voice Assistant',
    voiceEnabled: process.env.ELEVENLABS_VOICE_ENABLED === 'true',
    textOnlyMode: process.env.ELEVENLABS_TEXT_ONLY_MODE === 'true',
    connectionType: (process.env.ELEVENLABS_CONNECTION_TYPE as 'websocket' | 'webrtc') || 'websocket',
    maxSessionDuration: parseInt(process.env.ELEVENLABS_MAX_SESSION_DURATION || '1800000', 10),
  };
}
