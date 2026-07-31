/**
 * Content Card Component
 *
 * Renders rich content inline in the chat message stream.
 * Used by the displayContent client tool to show images, titles,
 * descriptions, links, and CTA buttons.
 *
 * Links: All URLs open in a new tab (user-initiated click).
 * Images: Only https:// URLs are rendered.
 *
 * NEVER imports from @elevenlabs/react — uses provider hooks only.
 */

import React, { useState } from 'react';
import { useChatThemeV2 } from '../provider';
import type { CardData } from '../types';

// =============================================================================
// EXTERNAL LINK ICON
// =============================================================================

const ExternalLinkIcon = () => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ marginLeft: '4px', verticalAlign: 'middle', opacity: 0.7 }}
  >
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    <polyline points="15 3 21 3 21 9" />
    <line x1="10" y1="14" x2="21" y2="3" />
  </svg>
);

// =============================================================================
// COMPONENT
// =============================================================================

interface ContentCardProps {
  card: CardData;
}

export function ContentCard({ card }: ContentCardProps) {
  const theme = useChatThemeV2();
  const [imageError, setImageError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);

  const hasImage = card.imageUrl && !imageError;
  const hasButtons = card.buttons && card.buttons.length > 0;

  return (
    <div
      style={{
        borderRadius: theme.borderRadius,
        border: `1px solid ${theme.surfaceColor}`,
        backgroundColor: theme.backgroundColor,
        overflow: 'hidden',
        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
        maxWidth: '100%',
      }}
    >
      {/* Image */}
      {hasImage && (
        <div
          style={{
            width: '100%',
            maxHeight: '180px',
            overflow: 'hidden',
            backgroundColor: theme.surfaceColor,
            display: imageLoaded ? 'block' : 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: imageLoaded ? undefined : '80px',
          }}
        >
          {!imageLoaded && (
            <div style={{ color: theme.textColorMuted, fontSize: theme.fontSizeSmall }}>
              Loading image...
            </div>
          )}
          <img
            src={card.imageUrl}
            alt={card.title || 'Content image'}
            onError={() => setImageError(true)}
            onLoad={() => setImageLoaded(true)}
            style={{
              width: '100%',
              height: 'auto',
              maxHeight: '180px',
              objectFit: 'cover',
              display: imageLoaded ? 'block' : 'none',
            }}
          />
        </div>
      )}

      {/* Body */}
      <div style={{ padding: '12px 14px' }}>
        {/* Title */}
        {card.title && (
          <div
            style={{
              fontWeight: 600,
              fontSize: theme.fontSizeBase,
              color: theme.textColor,
              lineHeight: 1.3,
              marginBottom: card.description || card.url || hasButtons ? '6px' : 0,
            }}
          >
            {card.title}
          </div>
        )}

        {/* Description */}
        {card.description && (
          <div
            style={{
              fontSize: theme.fontSizeSmall,
              color: theme.textColorMuted,
              lineHeight: 1.5,
              marginBottom: card.url || hasButtons ? '10px' : 0,
              wordBreak: 'break-word',
            }}
          >
            {card.description}
          </div>
        )}

        {/* URL link */}
        {card.url && (
          <a
            href={card.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              fontSize: theme.fontSizeSmall,
              color: theme.primaryColor,
              textDecoration: 'none',
              marginBottom: hasButtons ? '10px' : 0,
              wordBreak: 'break-all',
            }}
          >
            {(() => {
              // Show a clean display URL
              try {
                const u = new URL(card.url, window.location.origin);
                return u.hostname + (u.pathname !== '/' ? u.pathname : '');
              } catch {
                return card.url;
              }
            })()}
            <ExternalLinkIcon />
          </a>
        )}

        {/* Buttons */}
        {hasButtons && (
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '6px',
              marginTop: '4px',
            }}
          >
            {card.buttons!.map((btn, i) => (
              <a
                key={`${btn.url}-${i}`}
                href={btn.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '6px 14px',
                  fontSize: theme.fontSizeSmall,
                  fontWeight: 500,
                  fontFamily: theme.fontFamily,
                  color: theme.primaryColor,
                  backgroundColor: `${theme.primaryColor}0a`,
                  border: `1px solid ${theme.primaryColor}30`,
                  borderRadius: '16px',
                  textDecoration: 'none',
                  cursor: 'pointer',
                  transition: `background-color ${theme.transitionDuration} ${theme.transitionEasing}`,
                  whiteSpace: 'nowrap',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = `${theme.primaryColor}18`;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = `${theme.primaryColor}0a`;
                }}
              >
                {btn.label}
                <ExternalLinkIcon />
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
