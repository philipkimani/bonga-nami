/**
 * Chat V2 Message Component
 * 
 * Modern message bubbles with avatar, differentiated corners, and subtle animations.
 */

import React from 'react';
import { useChatThemeV2 } from '../provider';
import { MarkdownRenderer } from './MarkdownRenderer';
import { ContentCard } from './ContentCard';
import type { Message } from '../types';

interface MessageProps {
  message: Message;
}

const BotAvatar = ({ color }: { color: string }) => (
  <div
    style={{
      width: '28px',
      height: '28px',
      borderRadius: '8px',
      backgroundColor: color,
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
);

export function Message({ message }: MessageProps) {
  const theme = useChatThemeV2();
  const isUser = message.role === 'user';
  const isCard = message.type === 'card' && message.cardData;

  const timeStr = message.timestamp
    ? new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';

  // Rich card messages render as ContentCard instead of a text bubble
  if (isCard) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-start',
          alignItems: 'flex-end',
          gap: '8px',
          marginBottom: '4px',
          animation: 'ruskins-msg-in 250ms ease-out',
          maxWidth: '88%',
        }}
      >
        <BotAvatar color={theme.primaryColor} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <ContentCard card={message.cardData!} />
          {timeStr && (
            <div
              style={{
                fontSize: '10px',
                color: theme.textColorMuted,
                marginTop: '3px',
                opacity: 0.7,
                paddingLeft: '4px',
              }}
            >
              {timeStr}
            </div>
          )}
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

  // Differentiated border-radius: round on 3 corners, flat on the "tail" corner
  const userRadius = `${theme.borderRadius} ${theme.borderRadius} 4px ${theme.borderRadius}`;
  const assistantRadius = `${theme.borderRadius} ${theme.borderRadius} ${theme.borderRadius} 4px`;

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: isUser ? 'flex-end' : 'flex-start',
        alignItems: 'flex-end',
        gap: '8px',
        marginBottom: '4px',
        animation: 'ruskins-msg-in 250ms ease-out',
      }}
    >
      {/* Bot avatar */}
      {!isUser && <BotAvatar color={theme.primaryColor} />}

      <div style={{ maxWidth: '78%', display: 'flex', flexDirection: 'column', alignItems: isUser ? 'flex-end' : 'flex-start' }}>
        <div
          style={{
            padding: `${theme.spacingSm} ${theme.spacingMd}`,
            borderRadius: isUser ? userRadius : assistantRadius,
            backgroundColor: isUser ? theme.userMessageBg : theme.assistantMessageBg,
            color: isUser ? theme.userMessageText : theme.assistantMessageText,
            wordWrap: 'break-word',
            overflowWrap: 'break-word',
            fontSize: theme.fontSizeBase,
            lineHeight: '1.55',
            boxShadow: isUser ? 'none' : '0 1px 2px rgba(0,0,0,0.04)',
          }}
        >
          <MarkdownRenderer content={message.content} isUser={isUser} />
        </div>
        {timeStr && (
          <div
            style={{
              fontSize: '10px',
              color: theme.textColorMuted,
              marginTop: '3px',
              opacity: 0.7,
              paddingLeft: isUser ? 0 : '4px',
              paddingRight: isUser ? '4px' : 0,
            }}
          >
            {timeStr}
          </div>
        )}
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
