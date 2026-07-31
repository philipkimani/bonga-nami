/**
 * Chat V2 Input Component
 *
 * Pill-shaped input field with animated send button and optional voice call button.
 * Uses conversation methods from provider context -- NEVER calls useConversation() directly.
 */

import React, { useState, useRef } from 'react';
import { useChatThemeV2, useConversationV2, useChatStateV2 } from '../provider';
import { MicButton } from './MicButton';

const SendIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m22 2-7 20-4-9-9-4Z" />
    <path d="M22 2 11 13" />
  </svg>
);

const PhoneOffIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91"/>
    <line x1="1" y1="1" x2="23" y2="23"/>
  </svg>
);

export function ChatInput() {
  const theme = useChatThemeV2();
  const { sendUserMessage, sendUserActivity, status } = useConversationV2();
  const { voiceCallActive, endVoiceCall } = useChatStateV2();
  const [inputValue, setInputValue] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim()) return;
    if (status === 'connecting' || status === 'disconnecting') return;

    // Allow sending when disconnected — wrappedSendUserMessage will
    // queue the message and auto-restart the session
    sendUserMessage(inputValue);
    setInputValue('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
    // Signal user activity to prevent agent from interrupting for ~2s
    if (status === 'connected') {
      sendUserActivity();
    }
  };

  const canSend = !!inputValue.trim() && status !== 'connecting' && status !== 'disconnecting';
  const isConnected = status === 'connected';

  // ── Voice call mode: show End Call button instead of text input ─────────
  if (voiceCallActive) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: `${theme.spacingSm} ${theme.spacingMd}`,
          borderTop: `1px solid ${theme.surfaceColor}`,
          backgroundColor: theme.backgroundColor,
        }}
      >
        <button
          type="button"
          onClick={endVoiceCall}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 24px',
            background: 'linear-gradient(135deg, #ef4444, #dc2626)',
            color: 'white',
            border: 'none',
            borderRadius: '24px',
            fontSize: theme.fontSizeBase,
            fontWeight: 600,
            fontFamily: theme.fontFamily,
            cursor: 'pointer',
            transition: 'all 200ms ease',
            boxShadow: '0 2px 8px rgba(239,68,68,0.3)',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.03)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(239,68,68,0.4)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(239,68,68,0.3)'; }}
        >
          <PhoneOffIcon />
          End Call
        </button>
      </div>
    );
  }

  // ── Text mode: normal input ────────────────────────────────────────────

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: `${theme.spacingSm} ${theme.spacingMd}`,
        borderTop: `1px solid ${theme.surfaceColor}`,
        backgroundColor: theme.backgroundColor,
      }}
    >
      {/* Mic button — only rendered when voice mode is enabled */}
      <MicButton />

      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          padding: '4px 4px 4px 16px',
          border: `1.5px solid ${isFocused ? theme.primaryColor : theme.surfaceColor}`,
          borderRadius: '24px',
          backgroundColor: (status === 'connected' || status === 'disconnected') ? theme.backgroundColor : theme.surfaceColor,
          transition: `all ${theme.transitionDuration} ${theme.transitionEasing}`,
          boxShadow: isFocused ? `0 0 0 3px ${theme.primaryColor}15` : 'none',
        }}
      >
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder="Type your message..."
          disabled={status === 'connecting'}
          style={{
            flex: 1,
            padding: '8px 0',
            border: 'none',
            fontFamily: theme.fontFamily,
            fontSize: theme.fontSizeBase,
            color: theme.textColor,
            backgroundColor: 'transparent',
            opacity: status === 'connecting' ? 0.5 : 1,
            cursor: status === 'connecting' ? 'not-allowed' : 'text',
            outline: 'none',
          }}
        />

        <button
          type="submit"
          disabled={!canSend}
          style={{
            width: '34px',
            height: '34px',
            flexShrink: 0,
            padding: 0,
            background: canSend
              ? `linear-gradient(135deg, ${theme.primaryColor} 0%, ${theme.secondaryColor} 100%)`
              : theme.surfaceColor,
            color: canSend ? theme.textColorInverse : theme.textColorMuted,
            border: 'none',
            borderRadius: '50%',
            cursor: canSend ? 'pointer' : 'default',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: `all 200ms ${theme.transitionEasing}`,
            transform: canSend ? 'scale(1)' : 'scale(0.9)',
            opacity: canSend ? 1 : 0.4,
          }}
        >
          <SendIcon />
        </button>
      </div>
    </form>
  );
}
