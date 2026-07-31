/**
 * Chat V2 Widget Component
 * 
 * Main embeddable widget with floating button and chat window.
 * Uses @elevenlabs/react SDK for all conversation logic.
 */

import React from 'react';
import { useChatStateV2, useChatThemeV2, useChatConfigV2 } from '../provider';
import { ChatWindow } from './ChatWindow';
import { ChatTrigger } from './ChatTrigger';

interface ChatWidgetProps {
  className?: string;
  renderTrigger?: (props: { isOpen: boolean; onClick: () => void }) => React.ReactNode;
  renderHeader?: (props: { onClose: () => void }) => React.ReactNode;
  renderFooter?: () => React.ReactNode;
}

export function ChatWidgetV2({
  className,
  renderTrigger,
  renderHeader,
  renderFooter,
}: ChatWidgetProps) {
  const { isOpen, toggleWidget } = useChatStateV2();
  const theme = useChatThemeV2();
  const config = useChatConfigV2();

  // Position classes
  const positionMap = {
    'bottom-right': { bottom: '1.5rem', right: '1.5rem' },
    'bottom-left': { bottom: '1.5rem', left: '1.5rem' },
    'top-right': { top: '1.5rem', right: '1.5rem' },
    'top-left': { top: '1.5rem', left: '1.5rem' },
  };

  const position = positionMap[config.position] || positionMap['bottom-right'];

  // Window offset from trigger
  const windowPosition = config.position.startsWith('bottom')
    ? { bottom: `calc(${theme.widgetButtonSize} + 1rem)` }
    : { top: `calc(${theme.widgetButtonSize} + 1rem)` };

  const windowHorizontal = config.position.endsWith('right')
    ? { right: 0 }
    : { left: 0 };

  return (
    <div
      className={className}
      style={{
        position: 'fixed',
        zIndex: 999999,
        fontFamily: theme.fontFamily,
        ...position,
      }}
    >
      {/* Floating Chat Window */}
      {isOpen && (
        <div
          style={{
            position: 'absolute',
            ...windowPosition,
            ...windowHorizontal,
          }}
        >
          <ChatWindow 
            renderHeader={renderHeader}
            renderFooter={renderFooter}
          />
        </div>
      )}

      {/* Trigger Button */}
      {renderTrigger ? (
        renderTrigger({ isOpen, onClick: toggleWidget })
      ) : (
        <ChatTrigger />
      )}
    </div>
  );
}
