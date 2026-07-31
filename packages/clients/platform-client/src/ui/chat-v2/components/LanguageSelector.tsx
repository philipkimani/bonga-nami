/**
 * Language Selector Component
 *
 * Flag-based language picker using CDN flag images (not emoji — emoji flags
 * don't render on Windows). Dropdown uses a React Portal to escape the
 * widget's overflow:hidden containers.
 *
 * Uses the 39 languages supported by ElevenLabs Conversational AI.
 *
 * Changing language restarts the session (ElevenLabs does not support
 * mid-conversation language switching).
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { useChatStateV2, useChatThemeV2 } from '../provider';
import { SUPPORTED_LANGUAGES, LANGUAGE_MAP, getFlagUrl } from '../languages';

// ── Icons ───────────────────────────────────────────────────────────────

const SearchIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.3-4.3" />
  </svg>
);

const XIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

// ── Flag Image Component ────────────────────────────────────────────────

/** Renders a flag image from flagcdn.com CDN. Works on all platforms including Windows. */
function FlagImg({ countryCode, size = 20, style }: { countryCode: string; size?: number; style?: React.CSSProperties }) {
  return (
    <img
      src={getFlagUrl(countryCode, size <= 20 ? 20 : 40)}
      alt=""
      width={size}
      height={Math.round(size * 0.75)}
      loading="lazy"
      style={{
        objectFit: 'cover',
        borderRadius: '2px',
        display: 'block',
        flexShrink: 0,
        ...style,
      }}
    />
  );
}

// ── Main Component ──────────────────────────────────────────────────────

export function LanguageSelector() {
  const { selectedLanguage, setLanguage } = useChatStateV2();
  const theme = useChatThemeV2();
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [hoveredCode, setHoveredCode] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // ── Position the portal-rendered dropdown ────────────────────────────
  const [pos, setPos] = useState({ top: 0, left: 0 });

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setPos({
      top: rect.bottom + 8,
      left: Math.max(8, rect.right - 280), // right-aligned, 280px wide
    });
  }, []);

  // Recalculate on open + scroll/resize
  useEffect(() => {
    if (!isOpen) return;
    updatePosition();
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [isOpen, updatePosition]);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        panelRef.current && !panelRef.current.contains(target) &&
        triggerRef.current && !triggerRef.current.contains(target)
      ) {
        setIsOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    setTimeout(() => searchRef.current?.focus(), 80);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setIsOpen(false); setSearch(''); }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen]);

  const currentLang = LANGUAGE_MAP.get(selectedLanguage);

  const filtered = search.trim()
    ? SUPPORTED_LANGUAGES.filter(l =>
        l.name.toLowerCase().includes(search.toLowerCase()) ||
        l.nativeName.toLowerCase().includes(search.toLowerCase()) ||
        l.code.toLowerCase().includes(search.toLowerCase())
      )
    : SUPPORTED_LANGUAGES;

  const handleSelect = useCallback((code: string) => {
    setLanguage(code);
    setIsOpen(false);
    setSearch('');
  }, [setLanguage]);

  // ── Inject keyframe animation ────────────────────────────────────────
  useEffect(() => {
    const id = 'lang-selector-keyframes';
    if (document.getElementById(id)) return;
    const style = document.createElement('style');
    style.id = id;
    style.textContent = `
      @keyframes langPanelSlideIn {
        from { opacity: 0; transform: translateY(-8px) scale(0.96); }
        to   { opacity: 1; transform: translateY(0) scale(1); }
      }
    `;
    document.head.appendChild(style);
  }, []);

  // ── Dropdown panel (rendered via portal at document.body) ────────────
  const dropdown = isOpen ? ReactDOM.createPortal(
    <div
      ref={panelRef}
      style={{
        position: 'fixed',
        top: `${pos.top}px`,
        left: `${pos.left}px`,
        width: '280px',
        maxHeight: '380px',
        backgroundColor: theme.backgroundColor,
        borderRadius: '16px',
        boxShadow: '0 12px 40px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.08)',
        zIndex: 1000000,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        animation: 'langPanelSlideIn 200ms ease-out forwards',
        border: '1px solid rgba(0,0,0,0.08)',
        fontFamily: theme.fontFamily,
      }}
    >
      {/* ── Header with Search ────────────────────────────────────── */}
      <div style={{
        padding: '12px 14px 10px',
        borderBottom: '1px solid rgba(0,0,0,0.06)',
        background: `linear-gradient(135deg, ${theme.primaryColor}08, ${theme.primaryColor}04)`,
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '10px',
        }}>
          <span style={{
            fontSize: '13px',
            fontWeight: 700,
            color: theme.textColor,
            fontFamily: theme.fontFamily,
            letterSpacing: '-0.01em',
          }}>
            Choose Language
          </span>
          <button
            onClick={() => { setIsOpen(false); setSearch(''); }}
            style={{
              background: 'rgba(0,0,0,0.05)',
              border: 'none',
              cursor: 'pointer',
              padding: '4px',
              borderRadius: '6px',
              color: theme.textColorMuted,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background 150ms',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(0,0,0,0.1)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(0,0,0,0.05)'; }}
          >
            <XIcon />
          </button>
        </div>

        {/* Search bar */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '8px 10px',
          borderRadius: '10px',
          background: theme.surfaceColor,
          border: '1px solid rgba(0,0,0,0.06)',
        }}>
          <span style={{ color: theme.textColorMuted, display: 'flex', flexShrink: 0 }}>
            <SearchIcon />
          </span>
          <input
            ref={searchRef}
            type="text"
            placeholder="Search languages..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              border: 'none',
              outline: 'none',
              background: 'transparent',
              width: '100%',
              fontSize: '12px',
              fontFamily: theme.fontFamily,
              color: theme.textColor,
            }}
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: theme.textColorMuted,
                padding: 0,
                display: 'flex',
                flexShrink: 0,
              }}
            >
              <XIcon />
            </button>
          )}
        </div>
      </div>

      {/* ── Language List ─────────────────────────────────────────── */}
      <div style={{
        overflowY: 'auto',
        flex: 1,
        padding: '6px',
      }}>
        {filtered.length === 0 ? (
          <div style={{
            padding: '24px 12px',
            textAlign: 'center',
            color: theme.textColorMuted,
            fontSize: '12px',
            fontFamily: theme.fontFamily,
          }}>
            No languages match &ldquo;{search}&rdquo;
          </div>
        ) : (
          filtered.map((lang) => {
            const isSelected = lang.code === selectedLanguage;
            const isHovered = hoveredCode === lang.code;
            return (
              <button
                key={lang.code}
                onClick={() => handleSelect(lang.code)}
                onMouseEnter={() => setHoveredCode(lang.code)}
                onMouseLeave={() => setHoveredCode(null)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  width: '100%',
                  padding: '9px 10px',
                  border: 'none',
                  borderRadius: '10px',
                  background: isSelected
                    ? `${theme.primaryColor}18`
                    : isHovered
                    ? 'rgba(0,0,0,0.04)'
                    : 'transparent',
                  color: isSelected ? theme.primaryColor : theme.textColor,
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontFamily: theme.fontFamily,
                  textAlign: 'left',
                  transition: 'all 150ms ease',
                  boxSizing: 'border-box',
                }}
              >
                {/* Flag image from CDN */}
                <FlagImg countryCode={lang.countryCode} size={22} />

                {/* Name + native name */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontWeight: isSelected ? 600 : 500,
                    fontSize: '13px',
                    lineHeight: 1.3,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {lang.name}
                  </div>
                  <div style={{
                    fontSize: '11px',
                    color: theme.textColorMuted,
                    lineHeight: 1.3,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {lang.nativeName}
                  </div>
                </div>

                {/* Selected check */}
                {isSelected && (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={theme.primaryColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </button>
            );
          })
        )}
      </div>

      {/* ── Footer ───────────────────────────────────────────────── */}
      <div style={{
        padding: '8px 14px',
        borderTop: '1px solid rgba(0,0,0,0.06)',
        background: 'rgba(0,0,0,0.015)',
      }}>
        <div style={{
          fontSize: '10px',
          color: theme.textColorMuted,
          fontFamily: theme.fontFamily,
          textAlign: 'center',
          opacity: 0.7,
        }}>
          {SUPPORTED_LANGUAGES.length} languages supported
        </div>
      </div>
    </div>,
    document.body
  ) : null;

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <>
      {/* ── Trigger: Flag pill ──────────────────────────────────────── */}
      <button
        ref={triggerRef}
        onClick={() => setIsOpen(!isOpen)}
        title={currentLang ? `${currentLang.name} — Change language` : 'Change language'}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '5px',
          padding: '5px 10px',
          border: 'none',
          borderRadius: '20px',
          background: 'rgba(255,255,255,0.18)',
          backdropFilter: 'blur(8px)',
          color: theme.textColorInverse,
          cursor: 'pointer',
          fontSize: '15px',
          fontFamily: theme.fontFamily,
          transition: `all ${theme.transitionDuration} ${theme.transitionEasing}`,
          lineHeight: 1,
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.3)';
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.18)';
        }}
      >
        {currentLang && (
          <FlagImg
            countryCode={currentLang.countryCode}
            size={16}
            style={{ borderRadius: '2px' }}
          />
        )}
        <span style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.05em', opacity: 0.85 }}>
          {(currentLang?.code || 'en').toUpperCase()}
        </span>
      </button>

      {/* Portal-rendered dropdown */}
      {dropdown}
    </>
  );
}
