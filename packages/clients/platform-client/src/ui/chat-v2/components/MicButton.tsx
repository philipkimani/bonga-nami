/**
 * Chat V2 Call Button (formerly MicButton)
 *
 * Green "Start call" / Red "End call" button for on-demand voice mode.
 * Only rendered when voice is available (textOnly === false in config).
 * Voice sessions are NOT started automatically — the user must press this button.
 *
 * Uses state/actions from provider context — NEVER calls useConversation() directly.
 */

import React, { useEffect, useRef } from 'react';
import { useChatThemeV2, useChatConfigV2, useChatStateV2, useConversationV2 } from '../provider';

// =============================================================================
// SVG ICONS
// =============================================================================

const PhoneIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
  </svg>
);

const PhoneOffIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91" />
    <line x1="23" y1="1" x2="1" y2="23" />
  </svg>
);

// =============================================================================
// COMPONENT
// =============================================================================

export function MicButton() {
  const theme = useChatThemeV2();
  const config = useChatConfigV2();
  const { voiceCallActive, startVoiceCall, endVoiceCall } = useChatStateV2();
  const { status, getInputVolume } = useConversationV2();

  // Don't render when voice is unavailable (text-only config from Admin Console)
  if (config.textOnly) return null;

  const isConnected = status === 'connected';

  const handleClick = async () => {
    try {
      if (voiceCallActive) {
        await endVoiceCall();
      } else {
        await startVoiceCall();
      }
    } catch (err) {
      console.error('[MicButton] Voice call action failed:', err);
    }
  };

  return (
    <div style={{ position: 'relative', display: 'inline-flex' }}>
      {/* Audio level ring — visible during active voice call */}
      {voiceCallActive && isConnected && (
        <AudioLevelRing getInputVolume={getInputVolume} />
      )}

      <button
        type="button"
        onClick={handleClick}
        disabled={!isConnected}
        aria-label={voiceCallActive ? 'End voice call' : 'Start voice call'}
        title={voiceCallActive ? 'End call' : 'Start call'}
        style={{
          position: 'relative',
          zIndex: 1,
          width: '40px',
          height: '40px',
          padding: 0,
          background: voiceCallActive ? '#ef4444' : '#22c55e',
          color: '#ffffff',
          border: 'none',
          borderRadius: '50%',
          cursor: isConnected ? 'pointer' : 'not-allowed',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: `all ${theme.transitionDuration} ${theme.transitionEasing}`,
          opacity: isConnected ? 1 : 0.4,
          boxShadow: voiceCallActive
            ? '0 2px 12px rgba(239, 68, 68, 0.4)'
            : '0 2px 12px rgba(34, 197, 94, 0.4)',
          flexShrink: 0,
        }}
      >
        {voiceCallActive ? <PhoneOffIcon /> : <PhoneIcon />}
      </button>
    </div>
  );
}

// =============================================================================
// AUDIO LEVEL RING — pulsing ring that responds to mic input volume
// =============================================================================

function AudioLevelRing({
  getInputVolume,
}: {
  getInputVolume: () => number;
}) {
  const ringRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    function animate() {
      const volume = getInputVolume();
      if (ringRef.current) {
        // Scale from 1.0 (silent) to 1.5 (loud), opacity 0.15 to 0.7
        const scale = 1 + volume * 0.5;
        const opacity = 0.15 + volume * 0.55;
        ringRef.current.style.transform = `scale(${scale})`;
        ringRef.current.style.opacity = `${opacity}`;
      }
      rafRef.current = requestAnimationFrame(animate);
    }

    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [getInputVolume]);

  return (
    <div
      ref={ringRef}
      style={{
        position: 'absolute',
        inset: '-4px',
        borderRadius: '50%',
        border: '2px solid #22c55e',
        opacity: 0.15,
        pointerEvents: 'none',
        zIndex: 0,
        transition: 'transform 50ms ease-out',
      }}
    />
  );
}
