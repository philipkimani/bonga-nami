/**
 * Chat V2 Typing Indicator Component
 * 
 * Smooth wave-style bouncing dots with bot avatar for visual consistency.
 */

import React from 'react';
import { useChatThemeV2 } from '../provider';

export function TypingIndicator() {
  const theme = useChatThemeV2();

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-end',
        gap: '8px',
        animation: 'ruskins-msg-in 250ms ease-out',
      }}
    >
      {/* Bot avatar - matches Message component */}
      <div
        style={{
          width: '28px',
          height: '28px',
          borderRadius: '8px',
          backgroundColor: theme.primaryColor,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 8V4H8" />
          <rect width="16" height="12" x="4" y="8" rx="2" />
          <path d="M2 14h2" />
          <path d="M20 14h2" />
          <path d="M15 13v2" />
          <path d="M9 13v2" />
        </svg>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '5px',
          padding: `${theme.spacingSm} ${theme.spacingMd}`,
          borderRadius: `${theme.borderRadius} ${theme.borderRadius} ${theme.borderRadius} 4px`,
          backgroundColor: theme.assistantMessageBg,
          boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
        }}
      >
        {[0, 1, 2].map(i => (
          <div
            key={i}
            style={{
              width: '7px',
              height: '7px',
              borderRadius: '50%',
              backgroundColor: theme.textColorMuted,
              animation: 'ruskins-typing-wave 1.2s ease-in-out infinite',
              animationDelay: `${i * 0.15}s`,
            }}
          />
        ))}
      </div>

      <style>{`
        @keyframes ruskins-typing-wave {
          0%, 60%, 100% {
            opacity: 0.35;
            transform: translateY(0);
          }
          30% {
            opacity: 1;
            transform: translateY(-6px);
          }
        }
        @keyframes ruskins-msg-in {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
