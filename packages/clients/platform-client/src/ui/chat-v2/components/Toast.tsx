/**
 * Toast Notification Component
 *
 * Renders dismissible toast notifications at the top of the chat message area.
 * Toasts auto-dismiss after their configured duration. Displayed as a floating
 * stack, newest on top.
 *
 * NEVER imports from @elevenlabs/react — uses provider hooks only.
 */

import React from 'react';
import { useChatThemeV2 } from '../provider';
import type { ToastData } from '../types';

// =============================================================================
// ICONS
// =============================================================================

const iconPaths: Record<ToastData['type'], string> = {
  info:    'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z',
  success: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z',
  warning: 'M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z',
  error:   'M12 2C6.47 2 2 6.47 2 12s4.47 10 10 10 10-4.47 10-10S17.53 2 12 2zm5 13.59L15.59 17 12 13.41 8.41 17 7 15.59 10.59 12 7 8.41 8.41 7 12 10.59 15.59 7 17 8.41 13.41 12 17 15.59z',
};

const colors: Record<ToastData['type'], { bg: string; border: string; text: string; icon: string }> = {
  info:    { bg: '#eff6ff', border: '#bfdbfe', text: '#1e40af', icon: '#3b82f6' },
  success: { bg: '#f0fdf4', border: '#bbf7d0', text: '#166534', icon: '#22c55e' },
  warning: { bg: '#fffbeb', border: '#fde68a', text: '#92400e', icon: '#f59e0b' },
  error:   { bg: '#fef2f2', border: '#fecaca', text: '#991b1b', icon: '#ef4444' },
};

// =============================================================================
// COMPONENT
// =============================================================================

interface ToastProps {
  toast: ToastData;
  onDismiss: (id: string) => void;
}

export function Toast({ toast, onDismiss }: ToastProps) {
  const theme = useChatThemeV2();
  const c = colors[toast.type];

  return (
    <div
      role="alert"
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '8px',
        padding: '10px 12px',
        borderRadius: theme.borderRadius,
        backgroundColor: c.bg,
        border: `1px solid ${c.border}`,
        color: c.text,
        fontSize: theme.fontSizeSmall,
        fontFamily: theme.fontFamily,
        lineHeight: 1.4,
        animation: 'ruskins-toast-in 250ms ease-out',
        position: 'relative',
      }}
    >
      {/* Type icon */}
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill={c.icon}
        style={{ flexShrink: 0, marginTop: '1px' }}
      >
        <path d={iconPaths[toast.type]} />
      </svg>

      {/* Message — plain text only (XSS safe) */}
      <span style={{ flex: 1, wordBreak: 'break-word' }}>{toast.message}</span>

      {/* Dismiss button */}
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        aria-label="Dismiss notification"
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '0',
          color: c.text,
          opacity: 0.6,
          flexShrink: 0,
          lineHeight: 1,
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>

      <style>{`
        @keyframes ruskins-toast-in {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

// =============================================================================
// TOAST STACK — renders all active toasts
// =============================================================================

interface ToastStackProps {
  toasts: ToastData[];
  onDismiss: (id: string) => void;
}

export function ToastStack({ toasts, onDismiss }: ToastStackProps) {
  if (toasts.length === 0) return null;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        flexShrink: 0,
        marginBottom: '8px',
      }}
    >
      {toasts.map((t) => (
        <Toast key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}
