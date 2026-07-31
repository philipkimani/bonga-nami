/**
 * Chat V2 Messages Component
 *
 * Reads messages, status, and isSpeaking from provider context.
 * NEVER calls useConversation() directly -- all SDK access is via the provider.
 */

import React, { useRef, useEffect } from 'react';
import { useChatThemeV2, useChatStateV2, useConversationV2 } from '../provider';
import { Message } from './Message';
import { TypingIndicator } from './TypingIndicator';
import { ToastStack } from './Toast';

export function ChatMessages() {
  const theme = useChatThemeV2();
  const { messages, isSpeaking, isThinking, connectionError, voiceCallActive, toasts, dismissToast } = useChatStateV2();
  const { status } = useConversationV2();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive or thinking starts
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isSpeaking, isThinking]);

  const showEmptyState = messages.length === 0 && !isSpeaking && !isThinking;

  // Voice call status (used by the compact banner below)
  const isConnected = status === 'connected';

  return (
    <div
      style={{
        flex: 1,
        overflowY: 'auto',
        padding: theme.spacingMd,
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        backgroundColor: theme.backgroundColor,
      }}
    >
      {/* ── Toast notifications (shown at top, above voice banner) ───────── */}
      <ToastStack toasts={toasts} onDismiss={dismissToast} />

      {/* ── Compact voice-call banner (shown at top during voice calls) ──── */}
      {voiceCallActive && (
        <>
          <style>{`
            @keyframes ruskins-pulse-ring {
              0% { transform: scale(0.85); opacity: 0.6; }
              50% { transform: scale(1.15); opacity: 0.15; }
              100% { transform: scale(0.85); opacity: 0.6; }
            }
            @keyframes ruskins-pulse-dot {
              0%, 100% { transform: scale(1); }
              50% { transform: scale(1.08); }
            }
          `}</style>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '10px 14px',
              borderRadius: theme.borderRadius,
              background: `linear-gradient(135deg, ${theme.primaryColor}12, ${theme.primaryColor}06)`,
              border: `1px solid ${theme.primaryColor}25`,
              marginBottom: '8px',
              flexShrink: 0,
            }}
          >
            {/* Small pulsing mic icon */}
            <div style={{ position: 'relative', width: 36, height: 36, flexShrink: 0 }}>
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  borderRadius: '50%',
                  border: `2px solid ${theme.primaryColor}`,
                  animation: 'ruskins-pulse-ring 2s ease-in-out infinite',
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  inset: 4,
                  borderRadius: '50%',
                  background: `linear-gradient(135deg, ${theme.primaryColor}, ${theme.secondaryColor || theme.primaryColor})`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  animation: isConnected && isSpeaking ? 'ruskins-pulse-dot 1s ease-in-out infinite' : 'none',
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                </svg>
              </div>
            </div>
            {/* Status label */}
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: theme.fontSizeSmall, color: theme.textColor, lineHeight: 1.3 }}>
                {!isConnected ? 'Connecting...' : isSpeaking ? 'AI is speaking...' : 'Listening...'}
              </div>
              <div style={{ fontSize: '11px', color: theme.textColorMuted, lineHeight: 1.3 }}>
                Voice call active — transcript below
              </div>
            </div>
          </div>
        </>
      )}
      {showEmptyState ? (
        <EmptyState isConnected={status === 'connected'} isConnecting={status === 'connecting'} error={connectionError} />
      ) : (
        <>
          {/* Messages */}
          {messages.map((message) => (
            <Message key={message.id} message={message} />
          ))}

          {/* Thinking/Speaking indicator — only when session is active */}
          {status === 'connected' && (isThinking || (isSpeaking && !voiceCallActive)) && <TypingIndicator />}

          {/* Scroll anchor */}
          <div ref={messagesEndRef} />
        </>
      )}
    </div>
  );
}

interface EmptyStateProps {
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
}

const ChatIllustration = ({ color }: { color: string }) => (
  <svg width="64" height="64" viewBox="0 0 80 80" fill="none">
    <circle cx="40" cy="40" r="36" fill={`${color}10`} stroke={`${color}30`} strokeWidth="1.5" />
    <rect x="22" y="24" width="36" height="26" rx="6" fill={`${color}20`} stroke={color} strokeWidth="1.5" />
    <path d="M30 50 L26 58 L36 50" fill={`${color}20`} stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
    <circle cx="33" cy="37" r="2" fill={color} />
    <circle cx="40" cy="37" r="2" fill={color} />
    <circle cx="47" cy="37" r="2" fill={color} />
  </svg>
);

const SpinnerIcon = ({ color }: { color: string }) => (
  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
    <style>{`
      @keyframes ruskins-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
    `}</style>
    <circle cx="12" cy="12" r="10" strokeOpacity="0.2" />
    <path d="M12 2a10 10 0 0 1 10 10" style={{ animation: 'ruskins-spin 1s linear infinite', transformOrigin: 'center' }} />
  </svg>
);

const ErrorIcon = () => (
  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="1.5">
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
);

function EmptyState({ isConnected, isConnecting, error }: EmptyStateProps) {
  const theme = useChatThemeV2();

  let illustration: React.ReactNode;
  let title = 'Ready to chat';
  let subtitle = 'Start typing to begin the conversation';

  if (error) {
    illustration = <ErrorIcon />;
    title = 'Connection failed';
    subtitle = error;
  } else if (isConnecting) {
    illustration = <SpinnerIcon color={theme.primaryColor} />;
    title = 'Connecting...';
    subtitle = 'Setting things up for you';
  } else if (!isConnected) {
    illustration = <ChatIllustration color={theme.textColorMuted} />;
    title = 'Disconnected';
    subtitle = 'Reopen the widget to reconnect';
  } else {
    illustration = <ChatIllustration color={theme.primaryColor} />;
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        gap: theme.spacingMd,
        color: theme.textColorMuted,
        textAlign: 'center',
        padding: theme.spacingLg,
        animation: 'ruskins-msg-in 400ms ease-out',
      }}
    >
      {illustration}
      <div>
        <div
          style={{
            fontWeight: '600',
            fontSize: theme.fontSizeBase,
            color: error ? '#ef4444' : theme.textColor,
            marginBottom: '6px',
          }}
        >
          {title}
        </div>
        <div style={{ fontSize: theme.fontSizeSmall, maxWidth: '220px', lineHeight: '1.4', wordBreak: 'break-word' }}>
          {subtitle}
        </div>
      </div>

      <style>{`
        @keyframes ruskins-msg-in {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
