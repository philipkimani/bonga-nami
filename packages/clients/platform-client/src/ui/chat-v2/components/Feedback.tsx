/**
 * Chat V2 Feedback Component (NEW FEATURE)
 *
 * Allows users to rate agent responses.
 * Uses conversation methods from provider context -- NEVER calls useConversation() directly.
 */

import React, { useState } from 'react';
import { useChatThemeV2, useChatConfigV2, useConversationV2 } from '../provider';

const ThumbsUpIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2">
    <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
  </svg>
);

const ThumbsDownIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2">
    <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h3a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-3" />
  </svg>
);

export function Feedback() {
  const { canSendFeedback, sendFeedback } = useConversationV2();
  const { onFeedback } = useChatConfigV2();
  const theme = useChatThemeV2();
  const [submitted, setSubmitted] = useState<boolean | null>(null);

  if (!canSendFeedback || submitted !== null) {
    return null;
  }

  const handleFeedback = (positive: boolean) => {
    sendFeedback(positive);
    setSubmitted(positive);
    onFeedback?.(positive);

    // Reset after 2 seconds
    setTimeout(() => setSubmitted(null), 2000);
  };

  return (
    <div
      style={{
        display: 'flex',
        gap: theme.spacingSm,
        alignItems: 'center',
        padding: `${theme.spacingSm} 0`,
        fontSize: theme.fontSizeSmall,
        color: theme.textColorMuted,
      }}
    >
      <span>Was this helpful?</span>
      <button
        onClick={() => handleFeedback(true)}
        title="Yes, helpful"
        style={{
          background: 'none',
          border: 'none',
          color: theme.textColorMuted,
          cursor: 'pointer',
          padding: '0.25rem',
          display: 'flex',
          alignItems: 'center',
          transition: `color ${theme.transitionDuration} ${theme.transitionEasing}`,
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.color = '#22c55e';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.color = theme.textColorMuted;
        }}
      >
        <ThumbsUpIcon />
      </button>
      <button
        onClick={() => handleFeedback(false)}
        title="No, not helpful"
        style={{
          background: 'none',
          border: 'none',
          color: theme.textColorMuted,
          cursor: 'pointer',
          padding: '0.25rem',
          display: 'flex',
          alignItems: 'center',
          transition: `color ${theme.transitionDuration} ${theme.transitionEasing}`,
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.color = '#ef4444';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.color = theme.textColorMuted;
        }}
      >
        <ThumbsDownIcon />
      </button>
    </div>
  );
}
