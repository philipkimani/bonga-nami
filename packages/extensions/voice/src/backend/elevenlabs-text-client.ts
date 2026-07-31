/**
 * ElevenLabs Text Conversation Client
 * 
 * Server-side WebSocket client for text-only conversations with ElevenLabs.
 * Used for WhatsApp, SMS, and other text-based channels.
 * 
 * This connects to the same ElevenLabs agent that powers the web widget,
 * but communicates via text messages only (no audio).
 */

import WebSocket from 'ws';

export interface TextConversationConfig {
  agentId: string;
  apiKey: string;
  /** Dynamic variables to pass to the agent */
  dynamicVariables?: Record<string, string>;
  /** Timeout for waiting for response (ms) */
  responseTimeout?: number;
}

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface ElevenLabsMessage {
  type: string;
  [key: string]: unknown;
}

/**
 * Text-only conversation session with ElevenLabs
 */
export class ElevenLabsTextSession {
  private ws: WebSocket | null = null;
  private config: TextConversationConfig;
  private conversationId: string | null = null;
  private responseResolver: ((text: string) => void) | null = null;
  private responseBuffer: string = '';
  private isConnected: boolean = false;

  constructor(config: TextConversationConfig) {
    this.config = {
      responseTimeout: 30000, // 30 second default timeout
      ...config,
    };
  }

  /**
   * Connect to ElevenLabs and start a conversation session
   */
  async connect(): Promise<void> {
    if (this.isConnected) return;

    // Get signed URL from ElevenLabs
    const signedUrl = await this.getSignedUrl();
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Connection timeout'));
      }, 10000);

      this.ws = new WebSocket(signedUrl);

      this.ws.on('open', () => {
        console.log('[ElevenLabs] WebSocket connected');
        clearTimeout(timeout);
        this.isConnected = true;
        
        // Send initial configuration with dynamic variables
        this.sendConfig();
        resolve();
      });

      this.ws.on('message', (data) => {
        this.handleMessage(data.toString());
      });

      this.ws.on('error', (error) => {
        console.error('[ElevenLabs] WebSocket error:', error);
        clearTimeout(timeout);
        reject(error);
      });

      this.ws.on('close', () => {
        console.log('[ElevenLabs] WebSocket closed');
        this.isConnected = false;
        this.ws = null;
      });
    });
  }

  /**
   * Get signed URL from ElevenLabs API
   */
  private async getSignedUrl(): Promise<string> {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversation/get_signed_url?agent_id=${this.config.agentId}`,
      {
        method: 'GET',
        headers: {
          'xi-api-key': this.config.apiKey,
        },
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to get signed URL: ${error}`);
    }

    const data = await response.json() as { signed_url: string };
    return data.signed_url;
  }

  /**
   * Send initial configuration to ElevenLabs
   */
  private sendConfig(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    // Send conversation config with dynamic variables
    if (this.config.dynamicVariables && Object.keys(this.config.dynamicVariables).length > 0) {
      this.ws.send(JSON.stringify({
        type: 'conversation_config',
        dynamic_variables: this.config.dynamicVariables,
      }));
    }
  }

  /**
   * Handle incoming WebSocket messages
   */
  private handleMessage(data: string): void {
    try {
      const message = JSON.parse(data) as ElevenLabsMessage;
      
      switch (message.type) {
        case 'conversation_initiation_metadata':
          this.conversationId = message.conversation_id as string;
          console.log('[ElevenLabs] Conversation started:', this.conversationId);
          break;

        case 'agent_response':
          // Agent is starting to respond
          this.responseBuffer = '';
          break;

        case 'audio':
          // We ignore audio in text-only mode, but transcript comes with it
          break;

        case 'transcript':
          // This is the agent's text response (or user transcription)
          const role = message.role as string;
          const text = message.message as string;
          
          if (role === 'agent' && text) {
            this.responseBuffer = text;
          }
          break;

        case 'agent_response_correction':
          // Updated/corrected response
          const correctedText = message.message as string;
          if (correctedText) {
            this.responseBuffer = correctedText;
          }
          break;

        case 'interruption':
          // User interrupted - rare in text mode
          break;

        case 'ping':
          // Keep-alive ping
          this.ws?.send(JSON.stringify({ type: 'pong' }));
          break;

        case 'user_transcript':
          // Echo of user's message (for voice, this is ASR result)
          break;

        case 'turn_ended':
          // Agent finished responding
          if (this.responseResolver && this.responseBuffer) {
            this.responseResolver(this.responseBuffer);
            this.responseResolver = null;
            this.responseBuffer = '';
          }
          break;

        case 'error':
          console.error('[ElevenLabs] Error:', message);
          if (this.responseResolver) {
            this.responseResolver('Sorry, I encountered an error. Please try again.');
            this.responseResolver = null;
          }
          break;

        default:
          // Log unknown message types for debugging
          console.log('[ElevenLabs] Unknown message type:', message.type);
      }
    } catch (error) {
      console.error('[ElevenLabs] Failed to parse message:', error);
    }
  }

  /**
   * Send a text message and wait for response
   */
  async sendMessage(text: string): Promise<string> {
    if (!this.ws || !this.isConnected) {
      throw new Error('Not connected to ElevenLabs');
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.responseResolver = null;
        reject(new Error('Response timeout'));
      }, this.config.responseTimeout);

      this.responseResolver = (response) => {
        clearTimeout(timeout);
        resolve(response);
      };

      // Send user message
      this.ws!.send(JSON.stringify({
        type: 'user_message',
        text: text,
      }));

      // Signal end of user turn
      this.ws!.send(JSON.stringify({
        type: 'user_activity',
      }));
    });
  }

  /**
   * End the conversation session
   */
  async disconnect(): Promise<void> {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
    this.conversationId = null;
  }

  /**
   * Check if connected
   */
  get connected(): boolean {
    return this.isConnected;
  }

  /**
   * Get conversation ID
   */
  get id(): string | null {
    return this.conversationId;
  }
}

/**
 * Conversation session manager for WhatsApp/SMS
 * 
 * Manages multiple concurrent conversation sessions, one per user.
 * Sessions are cached and reused to maintain conversation context.
 */
export class TextConversationManager {
  private sessions: Map<string, ElevenLabsTextSession> = new Map();
  private config: Omit<TextConversationConfig, 'dynamicVariables'>;
  private sessionTimeouts: Map<string, NodeJS.Timeout> = new Map();
  private inactivityTimeout: number;

  constructor(config: Omit<TextConversationConfig, 'dynamicVariables'>, inactivityTimeoutMs: number = 10 * 60 * 1000) {
    this.config = config;
    this.inactivityTimeout = inactivityTimeoutMs; // Default 10 minutes
  }

  /**
   * Get or create a session for a user
   */
  async getSession(
    userId: string, 
    dynamicVariables?: Record<string, string>
  ): Promise<ElevenLabsTextSession> {
    // Check for existing session
    let session = this.sessions.get(userId);
    
    if (session && session.connected) {
      // Reset inactivity timeout
      this.resetTimeout(userId);
      return session;
    }

    // Create new session
    session = new ElevenLabsTextSession({
      ...this.config,
      dynamicVariables,
    });

    await session.connect();
    this.sessions.set(userId, session);
    this.resetTimeout(userId);

    return session;
  }

  /**
   * Send a message for a user
   */
  async sendMessage(
    userId: string, 
    text: string,
    dynamicVariables?: Record<string, string>
  ): Promise<string> {
    const session = await this.getSession(userId, dynamicVariables);
    return session.sendMessage(text);
  }

  /**
   * End a user's session
   */
  async endSession(userId: string): Promise<void> {
    const session = this.sessions.get(userId);
    if (session) {
      await session.disconnect();
      this.sessions.delete(userId);
    }
    
    const timeout = this.sessionTimeouts.get(userId);
    if (timeout) {
      clearTimeout(timeout);
      this.sessionTimeouts.delete(userId);
    }
  }

  /**
   * Reset inactivity timeout for a user
   */
  private resetTimeout(userId: string): void {
    const existing = this.sessionTimeouts.get(userId);
    if (existing) {
      clearTimeout(existing);
    }

    const timeout = setTimeout(() => {
      console.log(`[TextConversation] Session timeout for user: ${userId}`);
      this.endSession(userId);
    }, this.inactivityTimeout);

    this.sessionTimeouts.set(userId, timeout);
  }

  /**
   * Clean up all sessions
   */
  async cleanup(): Promise<void> {
    for (const userId of this.sessions.keys()) {
      await this.endSession(userId);
    }
  }
}
