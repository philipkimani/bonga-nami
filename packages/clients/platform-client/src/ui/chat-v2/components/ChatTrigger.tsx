/**
 * Chat V2 Trigger Button Component
 * 
 * Modern floating action button with gradient, pulse animation, and smooth transitions.
 */

import React from 'react';
import { useChatStateV2, useChatThemeV2 } from '../provider';

const MessageIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);

const CloseIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

export function ChatTrigger() {
  const { isOpen, toggleWidget } = useChatStateV2();
  const theme = useChatThemeV2();

  return (
    <>
      <style>{`
        @keyframes bn-trigger-pulse {
          0% { box-shadow: 0 0 0 0 ${theme.primaryColor}66; }
          70% { box-shadow: 0 0 0 14px ${theme.primaryColor}00; }
          100% { box-shadow: 0 0 0 0 ${theme.primaryColor}00; }
        }
        @keyframes bn-trigger-rotate-in {
          from { transform: rotate(0deg) scale(0.8); opacity: 0; }
          to { transform: rotate(0deg) scale(1); opacity: 1; }
        }
      `}</style>

      <button
        onClick={toggleWidget}
        aria-label={isOpen ? 'Close chat' : 'Open chat'}
        style={{
          width: theme.widgetButtonSize,
          height: theme.widgetButtonSize,
          borderRadius: '50%',
          background: `linear-gradient(135deg, ${theme.primaryColor} 0%, ${theme.secondaryColor} 100%)`,
          color: theme.textColorInverse,
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: `0 4px 14px ${theme.primaryColor}40`,
          transition: `all 300ms ${theme.transitionEasing}`,
          transform: 'scale(1)',
          animation: isOpen ? 'none' : 'bn-trigger-pulse 2s ease-out infinite',
          position: 'relative',
          overflow: 'hidden',
        }}
        onMouseEnter={(e) => {
          const el = e.currentTarget as HTMLButtonElement;
          el.style.transform = 'scale(1.08)';
          el.style.boxShadow = `0 6px 20px ${theme.primaryColor}50`;
        }}
        onMouseLeave={(e) => {
          const el = e.currentTarget as HTMLButtonElement;
          el.style.transform = 'scale(1)';
          el.style.boxShadow = `0 4px 14px ${theme.primaryColor}40`;
        }}
      >
        {/* Shimmer overlay */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0) 50%)',
            pointerEvents: 'none',
          }}
        />
        
        <div
          key={isOpen ? 'close' : 'open'}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            animation: 'bn-trigger-rotate-in 200ms ease-out',
          }}
        >
          {isOpen ? <CloseIcon /> : <MessageIcon />}
        </div>
      </button>
    </>
  );
}
