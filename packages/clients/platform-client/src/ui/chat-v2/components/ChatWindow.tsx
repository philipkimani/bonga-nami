/**
 * Chat V2 Window Component
 * 
 * Main chat window container with smooth entrance animation and modern styling.
 */

import React from 'react';
import { useChatStateV2, useChatThemeV2, useChatConfigV2 } from '../provider';
import { ChatHeader } from './ChatHeader';
import { ChatMessages } from './ChatMessages';
import { ChatInput } from './ChatInput';

interface ChatWindowProps {
  renderHeader?: (props: { onClose: () => void }) => React.ReactNode;
  renderFooter?: () => React.ReactNode;
}

function poweredByStyle(
  theme: ReturnType<typeof useChatThemeV2>
): React.CSSProperties {
  return {
    fontSize: '10px',
    color: theme.textColorMuted,
    textDecoration: 'none',
    letterSpacing: '0.02em',
  };
}

export function ChatWindow({
  renderHeader,
  renderFooter,
}: ChatWindowProps) {
  const { closeWidget } = useChatStateV2();
  const theme = useChatThemeV2();
  const config = useChatConfigV2();

  return (
    <>
      <style>{`
        @keyframes ruskins-window-in {
          from { opacity: 0; transform: translateY(12px) scale(0.96); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>

      <div
        style={{
          width: theme.widgetWidth,
          height: theme.widgetHeight,
          maxWidth: 'calc(100vw - 2rem)',
          maxHeight: 'calc(100vh - 8rem)',
          backgroundColor: theme.backgroundColor,
          borderRadius: theme.borderRadiusLarge,
          boxShadow: '0 8px 30px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.06)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          fontFamily: theme.fontFamily,
          fontSize: theme.fontSizeBase,
          color: theme.textColor,
          border: `1px solid rgba(0, 0, 0, 0.06)`,
          animation: 'ruskins-window-in 250ms ease-out',
        }}
      >
        {/* Header */}
        {renderHeader ? (
          renderHeader({ onClose: closeWidget })
        ) : (
          <ChatHeader />
        )}

        {/* Messages Area */}
        <ChatMessages />

        {/* Input Area */}
        <ChatInput />

        {/* Footer / Powered By */}
        {renderFooter ? renderFooter() : (
          config.showPoweredBy && (
            <div
              style={{
                padding: `6px ${theme.spacingMd}`,
                borderTop: `1px solid ${theme.surfaceColor}`,
                backgroundColor: theme.surfaceColor,
                textAlign: 'center',
              }}
            >
              {/* Blank poweredByLink = attribution text with no outbound link */}
              {config.poweredByLink ? (
                <a
                  href={config.poweredByLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={poweredByStyle(theme)}
                >
                  {config.poweredByText}
                </a>
              ) : (
                <span style={poweredByStyle(theme)}>{config.poweredByText}</span>
              )}
            </div>
          )
        )}
      </div>
    </>
  );
}
