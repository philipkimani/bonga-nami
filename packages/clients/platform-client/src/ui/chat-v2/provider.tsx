/**
 * Chat V2 Provider
 *
 * Calls @elevenlabs/react useConversation() ONCE and exposes everything via context.
 *
 * CRITICAL:
 * - This file ONLY imports from chat-v2 own files
 * - NEVER import from ../chat/ (old implementation)
 * - useConversation() is called HERE and ONLY HERE
 * - Child components access conversation state/methods via useChatContextV2()
 *   or the convenience hooks below -- they must NEVER call useConversation() directly
 */

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  useEffect,
  useRef,
} from 'react';

import { useConversation } from '@elevenlabs/react';

import type {
  ChatConfigV2,
  ChatThemeV2,
  ChatState,
  ChatActions,
  ChatContextV2Value,
  ChatProviderV2Props,
  ConversationMethods,
  Message,
  ToastData,
  CardData,
} from './types';

import {
  defaultConfigV2,
  getPresetThemeV2,
  createThemeV2
} from './config';

import {
  createBuiltinClientTools,
  mergeClientTools,
} from './client-tools';

// =============================================================================
// CONTEXT
// =============================================================================

const ChatContextV2 = createContext<ChatContextV2Value | null>(null);

// =============================================================================
// PROVIDER COMPONENT
// =============================================================================

export function ChatProviderV2({
  children,
  agentId,
  config: configOverrides = {},
  theme: themeInput = 'default',
}: ChatProviderV2Props) {
  // Build final config
  const config = useMemo<ChatConfigV2>(() => ({
    ...defaultConfigV2,
    ...configOverrides,
    agentId,
  }), [agentId, configOverrides]);

  // Build final theme
  const theme = useMemo<ChatThemeV2>(() => {
    if (typeof themeInput === 'string') {
      return getPresetThemeV2(themeInput);
    }
    return createThemeV2(themeInput);
  }, [themeInput]);

  // ============================================================================
  // MESSAGE STATE
  // ============================================================================

  const [messages, setMessages] = useState<Message[]>([]);

  // ============================================================================
  // UI STATE
  // ============================================================================

  const [isOpen, setIsOpen] = useState(config.defaultOpen || false);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  // Track whether we have started a session so we only do it once
  const sessionStartedRef = useRef(false);

  // Track whether we were previously connected (for reconnection detection)
  const wasConnectedRef = useRef(false);

  // Retry guards — prevent infinite retry loops and enable voice→text fallback
  const MAX_RETRIES = 3;
  const retryCountRef = useRef(0);
  const textOnlyFallbackRef = useRef(false);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Inactivity timer — ends session after config.inactivityTimeoutMs of no user interaction
  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Warning timer — fires at 70% of timeout to warn user before session ends
  const inactivityWarningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Tracks whether the warning has been shown (to avoid duplicates)
  const inactivityWarningShownRef = useRef(false);
  // Refs to avoid stale closures inside timer callbacks (synced via useEffect below)
  const statusRef = useRef<string>('disconnected');
  const endSessionRef = useRef<() => Promise<void>>(async () => {});
  const resetInactivityTimerRef = useRef<() => void>(() => {});
  // Pending message — queued when user types while session is disconnected
  // (e.g. after inactivity timeout). Sent automatically once session reconnects.
  const pendingMessageRef = useRef<string | null>(null);

  // Session termination flag — when true, the session was deliberately ended
  // (end voice call, inactivity timeout, etc.) and should NOT auto-restart.
  // Cleared when user explicitly sends a new message or opens the widget.
  const sessionTerminatedRef = useRef(false);

  // Mode switching flag — when true, we're transitioning between text and voice.
  // The reconnection effect should proceed to create a new session.
  const modeSwitchingRef = useRef(false);

  // ============================================================================
  // VOICE CALL STATE — voice is on-demand, sessions always start text-only
  // ============================================================================

  const [voiceCallActive, setVoiceCallActive] = useState(false);
  const voiceCallActiveRef = useRef(false);

  // Thinking state — true after user sends a message, false when agent responds
  const [isThinking, setIsThinking] = useState(false);

  // Language state — user can switch language, triggers session restart
  const [selectedLanguage, setSelectedLanguage] = useState<string>(config.defaultLanguage || 'en');
  const selectedLanguageRef = useRef(selectedLanguage);

  // ============================================================================
  // MICROPHONE STATE (voice mode only)
  // ============================================================================

  const [micMuted, setMicMuted] = useState(true); // Start muted until user clicks

  const toggleMic = useCallback(() => {
    setMicMuted(prev => !prev);
  }, []);

  // Track whether we've shown the greeting so we don't duplicate it
  const greetingShownRef = useRef(false);

  // Track whether the greeting has been handled on the CURRENT session.
  // When a session restarts (mode switch, reconnect after disconnect), ElevenLabs
  // resends its configured greeting. If greetingShownRef is already true,
  // the first AI message on the new session is the duplicate greeting — skip it.
  // Reset to false on each initiateSession call.
  const greetingHandledThisSessionRef = useRef(false);

  // ============================================================================
  // TOAST STATE (for showNotification client tool)
  // ============================================================================

  const [toasts, setToasts] = useState<ToastData[]>([]);
  const toastTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const showToast = useCallback((toast: Omit<ToastData, 'id'>) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const newToast: ToastData = { ...toast, id };
    setToasts(prev => [...prev.slice(-4), newToast]); // Keep max 5 toasts

    // Auto-dismiss
    const timer = setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
      toastTimersRef.current.delete(id);
    }, toast.duration);
    toastTimersRef.current.set(id, timer);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
    const timer = toastTimersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      toastTimersRef.current.delete(id);
    }
  }, []);

  // Cleanup toast timers on unmount
  useEffect(() => {
    return () => {
      toastTimersRef.current.forEach(timer => clearTimeout(timer));
      toastTimersRef.current.clear();
    };
  }, []);

  // ============================================================================
  // CLIENT TOOLS — built-in + custom from config
  // ============================================================================

  const addCardMessage = useCallback((card: CardData) => {
    const cardMsg: Message = {
      id: `card-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      role: 'assistant',
      content: card.title || card.description || 'Content',
      timestamp: new Date(),
      type: 'card',
      cardData: card,
    };
    setMessages(prev => [...prev, cardMsg]);
    greetingShownRef.current = true;
    setIsThinking(false);
    resetInactivityTimerRef.current();
  }, []);

  const clientTools = useMemo(() => {
    const builtins = createBuiltinClientTools({
      addCardMessage,
      showToast,
      allowExternalNavigation: config.allowExternalNavigation || false,
    });
    // Read custom tools from client site config (may be set after widget mount)
    const windowClientTools =
      typeof window !== 'undefined' && (window as any).RUSKINS_CONFIG?.clientTools
        ? (window as any).RUSKINS_CONFIG.clientTools
        : {};
    return mergeClientTools(builtins, { ...windowClientTools, ...config.clientTools });
  }, [addCardMessage, showToast, config.allowExternalNavigation, config.clientTools]);

  // ============================================================================
  // SIGNED URL GENERATION
  // ============================================================================

  const generateSignedUrl = useCallback(async (): Promise<string> => {
    const signedUrlEndpoint = config.signedUrlEndpoint || '/api/elevenlabs/signed-url';
    const response = await fetch(`${signedUrlEndpoint}?agent_id=${config.agentId}`);

    if (!response.ok) {
      throw new Error(`Failed to get signed URL: ${response.statusText}`);
    }

    const data = await response.json() as { signed_url: string };
    return data.signed_url;
  }, [config.signedUrlEndpoint, config.agentId]);

  // ============================================================================
  // SINGLE useConversation() INSTANCE -- the heart of the integration
  // ============================================================================

  const conversation = useConversation({
    clientTools,
    onMessage: ({ message, source }) => {
      // SDK onMessage fires for:
      //   source === 'user'  → voice transcriptions only (NOT typed text)
      //   source === 'ai'    → assistant responses
      // Typed text messages are added optimistically in wrappedSendUserMessage
      // so we skip user-source events here to avoid duplicates.
      // In voice mode, transcriptions still need to come through.
      if (source === 'user' && !voiceCallActiveRef.current) return;

      // Strip voice emotion/direction tags like [Happy], [Excited],
      // [Understood], [Great choice!], [clicking] etc. that ElevenLabs injects
      // for voice modulation — they look confusing in displayed text.
      // Applied to ALL AI messages (text and voice mode) since transcripts
      // are now always visible.
      let cleanMessage = message;
      if (source !== 'user') {
        cleanMessage = message
          .replace(/\[([^\]]{1,30})\]\s*/g, '')  // Remove [Tag] and trailing space
          .replace(/^\s+/, '');                    // Trim leading whitespace left behind
        // Skip empty messages
        if (cleanMessage.trim() === '') return;

        // Greeting deduplication: when a session restarts (text↔voice switch),
        // ElevenLabs sends its configured greeting again. Since the user already
        // saw the greeting from the first session, we skip rendering the duplicate.
        // This is standard UI deduplication — the server still sends the greeting
        // normally; we just don't show it twice in the message list.
        if (greetingShownRef.current && !greetingHandledThisSessionRef.current) {
          greetingHandledThisSessionRef.current = true;
          console.log('[ChatV2] Skipping duplicate greeting (already shown in previous session)');
          return;
        }
      }

      const newMsg: Message = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        role: source === 'user' ? 'user' : 'assistant',
        content: cleanMessage,
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, newMsg]);

      // Mark greeting as delivered by SDK so we don't duplicate it
      if (source !== 'user') {
        greetingShownRef.current = true;
        greetingHandledThisSessionRef.current = true;
        setIsThinking(false); // Agent responded — stop thinking indicator
      }

      // Reset inactivity timer on ANY SDK message (voice transcriptions + AI
      // responses). Without this, voice conversations trigger the "are you
      // still there?" warning because only typed messages reset the timer.
      resetInactivityTimerRef.current();

      // Fire external callback if configured
      config.onMessage?.(newMsg);
    },
    onError: (message: string, context?: unknown) => {
      console.error('[ChatV2] Conversation error:', message, context);
      setConnectionError(message);
      config.onError?.(new Error(message));
    },
    // Always pass mic state — SDK ignores it in text-only sessions
    micMuted,
  });

  // Destructure what we need from the single conversation instance
  const {
    startSession,
    endSession,
    sendUserMessage,
    sendUserActivity,
    sendFeedback,
    status,
    isSpeaking,
    canSendFeedback,
    getInputVolume,
    getOutputVolume,
  } = conversation;

  // ============================================================================
  // START SESSION -- with retry logic and voice→text fallback
  // ============================================================================

  const initiateSession = useCallback(async () => {
    if (sessionStartedRef.current) return;
    if (status !== 'disconnected') return;
    if (retryCountRef.current >= MAX_RETRIES) return;
    if (sessionTerminatedRef.current) return;

    sessionStartedRef.current = true;
    setConnectionError(null);
    greetingHandledThisSessionRef.current = false; // New session — haven't seen greeting yet

    try {
      const signedUrl = await generateSignedUrl();

      // Always text-only UNLESS user has actively started a voice call
      // voiceCallActiveRef (not state) is used so the callback always reads the latest value
      const useTextOnly = config.textOnly || textOnlyFallbackRef.current || !voiceCallActiveRef.current;
      console.log(`[ChatV2] Starting session — textOnly: ${useTextOnly} (config.textOnly=${config.textOnly}, fallback=${textOnlyFallbackRef.current}, voiceCallActive=${voiceCallActiveRef.current})`);

      // Build session options
      const sessionOpts: Record<string, unknown> = {
        signedUrl,
        textOnly: useTextOnly,
      };

      // Build overrides — server needs to know the session type AND language.
      // IMPORTANT: overrides.conversation.textOnly tells the ElevenLabs SERVER
      // to skip TTS generation. Without this, the server generates audio even
      // for text-only sessions (costs voice-tier credits, shows "Text-only: No"
      // in the dashboard). The top-level textOnly only controls the client
      // connection type (WebSocket vs WebRTC).
      //
      // NO firstMessage override — many agent configs disallow it, and greeting
      // deduplication is handled client-side in onMessage.
      const agentOverrides: Record<string, unknown> = {};
      if (selectedLanguageRef.current && selectedLanguageRef.current !== 'en') {
        agentOverrides.language = selectedLanguageRef.current;
      }
      const conversationOverrides: Record<string, unknown> = {
        textOnly: useTextOnly,
      };
      sessionOpts.overrides = {
        ...(Object.keys(agentOverrides).length > 0 ? { agent: agentOverrides } : {}),
        conversation: conversationOverrides,
      };

      // Read dynamic variables from client site config at session-start time
      // (not at mount time — client's auth may still be resolving at mount).
      // Client sites set window.RUSKINS_CONFIG.dynamicVariables = { user_name, ... }
      const clientDynamicVars =
        typeof window !== 'undefined' && (window as any).RUSKINS_CONFIG?.dynamicVariables
          ? (window as any).RUSKINS_CONFIG.dynamicVariables
          : {};

      // Tell the agent which mode this session is in via dynamic variables.
      // Agent prompt should reference {{channel_mode}} to adapt formatting.
      // dynamicVariables is a top-level SessionConfig field (NOT inside overrides).
      // channel_mode is last so the platform always controls it.
      sessionOpts.dynamicVariables = {
        ...clientDynamicVars,
        channel_mode: useTextOnly ? 'text_chat' : 'voice_call',
      };

      await startSession(sessionOpts as Parameters<typeof startSession>[0]);

      // Success — reset retry counter
      retryCountRef.current = 0;
    } catch (err) {
      sessionStartedRef.current = false;
      retryCountRef.current++;
      const errorMsg = err instanceof Error ? err.message : String(err);

      // Detect AudioWorklet failure → fall back to text-only on next attempt
      const isAudioError = /worklet/i.test(errorMsg);
      if (isAudioError && voiceCallActiveRef.current) {
        console.warn('[ChatV2] Voice call failed (AudioWorklet), falling back to text-only');
        textOnlyFallbackRef.current = true;
        voiceCallActiveRef.current = false;
        setVoiceCallActive(false);
        setMicMuted(true);
        // Notify user that voice failed — without this, it's a silent failure
        setMessages(prev => [...prev, {
          id: `voice-fallback-${Date.now()}`,
          role: 'assistant' as const,
          content: 'Voice mode is unavailable in this browser. Continuing in text mode.',
          timestamp: new Date(),
        }]);
      } else if (isAudioError && !config.textOnly && !textOnlyFallbackRef.current) {
        console.warn('[ChatV2] Voice mode failed (AudioWorklet), falling back to text-only');
        textOnlyFallbackRef.current = true;
      }

      if (retryCountRef.current >= MAX_RETRIES) {
        // All retries exhausted — show error to user
        const userMsg = isAudioError
          ? 'Voice mode is unavailable. Please refresh to try text chat.'
          : errorMsg;
        console.error(`[ChatV2] Failed after ${MAX_RETRIES} attempts:`, errorMsg);
        setConnectionError(userMsg);
        config.onError?.(err instanceof Error ? err : new Error(errorMsg));
      } else {
        // Schedule retry with backoff (1s, 2s, 3s...)
        const delay = retryCountRef.current * 1000;
        console.warn(`[ChatV2] Attempt ${retryCountRef.current} failed, retrying in ${delay}ms...`);
        retryTimerRef.current = setTimeout(() => {
          // Allow initiateSession to run again
          sessionStartedRef.current = false;
          // Trigger via state update so the isOpen effect re-fires
          setConnectionError(null);
        }, delay);
      }
    }
  }, [generateSignedUrl, startSession, status, config.textOnly, config.onError, config.greeting]);

  // When widget opens (or after a scheduled retry), start the session.
  // SKIP during mode switches — the reconnection effect handles those to
  // prevent double session creation (both effects fire on the same render).
  useEffect(() => {
    if (isOpen && !sessionStartedRef.current && !sessionTerminatedRef.current && !modeSwitchingRef.current && retryCountRef.current < MAX_RETRIES) {
      initiateSession();
    }
  }, [isOpen, initiateSession, connectionError]); // connectionError changes trigger retries

  // Cleanup retry timer on unmount
  useEffect(() => {
    return () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
      if (inactivityWarningTimerRef.current) clearTimeout(inactivityWarningTimerRef.current);
    };
  }, []);

  // ============================================================================
  // INACTIVITY TIMEOUT — graceful two-phase close
  //
  // Phase 1 (at 70% of timeout): Inject a warning message
  //   "Are you still there? This chat will end soon due to inactivity."
  //
  // Phase 2 (at 100% of timeout): Inject a farewell message, then end session
  //   "Thanks for chatting! This session has ended. Feel free to start a
  //    new conversation anytime."
  //
  // If the user sends ANY message during either phase, both timers reset.
  // ============================================================================

  // Keep refs in sync with latest values (avoids stale closures in timers)
  useEffect(() => { statusRef.current = status; }, [status]);
  useEffect(() => { endSessionRef.current = endSession; }, [endSession]);

  const resetInactivityTimer = useCallback(() => {
    if (!config.inactivityTimeoutMs || config.inactivityTimeoutMs <= 0) return;

    // Clear existing timers
    if (inactivityWarningTimerRef.current) clearTimeout(inactivityWarningTimerRef.current);
    if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    inactivityWarningShownRef.current = false;

    const warningDelay = Math.round(config.inactivityTimeoutMs * 0.7);
    const closeDelay = config.inactivityTimeoutMs;

    // Phase 1 — Warning
    inactivityWarningTimerRef.current = setTimeout(() => {
      const s = statusRef.current;
      if (s === 'connected' || s === 'connecting') {
        console.log(`[ChatV2] Inactivity warning after ${warningDelay / 1000}s`);
        inactivityWarningShownRef.current = true;
        const warningText = config.inactivityWarningMessage
          || 'Are you still there? This chat will end soon due to inactivity.';
        setMessages(prev => [...prev, {
          id: `inactivity-warn-${Date.now()}`,
          role: 'assistant' as const,
          content: warningText,
          timestamp: new Date(),
        }]);
      }
    }, warningDelay);

    // Phase 2 — Farewell + close
    inactivityTimerRef.current = setTimeout(async () => {
      const s = statusRef.current;
      if (s === 'connected' || s === 'connecting') {
        console.log(`[ChatV2] Ending session gracefully after ${closeDelay / 1000}s inactivity`);
        const farewellText = config.inactivityFarewellMessage
          || 'Thanks for chatting! This session has ended. Feel free to start a new conversation anytime.';
        setMessages(prev => [...prev, {
          id: `inactivity-bye-${Date.now()}`,
          role: 'assistant' as const,
          content: farewellText,
          timestamp: new Date(),
        }]);
        // Short delay so the user sees the farewell before the session drops
        await new Promise(r => setTimeout(r, 1500));
        // Mark session as deliberately terminated — prevents auto-restart
        // by the widget-open effect and reconnection effect.
        sessionTerminatedRef.current = true;
        await endSessionRef.current();
        sessionStartedRef.current = false;
      }
    }, closeDelay);
  }, [config.inactivityTimeoutMs, config.inactivityWarningMessage, config.inactivityFarewellMessage]);

  // Sync ref so onMessage callback (defined before this useCallback) can call it
  useEffect(() => { resetInactivityTimerRef.current = resetInactivityTimer; }, [resetInactivityTimer]);

  // Start/reset inactivity timer when session connects
  useEffect(() => {
    if (status === 'connected') {
      resetInactivityTimer();
    }
    if (status === 'disconnected') {
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
        inactivityTimerRef.current = null;
      }
      if (inactivityWarningTimerRef.current) {
        clearTimeout(inactivityWarningTimerRef.current);
        inactivityWarningTimerRef.current = null;
      }
      inactivityWarningShownRef.current = false;
    }
  }, [status, resetInactivityTimer]);

  // ============================================================================
  // SESSION RECONNECTION -- ONLY for mode switches (text↔voice)
  //
  // All other disconnections (inactivity timeout, user ended call, server-side
  // timeout) are NOT auto-reconnected. The user types a message to restart.
  // ============================================================================

  useEffect(() => {
    if (status === 'connected') {
      retryCountRef.current = 0;
    }

    // Only auto-reconnect when switching between text and voice mode.
    // All other disconnections require user action (typing) to restart.
    if (status === 'disconnected' && modeSwitchingRef.current && isOpen) {
      console.log('[ChatV2] Mode switch — reconnecting with new settings...');
      modeSwitchingRef.current = false;
      sessionStartedRef.current = false;
      retryCountRef.current = 0;
      initiateSession();
    }
  }, [status, isOpen, initiateSession]);

  // ============================================================================
  // GREETING FALLBACK — inject locally if SDK doesn't deliver it within 1.5s
  // ============================================================================

  useEffect(() => {
    if (status !== 'connected' || !config.greeting || greetingShownRef.current) return;

    const timer = setTimeout(() => {
      if (!greetingShownRef.current) {
        greetingShownRef.current = true;
        setMessages(prev => {
          // Only inject if no messages arrived yet
          if (prev.length === 0) {
            return [{
              id: `greeting-${Date.now()}`,
              role: 'assistant' as const,
              content: config.greeting!,
              timestamp: new Date(),
            }];
          }
          return prev;
        });
      }
    }, 1500);

    return () => clearTimeout(timer);
  }, [status, config.greeting]);

  // ============================================================================
  // ACTIONS (UI controls)
  // ============================================================================

  const openWidget = useCallback(() => {
    sessionTerminatedRef.current = false; // Allow new session on widget reopen
    setIsOpen(true);
    config.onOpen?.();
  }, [config]);

  const closeWidget = useCallback(() => {
    setIsOpen(false);
    // Reset all session state so reopening gets fresh attempts
    retryCountRef.current = 0;
    textOnlyFallbackRef.current = false;
    voiceCallActiveRef.current = false;
    setVoiceCallActive(false);
    setMicMuted(true);
    greetingShownRef.current = false;
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    config.onClose?.();
  }, [config]);

  const toggleWidget = useCallback(() => {
    setIsOpen(prev => {
      const next = !prev;
      if (next) {
        config.onOpen?.();
      } else {
        config.onClose?.();
      }
      return next;
    });
  }, [config]);

  const clearMessages = useCallback(() => {
    setMessages([]);
    greetingShownRef.current = false;
  }, []);

  // ============================================================================
  // LANGUAGE SELECTION — changing language restarts the session
  // ============================================================================

  const setLanguage = useCallback(async (lang: string) => {
    if (lang === selectedLanguage) return;
    selectedLanguageRef.current = lang;
    setSelectedLanguage(lang);
    // Restart session so the new language override takes effect
    // (ElevenLabs does not support mid-conversation language switching)
    greetingShownRef.current = false; // New session needs fresh greeting
    // Clear inactivity timers BEFORE ending session to prevent the farewell
    // message from firing during the language-switch window
    if (inactivityTimerRef.current) { clearTimeout(inactivityTimerRef.current); inactivityTimerRef.current = null; }
    if (inactivityWarningTimerRef.current) { clearTimeout(inactivityWarningTimerRef.current); inactivityWarningTimerRef.current = null; }
    if (status === 'connected' || status === 'connecting') {
      await endSession();
    }
    sessionStartedRef.current = false;
    retryCountRef.current = 0;
  }, [selectedLanguage, endSession, status]);

  // ============================================================================
  // VOICE CALL CONTROLS — start/end voice on demand
  // ============================================================================

  const startVoiceCall = useCallback(async () => {
    if (config.textOnly) {
      console.warn('[ChatV2] Voice not available — textOnly is enabled in config');
      return;
    }
    console.log('[ChatV2] Starting voice call — switching to voice mode...');
    sessionTerminatedRef.current = false;
    voiceCallActiveRef.current = true;
    setVoiceCallActive(true);
    setMicMuted(false);
    retryCountRef.current = 0;
    textOnlyFallbackRef.current = false;
    // Do NOT reset greetingShownRef — greeting is already in messages
    // Clear inactivity timers to prevent race conditions during switch
    if (inactivityTimerRef.current) { clearTimeout(inactivityTimerRef.current); inactivityTimerRef.current = null; }
    if (inactivityWarningTimerRef.current) { clearTimeout(inactivityWarningTimerRef.current); inactivityWarningTimerRef.current = null; }

    if (status === 'connected' || status === 'connecting') {
      // Active session — end it and let the RECONNECTION effect restart as voice.
      // Set modeSwitchingRef BEFORE endSession so the reconnection effect picks it up.
      // Do NOT set sessionStartedRef here — reconnection effect handles all of it
      // to prevent a race where both widget-open and reconnection effects fire.
      modeSwitchingRef.current = true;
      await endSession();
    } else {
      // Already disconnected — let widget-open effect handle the restart.
      // modeSwitchingRef stays false so the widget-open effect is not blocked.
      sessionStartedRef.current = false;
      setConnectionError(null); // force re-render → widget-open effect fires
    }
  }, [endSession, config.textOnly, status]);

  const endVoiceCall = useCallback(async () => {
    console.log('[ChatV2] Ending voice call — terminating session...');
    // Terminate completely — no auto-restart. User types to start new conversation.
    sessionTerminatedRef.current = true;
    modeSwitchingRef.current = false;
    voiceCallActiveRef.current = false;
    setVoiceCallActive(false);
    setMicMuted(true);
    // Clear inactivity timers
    if (inactivityTimerRef.current) { clearTimeout(inactivityTimerRef.current); inactivityTimerRef.current = null; }
    if (inactivityWarningTimerRef.current) { clearTimeout(inactivityWarningTimerRef.current); inactivityWarningTimerRef.current = null; }
    // End session — NO reconnection, session is done
    if (status === 'connected' || status === 'connecting') {
      await endSession();
    }
    sessionStartedRef.current = false;
    setIsThinking(false); // Clear any pending thinking state
    // Show conversation-ended status inline
    setMessages(prev => [...prev, {
      id: `session-end-${Date.now()}`,
      role: 'assistant' as const,
      content: 'Call ended. Type a message to start a new conversation.',
      timestamp: new Date(),
    }]);
  }, [endSession, status]);

  const actions: ChatActions = useMemo(() => ({
    openWidget,
    closeWidget,
    toggleWidget,
    clearMessages,
    startVoiceCall,
    endVoiceCall,
    setLanguage,
    dismissToast,
  }), [openWidget, closeWidget, toggleWidget, clearMessages, startVoiceCall, endVoiceCall, setLanguage, dismissToast]);

  // ============================================================================
  // BUILD STATE OBJECT
  // ============================================================================

  const state: ChatState = useMemo(() => {
    // Compute effective thinking/speaking states:
    // - isThinking should be false when session is terminated (unless reconnecting for a pending message)
    // - isSpeaking from the SDK can be stale during async disconnect; gate it on connection status
    const effectiveIsThinking = isThinking && (status === 'connected' || status === 'connecting' || !!pendingMessageRef.current);
    const effectiveIsSpeaking = isSpeaking && status === 'connected';

    return {
      isOpen,
      messages,
      isSpeaking: effectiveIsSpeaking,
      canSendFeedback,
      isThinking: effectiveIsThinking,
      isListening: voiceCallActive && !micMuted && status === 'connected',
      connectionError,
      voiceCallActive,
      selectedLanguage,
      toasts,
    };
  }, [isOpen, messages, isSpeaking, isThinking, canSendFeedback, voiceCallActive, micMuted, status, connectionError, selectedLanguage, toasts]);

  // ============================================================================
  // CONVERSATION METHODS (for child components)
  // ============================================================================

  // Wrap sendUserMessage to optimistically add typed messages to local state.
  // The SDK does NOT echo typed text back through onMessage — only voice
  // transcriptions arrive that way. Without this wrapper, typed messages
  // vanish from the UI after the input clears.
  const wrappedSendUserMessage = useCallback((text: string) => {
    const userMsg: Message = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      role: 'user',
      content: text,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMsg]);
    config.onMessage?.(userMsg);

    // If session is disconnected (e.g. after inactivity timeout or ended call),
    // auto-restart and queue the message to be sent once the new session connects.
    if (status === 'disconnected') {
      console.log('[ChatV2] Session disconnected — restarting for pending message');
      sessionTerminatedRef.current = false; // User wants to chat — allow restart
      // Keep greetingShownRef true — suppress greeting on reconnect since the
      // user's own message is the logical start of the new exchange
      pendingMessageRef.current = text;
      sessionStartedRef.current = false;
      retryCountRef.current = 0;
      setIsThinking(true); // Show thinking indicator while reconnecting
      setConnectionError(null); // Triggers the widget-open effect to call initiateSession
      return;
    }

    setIsThinking(true); // Show thinking indicator while agent processes
    resetInactivityTimer(); // User engaged — reset timeout

    // Send to ElevenLabs via SDK
    sendUserMessage(text);
  }, [sendUserMessage, config, resetInactivityTimer, status]);

  // Flush pending message once the session reconnects after an inactivity restart
  useEffect(() => {
    if (status === 'connected' && pendingMessageRef.current) {
      const text = pendingMessageRef.current;
      pendingMessageRef.current = null;
      console.log('[ChatV2] Sending pending message after reconnect:', text.slice(0, 40));
      setIsThinking(true);
      resetInactivityTimer();
      sendUserMessage(text);
    }
  }, [status, sendUserMessage, resetInactivityTimer]);

  const conversationMethods: ConversationMethods = useMemo(() => ({
    sendUserMessage: wrappedSendUserMessage,
    sendUserActivity,
    sendFeedback,
    endSession,
    status,
    isSpeaking,
    canSendFeedback,
    micMuted: config.textOnly ? true : micMuted,
    toggleMic,
    getInputVolume,
    getOutputVolume,
  }), [wrappedSendUserMessage, sendUserActivity, sendFeedback, endSession, status, isSpeaking, canSendFeedback, config.textOnly, micMuted, toggleMic, getInputVolume, getOutputVolume]);

  // ============================================================================
  // CONTEXT VALUE
  // ============================================================================

  const contextValue: ChatContextV2Value = useMemo(() => ({
    config,
    theme,
    state,
    actions,
    conversation: conversationMethods,
  }), [config, theme, state, actions, conversationMethods]);

  return (
    <ChatContextV2.Provider value={contextValue}>
      {children}
    </ChatContextV2.Provider>
  );
}

// =============================================================================
// HOOKS
// =============================================================================

/**
 * Access the full chat context
 */
export function useChatContextV2(): ChatContextV2Value {
  const context = useContext(ChatContextV2);
  if (!context) {
    throw new Error('useChatContextV2 must be used within ChatProviderV2');
  }
  return context;
}

/**
 * Access chat configuration
 */
export function useChatConfigV2(): ChatConfigV2 {
  return useChatContextV2().config;
}

/**
 * Access chat theme
 */
export function useChatThemeV2(): ChatThemeV2 {
  return useChatContextV2().theme;
}

/**
 * Access UI state and actions
 */
export function useChatStateV2() {
  const { state, actions } = useChatContextV2();
  return { ...state, ...actions };
}

/**
 * Access conversation methods from the single useConversation() instance.
 * Child components MUST use this instead of calling useConversation() directly.
 */
export function useConversationV2(): ConversationMethods {
  return useChatContextV2().conversation;
}
