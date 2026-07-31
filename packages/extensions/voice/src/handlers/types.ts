/**
 * Voice HTTP Handler Types
 * 
 * Framework-agnostic types for HTTP handlers.
 * These allow the same logic to work with Express, Next.js, Fastify, etc.
 */

/**
 * Generic HTTP request interface
 */
export interface HttpRequest {
  method: string;
  url: string;
  headers: Record<string, string | string[] | undefined>;
  query: Record<string, string | string[] | undefined>;
  body?: unknown;
  params?: Record<string, string>;
}

/**
 * Generic HTTP response interface
 */
export interface HttpResponse {
  status: number;
  headers: Record<string, string>;
  body: unknown;
}

/**
 * Generic handler function
 */
export type Handler = (req: HttpRequest) => Promise<HttpResponse>;

/**
 * Voice configuration for handlers
 */
export interface VoiceHandlerConfig {
  /** ElevenLabs API key (from env) */
  apiKey: string;
  /** ElevenLabs Agent ID */
  agentId: string;
  /** Agent display name */
  agentName?: string;
  /** Whether voice is enabled */
  voiceEnabled?: boolean;
  /** Text-only mode (no WebRTC) */
  textOnlyMode?: boolean;
  /** Connection type preference */
  connectionType?: 'websocket' | 'webrtc';
  /** Max session duration in ms */
  maxSessionDuration?: number;
}

/**
 * Voice public config (safe to send to client)
 */
export interface VoicePublicConfig {
  agentId: string;
  agentName: string;
  voiceEnabled: boolean;
  textOnlyMode: boolean;
  maxSessionDuration: number;
  connectionType: 'websocket' | 'webrtc';
}

/**
 * Voice session response
 */
export interface VoiceSessionResponse {
  sessionId: string;
  signedUrl?: string;
  conversationToken?: string;
  expiresAt: number;
}
