/**
 * Voice Chat Widget - React Component
 * 
 * A fully-featured voice chat widget using ElevenLabs Conversational AI.
 * Supports both voice (WebRTC/WebSocket) and text-only modes.
 * 
 * USAGE:
 * ```tsx
 * import { VoiceChatWidget } from '@platform/voice-extension/react';
 * 
 * <VoiceChatWidget
 *   voiceApiEndpoint="/api/voice"
 *   primaryColor="#BB0000"
 *   title="Voice Assistant"
 * />
 * ```
 */

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useConversation } from '@elevenlabs/react';

// Types
interface VoicePublicConfig {
  agentId: string;
  agentName: string;
  voiceEnabled: boolean;
  textOnlyMode: boolean;
  maxSessionDuration: number;
  connectionType: 'websocket' | 'webrtc';
  /** Whether ElevenLabs is properly configured */
  configured?: boolean;
}

interface VoiceSession {
  sessionId: string;
  signedUrl?: string;
  conversationToken?: string;
  expiresAt: number;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  isFinal?: boolean;
}

/**
 * Dynamic variables for personalization
 * 
 * 📚 ElevenLabs Documentation:
 * - https://elevenlabs.io/docs/agents-platform/customization/dynamic-variables
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
  /** Any custom variables */
  [key: string]: string | undefined;
}

export interface VoiceChatWidgetProps {
  /** API endpoint for voice backend (e.g., '/api/voice') */
  voiceApiEndpoint?: string;
  /** API endpoint for tools (e.g., '/api/tools') */
  toolsApiEndpoint?: string;
  /** Primary brand color */
  primaryColor?: string;
  /** Widget title */
  title?: string;
  /** Widget subtitle */
  subtitle?: string;
  /** Force text-only mode even if voice is available */
  forceTextOnly?: boolean;
  /** Open widget automatically on load */
  defaultOpen?: boolean;
  /** Auto-start voice session when widget opens (plays welcome message) */
  autoStartVoice?: boolean;
  /** Custom fetch function (for auth headers, etc.) */
  customFetch?: typeof fetch;
  /** Dynamic variables for conversation personalization */
  dynamicVariables?: DynamicVariables;
  /** Callback when session starts */
  onSessionStart?: (sessionId: string, conversationId: string) => void;
  /** Callback when session ends */
  onSessionEnd?: (sessionId: string) => void;
  /** Callback on each message */
  onMessage?: (message: Message) => void;
  /** Callback on error */
  onError?: (error: Error) => void;
  /** Callback when a client tool is called */
  onClientToolCall?: (toolId: string, params: Record<string, unknown>) => unknown;
  /** CSS class for container */
  className?: string;
}

// ============================================================================
// CLIENT TOOL DEFINITIONS
// ============================================================================

/**
 * Client tool definition from server
 */
interface ClientToolDefinition {
  id: string;
  name: string;
  description: string;
  parameters: Array<{
    name: string;
    type: string;
    description: string;
    required: boolean;
  }>;
}

/**
 * Client tool handler type matching ElevenLabs SDK requirements
 * Note: ElevenLabs accepts sync or async handlers
 */
type ClientToolHandler = (params: Record<string, unknown>) => string | number | void;

/**
 * Default client tool handlers
 * These are called when ElevenLabs invokes a client tool
 * Note: Return type must be string | number | void per ElevenLabs SDK
 */
const defaultClientToolHandlers: Record<string, ClientToolHandler> = {
  "ecommerce.show_product_details": (params) => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('platform:show-product', {
        detail: { productId: params.productId }
      }));
    }
    // Return void per ElevenLabs SDK requirement
  },
  
  "ecommerce.navigate_to_cart": () => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('platform:navigate', {
        detail: { path: '/cart' }
      }));
    }
    // Return void per ElevenLabs SDK requirement
  },
};

export function VoiceChatWidget({
  voiceApiEndpoint = '/api/voice',
  toolsApiEndpoint = '/api/tools',
  primaryColor = '#BB0000',
  title = 'Voice Assistant',
  subtitle = 'Voice & Text Assistant',
  forceTextOnly = false,
  defaultOpen = true,
  autoStartVoice = true,
  customFetch,
  dynamicVariables,
  onSessionStart,
  onSessionEnd,
  onMessage,
  onError,
  onClientToolCall,
  className = '',
}: VoiceChatWidgetProps) {
  const fetchFn = customFetch || fetch;

  // UI State
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [voiceMuted, setVoiceMuted] = useState(false);
  const [autoStartAttempted, setAutoStartAttempted] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Voice Config State
  const [voiceConfig, setVoiceConfig] = useState<VoicePublicConfig | null>(null);
  const [configLoading, setConfigLoading] = useState(true);
  const [configError, setConfigError] = useState<string | null>(null);
  
  // Client Tools State
  const [clientTools, setClientTools] = useState<ClientToolDefinition[]>([]);

  // Session State
  const [currentSession, setCurrentSession] = useState<VoiceSession | null>(null);
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [micMuted, setMicMuted] = useState(false);
  
  // Text session state - separate from voice mode
  const [isTextSessionActive, setIsTextSessionActive] = useState(false);
  const [textSessionStarting, setTextSessionStarting] = useState(false);

  // Text-only mode check
  const textOnlyMode = forceTextOnly || voiceConfig?.textOnlyMode || false;

  /**
   * Handle client tool call from ElevenLabs
   * 
   * When ElevenLabs triggers a client tool, we execute it here.
   * Client tools run in the browser (not server) for UI actions.
   * 
   * 📚 ElevenLabs Client Tools: https://elevenlabs.io/docs/agents-platform/customization/tools/client-tools
   */
  const handleClientToolCall = useCallback((toolId: string, params: Record<string, unknown>): string | number | void => {
    console.log(`[VoiceChat] Client tool called: ${toolId}`, params);
    
    // Allow custom handler to override
    if (onClientToolCall) {
      onClientToolCall(toolId, params);
    }
    
    // Use default handler
    const handler = defaultClientToolHandlers[toolId];
    if (handler) {
      return handler(params);
    }
    
    console.warn(`[VoiceChat] No handler for client tool: ${toolId}`);
    // Return void for unknown tools
  }, [onClientToolCall]);

  // Build client tools configuration for ElevenLabs
  // Format: Record<string, (params) => result>
  const clientToolsHandlers = useMemo(() => {
    if (clientTools.length === 0) return undefined;
    
    return Object.fromEntries(
      clientTools.map(tool => [
        tool.id,
        (params: Record<string, unknown>) => handleClientToolCall(tool.id, params),
      ])
    ) as Record<string, (params: any) => string | number | void>;
  }, [clientTools, handleClientToolCall]);

  // ElevenLabs conversation hook with client tools and volume control
  const conversation = useConversation({
    textOnly: textOnlyMode,
    clientTools: clientToolsHandlers,
    volume: voiceMuted ? 0 : 1,
    onConnect: () => {
      console.log('[VoiceChat] Connected to ElevenLabs');
      // The agent will speak the first message automatically
      // No need to add a manual message - it comes via onMessage
    },
    onDisconnect: () => {
      console.log('[VoiceChat] Disconnected from ElevenLabs');
      setIsVoiceMode(false);
      setIsTextSessionActive(false);
      cleanupSession();
    },
    onMessage: (message) => {
      console.log('[VoiceChat] Message received:', message);
      if (message.source === 'ai') {
        addMessage('assistant', message.message, true);
      } else if (message.source === 'user') {
        addMessage('user', message.message, true);
      }
    },
    onError: (error) => {
      console.error('[VoiceChat] Error:', error);
      const errorMessage = typeof error === 'string' 
        ? error 
        : (error as Error)?.message || 'Unknown error';
      const err = new Error(errorMessage);
      onError?.(err);
    },
    onStatusChange: (status) => {
      console.log('[VoiceChat] Status changed:', status);
    },
    onModeChange: (mode) => {
      console.log('[VoiceChat] Mode changed:', mode);
    },
  });

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Fetch voice config on mount
  useEffect(() => {
    fetchVoiceConfig();
  }, [voiceApiEndpoint]);

  // Fetch client tools on mount
  useEffect(() => {
    fetchClientTools();
  }, [toolsApiEndpoint]);

  // Auto-start voice session when widget opens (if enabled)
  useEffect(() => {
    if (
      autoStartVoice &&
      isOpen &&
      !autoStartAttempted &&
      !configLoading &&
      !configError &&
      voiceConfig?.voiceEnabled &&
      !forceTextOnly &&
      !isVoiceMode &&
      !isTextSessionActive &&
      conversation.status !== 'connected'
    ) {
      console.log('[VoiceChat] Auto-starting voice session...');
      setAutoStartAttempted(true);
      startVoiceSession();
    }
  }, [autoStartVoice, isOpen, autoStartAttempted, configLoading, configError, voiceConfig, forceTextOnly, isVoiceMode, isTextSessionActive, conversation.status]);

  const fetchClientTools = async () => {
    try {
      const response = await fetchFn(`${toolsApiEndpoint}/client`);
      
      if (!response.ok) {
        console.warn('[VoiceChat] Could not fetch client tools:', response.status);
        return;
      }
      
      const data = await response.json() as { tools: ClientToolDefinition[] };
      setClientTools(data.tools || []);
      console.log(`[VoiceChat] Loaded ${data.tools?.length || 0} client tools`);
    } catch (error) {
      console.warn('[VoiceChat] Client tools fetch error:', error);
      // Non-fatal - we can still use voice without client tools
    }
  };

  const fetchVoiceConfig = async () => {
    setConfigLoading(true);
    setConfigError(null);

    try {
      const response = await fetchFn(`${voiceApiEndpoint}/config`);
      
      if (!response.ok) {
        if (response.status === 404) {
          setVoiceConfig(null);
          setConfigError('Voice not available');
          return;
        }
        throw new Error(`Failed to fetch voice config: ${response.status}`);
      }

      const config = await response.json() as VoicePublicConfig;
      setVoiceConfig(config);
      
      if (!config.voiceEnabled) {
        setConfigError('Voice is disabled');
      }
    } catch (error) {
      console.error('[VoiceChat] Config fetch error:', error);
      setConfigError(error instanceof Error ? error.message : 'Failed to load voice config');
      onError?.(error instanceof Error ? error : new Error(String(error)));
    } finally {
      setConfigLoading(false);
    }
  };

  const createVoiceSession = async (): Promise<VoiceSession | null> => {
    try {
      const response = await fetchFn(`${voiceApiEndpoint}/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: `user_${Date.now()}`,
          // Pass dynamic variables to backend for session context
          dynamicVariables: dynamicVariables || {},
          metadata: {
            source: 'voice-widget',
            userAgent: typeof window !== 'undefined' ? window.navigator.userAgent : 'unknown',
          },
        }),
      });

      if (!response.ok) {
        const errorData = await response.json() as { error?: string };
        throw new Error(errorData.error || 'Failed to create voice session');
      }

      const session = await response.json() as VoiceSession;
      setCurrentSession(session);
      return session;
    } catch (error) {
      console.error('[VoiceChat] Session creation error:', error);
      onError?.(error instanceof Error ? error : new Error(String(error)));
      return null;
    }
  };

  const cleanupSession = async () => {
    if (!currentSession) return;

    try {
      await fetchFn(`${voiceApiEndpoint}/session/${currentSession.sessionId}`, {
        method: 'DELETE',
      });
      onSessionEnd?.(currentSession.sessionId);
    } catch (error) {
      console.warn('[VoiceChat] Session cleanup warning:', error);
    } finally {
      setCurrentSession(null);
    }
  };

  const startVoiceSession = async () => {
    if (!voiceConfig?.voiceEnabled) return;

    setIsLoading(true);

    try {
      const session = await createVoiceSession();
      if (!session) return;

      const connectionType = voiceConfig.connectionType || 'websocket';
      let conversationId: string;
      
      // Build session options with dynamic variables
      // ElevenLabs will substitute {{variable_name}} in prompts
      const sessionOptions: any = {
        // Dynamic variables for prompt personalization
        dynamicVariables: dynamicVariables || {},
      };
      
      if (connectionType === 'websocket' && session.signedUrl) {
        conversationId = await conversation.startSession({
          signedUrl: session.signedUrl,
          ...sessionOptions,
        });
      } else if (connectionType === 'webrtc' && session.conversationToken) {
        conversationId = await conversation.startSession({
          agentId: voiceConfig.agentId,
          ...sessionOptions,
        });
      } else {
        throw new Error('Invalid session credentials');
      }

      setIsVoiceMode(true);
      onSessionStart?.(session.sessionId, conversationId);
    } catch (error) {
      console.error('[VoiceChat] Start session error:', error);
      onError?.(error instanceof Error ? error : new Error(String(error)));
      cleanupSession();
    } finally {
      setIsLoading(false);
    }
  };

  const endVoiceSession = async () => {
    try {
      await conversation.endSession();
    } catch (error) {
      console.warn('[VoiceChat] End session warning:', error);
    }
    setIsVoiceMode(false);
    setIsTextSessionActive(false);
    await cleanupSession();
  };

  /**
   * Start a text-only session with ElevenLabs
   * This allows sending text messages without microphone access
   * The session auto-starts when user sends first message or widget opens
   */
  const startTextSession = async (): Promise<boolean> => {
    if (isTextSessionActive || isVoiceMode || textSessionStarting) {
      return isTextSessionActive || isVoiceMode;
    }
    
    if (!voiceConfig?.voiceEnabled) {
      console.warn('[VoiceChat] Voice not enabled, cannot start text session');
      return false;
    }

    setTextSessionStarting(true);
    console.log('[VoiceChat] Starting text-only session...');

    try {
      const session = await createVoiceSession();
      if (!session) {
        throw new Error('Failed to create session');
      }

      // Build session options with dynamic variables
      const sessionOptions: any = {
        dynamicVariables: dynamicVariables || {},
      };

      let conversationId: string;
      
      if (session.signedUrl) {
        conversationId = await conversation.startSession({
          signedUrl: session.signedUrl,
          ...sessionOptions,
        });
      } else {
        throw new Error('No signed URL available for text session');
      }

      setIsTextSessionActive(true);
      onSessionStart?.(session.sessionId, conversationId);
      console.log('[VoiceChat] Text session started successfully');
      return true;
    } catch (error) {
      console.error('[VoiceChat] Text session error:', error);
      onError?.(error instanceof Error ? error : new Error(String(error)));
      await cleanupSession();
      return false;
    } finally {
      setTextSessionStarting(false);
    }
  };

  const addMessage = useCallback((role: 'user' | 'assistant', content: string, isFinal: boolean = true) => {
    const message: Message = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      role,
      content,
      timestamp: new Date(),
      isFinal,
    };

    setMessages(prev => {
      if (!isFinal) {
        // Find last message index of same role that isn't final
        let lastIndex = -1;
        for (let i = prev.length - 1; i >= 0; i--) {
          if (prev[i].role === role && !prev[i].isFinal) {
            lastIndex = i;
            break;
          }
        }
        if (lastIndex >= 0) {
          const updated = [...prev];
          updated[lastIndex] = message;
          return updated;
        }
      }
      return [...prev, message];
    });

    onMessage?.(message);
  }, [onMessage]);

  const sendTextMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userInput = input.trim();
    setInput('');
    addMessage('user', userInput, true);
    setIsLoading(true);

    try {
      // Check if we have an active session (text or voice)
      const hasActiveSession = isVoiceMode || isTextSessionActive || conversation.status === 'connected';
      
      // Auto-start text session if not active
      if (!hasActiveSession) {
        console.log('[VoiceChat] No active session, starting text session...');
        const sessionStarted = await startTextSession();
        if (!sessionStarted) {
          addMessage('assistant', 'Unable to connect. Please try again.', true);
          setIsLoading(false);
          return;
        }
        // Small delay to ensure connection is ready
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // Send message via ElevenLabs
      if (conversation.status === 'connected') {
        conversation.sendUserMessage(userInput);
        conversation.sendUserActivity();
      } else {
        // Fallback if connection failed
        console.error('[VoiceChat] Not connected after session start');
        addMessage('assistant', 'Connection issue. Please try again.', true);
      }
    } catch (error) {
      console.error('[VoiceChat] Send message error:', error);
      addMessage('assistant', 'Sorry, I couldn\'t send your message.', true);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleMic = () => {
    setMicMuted(!micMuted);
  };

  const voiceAvailable = voiceConfig?.voiceEnabled && !forceTextOnly && !configError;

  // Styles
  const styles = {
    button: {
      position: 'fixed' as const,
      bottom: '1.5rem',
      right: '1.5rem',
      width: '3.5rem',
      height: '3.5rem',
      borderRadius: '50%',
      boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
      zIndex: 50,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      transition: 'transform 0.2s',
      backgroundColor: primaryColor,
      border: 'none',
      cursor: 'pointer',
    },
    window: {
      position: 'fixed' as const,
      bottom: '6rem',
      right: '1.5rem',
      width: '24rem',
      height: '500px',
      backgroundColor: 'white',
      borderRadius: '1rem',
      boxShadow: '0 25px 50px rgba(0,0,0,0.25)',
      zIndex: 50,
      display: 'flex',
      flexDirection: 'column' as const,
      overflow: 'hidden',
      border: '1px solid #e5e7eb',
    },
    header: {
      padding: '1rem',
      color: 'white',
      backgroundColor: primaryColor,
    },
    messages: {
      flex: 1,
      overflowY: 'auto' as const,
      padding: '1rem',
    },
    inputArea: {
      padding: '1rem',
      borderTop: '1px solid #e5e7eb',
    },
  };

  return (
    <div className={className}>
      {/* Chat Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={styles.button}
        aria-label={isOpen ? 'Close chat' : 'Open chat'}
      >
        {isOpen ? (
          <svg width="24" height="24" fill="none" stroke="white" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg width="24" height="24" fill="none" stroke="white" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
          </svg>
        )}
      </button>

      {/* Chat Window */}
      {isOpen && (
        <div style={styles.window}>
          {/* Header */}
          <div style={styles.header}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ flex: 1 }}>
                <h3 style={{ fontWeight: 600, margin: 0 }}>{title}</h3>
                {(isVoiceMode || isTextSessionActive) && conversation.status === 'connected' ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
                    <div style={{
                      width: '0.5rem',
                      height: '0.5rem',
                      borderRadius: '50%',
                      backgroundColor: conversation.isSpeaking ? '#4ade80' : '#fbbf24',
                      animation: conversation.isSpeaking ? 'pulse 1s infinite' : 'none',
                      boxShadow: conversation.isSpeaking ? '0 0 8px #4ade80' : 'none',
                    }} />
                    <span style={{ fontSize: '0.75rem', opacity: 0.9 }}>
                      {conversation.isSpeaking ? '🔊 Speaking...' : '👂 Listening'}
                    </span>
                  </div>
                ) : (
                  <p style={{ fontSize: '0.875rem', opacity: 0.9, margin: '0.25rem 0 0' }}>{subtitle}</p>
                )}
              </div>
              {/* Stop Voice Button - shown when agent is speaking */}
              {conversation.isSpeaking && (
                <button
                  onClick={() => setVoiceMuted(!voiceMuted)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.25rem',
                    padding: '0.375rem 0.75rem',
                    borderRadius: '9999px',
                    backgroundColor: voiceMuted ? '#6b7280' : 'rgba(255,255,255,0.2)',
                    color: 'white',
                    border: '1px solid rgba(255,255,255,0.3)',
                    cursor: 'pointer',
                    fontSize: '0.75rem',
                    transition: 'all 0.2s',
                  }}
                  title={voiceMuted ? 'Unmute voice' : 'Mute voice'}
                >
                  {voiceMuted ? (
                    <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15zM17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                    </svg>
                  ) : (
                    <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                    </svg>
                  )}
                  {voiceMuted ? 'Muted' : 'Stop'}
                </button>
              )}
              {/* Close button */}
              <button
                onClick={() => setIsOpen(false)}
                style={{
                  marginLeft: '0.5rem',
                  padding: '0.25rem',
                  background: 'transparent',
                  border: 'none',
                  color: 'white',
                  cursor: 'pointer',
                  opacity: 0.8,
                }}
                title="Minimize"
              >
                <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </div>
          </div>

          {/* Loading State */}
          {configLoading && (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ textAlign: 'center', color: '#6b7280' }}>
                <div style={{
                  width: '2rem',
                  height: '2rem',
                  border: '2px solid #d1d5db',
                  borderTopColor: '#4b5563',
                  borderRadius: '50%',
                  margin: '0 auto 0.5rem',
                  animation: 'spin 1s linear infinite',
                }} />
                <p style={{ fontSize: '0.875rem' }}>Loading voice configuration...</p>
              </div>
            </div>
          )}

          {/* Error State */}
          {!configLoading && configError && (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
              <div style={{ textAlign: 'center', color: '#6b7280' }}>
                <div style={{
                  width: '4rem',
                  height: '4rem',
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #f59e0b, #f97316)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 1rem',
                }}>
                  <svg width="28" height="28" fill="none" stroke="white" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <p style={{ fontSize: '1rem', fontWeight: 500, marginBottom: '0.5rem', color: '#374151' }}>
                  {configError === 'Voice is disabled' ? '🔧 Setup Required' : configError}
                </p>
                <p style={{ fontSize: '0.875rem', marginBottom: '1rem', lineHeight: 1.5 }}>
                  {configError === 'Voice is disabled' ? (
                    <>
                      Configure ElevenLabs to enable AI voice and chat.<br/>
                      <span style={{ fontSize: '0.75rem', opacity: 0.8 }}>
                        Set ELEVENLABS_API_KEY and ELEVENLABS_AGENT_ID
                      </span>
                    </>
                  ) : (
                    'There was an issue loading the voice configuration.'
                  )}
                </p>
                <button
                  onClick={fetchVoiceConfig}
                  style={{
                    fontSize: '0.875rem',
                    padding: '0.5rem 1rem',
                    borderRadius: '0.5rem',
                    border: 'none',
                    backgroundColor: primaryColor,
                    color: 'white',
                    cursor: 'pointer',
                    transition: 'opacity 0.2s',
                  }}
                  onMouseOver={(e) => e.currentTarget.style.opacity = '0.9'}
                  onMouseOut={(e) => e.currentTarget.style.opacity = '1'}
                >
                  Retry
                </button>
              </div>
            </div>
          )}

          {/* Not Configured State - show helpful setup message */}
          {!configLoading && !configError && voiceConfig && voiceConfig.configured === false && (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{
                  width: '5rem',
                  height: '5rem',
                  borderRadius: '50%',
                  background: `linear-gradient(135deg, ${primaryColor}, #60a5fa)`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 1.5rem',
                  opacity: 0.6,
                }}>
                  <svg width="32" height="32" fill="none" stroke="white" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#374151', marginBottom: '0.75rem' }}>
                  AI Assistant Setup
                </h3>
                <p style={{ fontSize: '0.875rem', color: '#6b7280', lineHeight: 1.6, marginBottom: '1rem' }}>
                  To enable the AI assistant, add your<br/>
                  ElevenLabs credentials to your environment:
                </p>
                <div style={{
                  background: '#f3f4f6',
                  borderRadius: '0.5rem',
                  padding: '0.75rem',
                  fontSize: '0.75rem',
                  fontFamily: 'monospace',
                  color: '#374151',
                  textAlign: 'left',
                  marginBottom: '1rem',
                }}>
                  <div>ELEVENLABS_API_KEY=your_key</div>
                  <div>ELEVENLABS_AGENT_ID=your_agent</div>
                </div>
                <p style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
                  Get your credentials at{' '}
                  <a 
                    href="https://elevenlabs.io" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    style={{ color: primaryColor, textDecoration: 'none' }}
                  >
                    elevenlabs.io
                  </a>
                </p>
              </div>
            </div>
          )}

          {/* Main Chat */}
          {!configLoading && !configError && voiceConfig && voiceConfig.configured !== false && (
            <>
              {/* Messages */}
              <div style={styles.messages}>
                {messages.length === 0 && !isLoading && (
                  <div style={{ textAlign: 'center', color: '#6b7280', marginTop: '2rem' }}>
                    {(isVoiceMode || isTextSessionActive) && conversation.status === 'connected' ? (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                        <div style={{
                          width: '4rem',
                          height: '4rem',
                          borderRadius: '50%',
                          background: `linear-gradient(135deg, ${primaryColor}, #60a5fa)`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          animation: conversation.isSpeaking ? 'pulse 1.5s infinite' : 'none',
                          boxShadow: conversation.isSpeaking ? `0 0 20px ${primaryColor}40` : 'none',
                        }}>
                          <svg width="28" height="28" fill="none" stroke="white" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                          </svg>
                        </div>
                        <p style={{ fontSize: '0.9rem', color: '#4b5563' }}>
                          {conversation.isSpeaking ? 'Agent is speaking...' : 'Ready - speak or type your message'}
                        </p>
                      </div>
                    ) : autoStartVoice && !autoStartAttempted ? (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                        <div style={{
                          width: '3rem',
                          height: '3rem',
                          border: '3px solid #d1d5db',
                          borderTopColor: primaryColor,
                          borderRadius: '50%',
                          animation: 'spin 1s linear infinite',
                        }} />
                        <p style={{ fontSize: '0.9rem' }}>Connecting to AI assistant...</p>
                      </div>
                    ) : voiceAvailable ? (
                      <>
                        <p style={{ fontSize: '1.1rem', marginBottom: '0.75rem' }}>👋 Hi! How can I help you today?</p>
                        <p style={{ fontSize: '0.9rem', color: '#4b5563' }}>
                          🎤 <strong>Voice:</strong> Click the mic button below<br/>
                          ⌨️ <strong>Text:</strong> Type your message
                        </p>
                      </>
                    ) : (
                      <p>👋 Hi! Type your message below to get started.</p>
                    )}
                    {voiceConfig && !isVoiceMode && !isTextSessionActive && (
                      <p style={{ fontSize: '0.75rem', marginTop: '1rem', color: '#9ca3af' }}>
                        Powered by AI • Agent: {voiceConfig.agentName}
                      </p>
                    )}
                  </div>
                )}
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    style={{
                      display: 'flex',
                      justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                      marginBottom: '0.75rem',
                    }}
                  >
                    <div
                      style={{
                        maxWidth: '80%',
                        padding: '0.75rem',
                        borderRadius: '1rem',
                        backgroundColor: msg.role === 'user' ? primaryColor : '#f3f4f6',
                        color: msg.role === 'user' ? 'white' : '#1f2937',
                        opacity: msg.isFinal ? 1 : 0.7,
                        fontStyle: msg.isFinal ? 'normal' : 'italic',
                      }}
                    >
                      {msg.content}
                      {!msg.isFinal && <span style={{ marginLeft: '0.25rem' }}>...</span>}
                    </div>
                  </div>
                ))}
                {isLoading && (
                  <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                    <div style={{ backgroundColor: '#f3f4f6', padding: '0.75rem', borderRadius: '1rem' }}>
                      <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
                        <div style={{ width: '0.5rem', height: '0.5rem', backgroundColor: '#9ca3af', borderRadius: '50%', animation: 'bounce 1s infinite' }} />
                        <div style={{ width: '0.5rem', height: '0.5rem', backgroundColor: '#9ca3af', borderRadius: '50%', animation: 'bounce 1s infinite 0.1s' }} />
                        <div style={{ width: '0.5rem', height: '0.5rem', backgroundColor: '#9ca3af', borderRadius: '50%', animation: 'bounce 1s infinite 0.2s' }} />
                        {textSessionStarting && (
                          <span style={{ marginLeft: '0.5rem', fontSize: '0.75rem', color: '#6b7280' }}>Connecting...</span>
                        )}
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input Area */}
              <div style={styles.inputArea}>
                {/* Voice Controls */}
                {voiceAvailable && (
                  <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '0.75rem', gap: '0.75rem' }}>
                    {!isVoiceMode ? (
                      <button
                        onClick={startVoiceSession}
                        disabled={isLoading || textSessionStarting}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                          padding: '0.625rem 1.25rem',
                          borderRadius: '9999px',
                          backgroundColor: isLoading || textSessionStarting ? '#9ca3af' : primaryColor,
                          color: 'white',
                          border: 'none',
                          cursor: isLoading || textSessionStarting ? 'not-allowed' : 'pointer',
                          fontSize: '0.9rem',
                          fontWeight: 500,
                          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                          transition: 'all 0.2s',
                        }}
                      >
                        <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                        </svg>
                        <span>Start Voice Chat</span>
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={toggleMic}
                          style={{
                            padding: '0.5rem',
                            borderRadius: '50%',
                            backgroundColor: micMuted ? '#ef4444' : '#e5e7eb',
                            color: micMuted ? 'white' : '#374151',
                            border: 'none',
                            cursor: 'pointer',
                          }}
                          title={micMuted ? 'Unmute' : 'Mute'}
                        >
                          <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            {micMuted ? (
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15zM17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                            ) : (
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                            )}
                          </svg>
                        </button>
                        <button
                          onClick={endVoiceSession}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            padding: '0.5rem 1rem',
                            borderRadius: '9999px',
                            backgroundColor: '#ef4444',
                            color: 'white',
                            border: 'none',
                            cursor: 'pointer',
                          }}
                        >
                          <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                          <span style={{ fontSize: '0.875rem' }}>End Voice</span>
                        </button>
                      </>
                    )}
                  </div>
                )}

                <div style={{ display: 'flex', gap: '0.5rem', position: 'relative' }}>
                  <div style={{ flex: 1, position: 'relative' }}>
                    <input
                      type="text"
                      value={input}
                      onChange={(e) => {
                        setInput((e.target as HTMLInputElement).value);
                        if (isVoiceMode || isTextSessionActive) {
                          conversation.sendUserActivity();
                        }
                      }}
                      onKeyPress={(e) => e.key === 'Enter' && sendTextMessage()}
                      placeholder=""
                      disabled={textSessionStarting}
                      style={{
                        width: '100%',
                        padding: '0.75rem 1rem',
                        border: '2px solid #e5e7eb',
                        borderRadius: '9999px',
                        outline: 'none',
                        fontSize: '0.95rem',
                        transition: 'border-color 0.2s',
                      }}
                      onFocus={(e) => (e.target as HTMLInputElement).style.borderColor = primaryColor}
                      onBlur={(e) => (e.target as HTMLInputElement).style.borderColor = '#e5e7eb'}
                    />
                    {/* Blinking cursor placeholder */}
                    {!input && (
                      <div style={{
                        position: 'absolute',
                        left: '1rem',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '2px',
                        pointerEvents: 'none',
                        color: '#9ca3af',
                        fontSize: '0.95rem',
                      }}>
                        <span>Type a message</span>
                        <span style={{
                          display: 'inline-block',
                          width: '2px',
                          height: '1.1rem',
                          backgroundColor: primaryColor,
                          animation: 'blink 1s infinite',
                          marginLeft: '1px',
                        }} />
                      </div>
                    )}
                  </div>
                  <button
                    onClick={sendTextMessage}
                    disabled={isLoading || !input.trim() || textSessionStarting}
                    style={{
                      padding: '0.75rem 1.25rem',
                      borderRadius: '9999px',
                      backgroundColor: isLoading || !input.trim() || textSessionStarting ? '#d1d5db' : primaryColor,
                      color: 'white',
                      border: 'none',
                      cursor: isLoading || !input.trim() || textSessionStarting ? 'not-allowed' : 'pointer',
                      fontWeight: 500,
                      transition: 'all 0.2s',
                    }}
                  >
                    <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                    </svg>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* CSS Animations */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.7; transform: scale(1.05); }
        }
        @keyframes bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-25%); }
        }
        @keyframes blink {
          0%, 50% { opacity: 1; }
          51%, 100% { opacity: 0; }
        }
        @keyframes glow {
          0%, 100% { box-shadow: 0 0 5px ${primaryColor}40; }
          50% { box-shadow: 0 0 20px ${primaryColor}60; }
        }
      `}</style>
    </div>
  );
}
