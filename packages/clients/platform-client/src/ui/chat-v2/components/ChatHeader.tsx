/**
 * Chat V2 Header Component
 * 
 * Clean, polished header with status indicator and flag-based language selector.
 */

import React from 'react';
import { useChatStateV2, useChatThemeV2, useChatConfigV2, useConversationV2 } from '../provider';
import { LanguageSelector } from './LanguageSelector';

interface ChatHeaderProps {
  showClose?: boolean;
}

const CloseIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const BotIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 8V4H8" />
    <rect width="16" height="12" x="4" y="8" rx="2" />
    <path d="M2 14h2" />
    <path d="M20 14h2" />
    <path d="M15 13v2" />
    <path d="M9 13v2" />
  </svg>
);

export function ChatHeader({ showClose = true }: ChatHeaderProps) {
  const { closeWidget } = useChatStateV2();
  const theme = useChatThemeV2();
  const config = useChatConfigV2();
  const { status } = useConversationV2();

  const isConnected = status === 'connected';
  const isConnecting = status === 'connecting';

  return (
    <div
      style={{
        padding: '14px 16px',
        background: `linear-gradient(135deg, ${theme.primaryColor} 0%, ${theme.secondaryColor} 100%)`,
        color: theme.textColorInverse,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        position: 'relative',
        overflow: 'hidden',
        minHeight: '28px',
      }}
    >
      {/* Subtle decorative element */}
      <div
        style={{
          position: 'absolute',
          top: '-30px',
          right: '-30px',
          width: '100px',
          height: '100px',
          borderRadius: '50%',
          background: 'rgba(255,255,255,0.06)',
          pointerEvents: 'none',
        }}
      />

      {/* Left: Avatar + title */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', position: 'relative', zIndex: 1, minWidth: 0, flex: 1 }}>
        {/* Avatar */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <div
            style={{
              width: '34px',
              height: '34px',
              borderRadius: '10px',
              background: 'rgba(255,255,255,0.18)',
              backdropFilter: 'blur(8px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: theme.textColorInverse,
            }}
          >
            <BotIcon />
          </div>
          {/* Status dot */}
          <div
            style={{
              position: 'absolute',
              bottom: '-1px',
              right: '-1px',
              width: '9px',
              height: '9px',
              borderRadius: '50%',
              border: `2px solid ${theme.primaryColor}`,
              backgroundColor: isConnected ? '#22c55e' : isConnecting ? '#f59e0b' : '#94a3b8',
              transition: 'background-color 300ms ease',
            }}
          />
        </div>

        {/* Title area */}
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: '15px',
              fontWeight: 600,
              color: theme.textColorInverse,
              lineHeight: 1.2,
              letterSpacing: '-0.01em',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {config.title}
          </div>
          {config.subtitle && (
            <div
              style={{
                fontSize: '11px',
                color: 'rgba(255,255,255,0.7)',
                marginTop: '2px',
                lineHeight: 1.2,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {config.subtitle}
            </div>
          )}
        </div>
      </div>

      {/* Right: Language + Close */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', position: 'relative', zIndex: 1, flexShrink: 0 }}>
        {config.showLanguageSelector !== false && <LanguageSelector />}

        {showClose && (
          <button
            onClick={closeWidget}
            style={{
              background: 'rgba(255,255,255,0.15)',
              border: 'none',
              cursor: 'pointer',
              color: theme.textColorInverse,
              padding: '7px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '8px',
              transition: `all ${theme.transitionDuration} ${theme.transitionEasing}`,
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.28)';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.15)';
            }}
          >
            <CloseIcon />
          </button>
        )}
      </div>
    </div>
  );
}
