/**
 * Chat V2 Default Configuration
 * 
 * ISOLATED from ../chat/config.ts
 */

import type { ChatConfigV2, ChatThemeV2 } from './types';

export const defaultConfigV2: ChatConfigV2 = {
  agentId: '',
  signedUrlEndpoint: '/api/elevenlabs/signed-url',
  
  // Text-only by default (cost optimized)
  textOnly: true,

  // End session after 3 minutes of no user interaction
  inactivityTimeoutMs: 3 * 60 * 1000,

  // Graceful close messages — warning at 70%, farewell at 100%
  inactivityWarningMessage: 'Are you still there? This chat will end soon due to inactivity.',
  inactivityFarewellMessage: 'Thanks for chatting! This session has ended. Feel free to start a new conversation anytime.',
  
  // UI
  position: 'bottom-right',
  autoOpen: false,
  defaultOpen: false,
  
  // Content
  title: 'AI Assistant',
  subtitle: 'How can I help you?',
  placeholderText: 'Type your message...',
  
  // Branding
  showPoweredBy: true,
  poweredByText: 'Powered by Ruskins AI',
  poweredByLink: 'https://ruskinsconsulting.com',

  // Client tools — empty by default, built-in tools are always available
  clientTools: {},
  allowExternalNavigation: false,
};

// =============================================================================
// PRESET THEMES
// =============================================================================

const baseTheme: ChatThemeV2 = {
  // Colors
  primaryColor: '#6366f1',
  primaryColorHover: '#4f46e5',
  secondaryColor: '#8b5cf6',
  
  // Backgrounds
  backgroundColor: '#ffffff',
  surfaceColor: '#f3f4f6',
  
  // Text
  textColor: '#1f2937',
  textColorMuted: '#6b7280',
  textColorInverse: '#ffffff',
  
  // Messages
  userMessageBg: '#6366f1',
  userMessageText: '#ffffff',
  assistantMessageBg: '#f3f4f6',
  assistantMessageText: '#1f2937',
  
  // Borders
  borderRadius: '0.375rem',
  borderRadiusLarge: '0.75rem',
  shadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
  shadowLarge: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
  
  // Typography
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  fontSizeBase: '0.875rem',
  fontSizeSmall: '0.75rem',
  fontSizeLarge: '1rem',
  
  // Spacing
  spacingXs: '0.25rem',
  spacingSm: '0.5rem',
  spacingMd: '1rem',
  spacingLg: '1.5rem',
  spacingXl: '2rem',
  
  // Widget
  widgetWidth: '384px',
  widgetHeight: '600px',
  widgetButtonSize: '56px',
  
  // Animation
  transitionDuration: '150ms',
  transitionEasing: 'cubic-bezier(0.4, 0, 0.2, 1)',
};

const darkTheme: ChatThemeV2 = {
  ...baseTheme,
  backgroundColor: '#1f2937',
  surfaceColor: '#374151',
  textColor: '#f3f4f6',
  textColorMuted: '#9ca3af',
  assistantMessageBg: '#374151',
  assistantMessageText: '#f3f4f6',
};

const ruskinsTheme: ChatThemeV2 = {
  ...baseTheme,
  primaryColor: '#BB0000',
  primaryColorHover: '#990000',
  userMessageBg: '#BB0000',
};

const kenyaTheme: ChatThemeV2 = {
  ...baseTheme,
  primaryColor: '#00A651',
  primaryColorHover: '#008040',
  secondaryColor: '#FFD700',
  userMessageBg: '#00A651',
};

const minimalTheme: ChatThemeV2 = {
  ...baseTheme,
  borderRadius: '0px',
  borderRadiusLarge: '0px',
  shadow: 'none',
  shadowLarge: '0 0 1px rgba(0, 0, 0, 0.1)',
};

export function getPresetThemeV2(preset: string): ChatThemeV2 {
  switch (preset) {
    case 'dark':
      return darkTheme;
    case 'ruskins':
      return ruskinsTheme;
    case 'kenya':
      return kenyaTheme;
    case 'minimal':
      return minimalTheme;
    default:
      return baseTheme;
  }
}

export function createThemeV2(overrides: Partial<ChatThemeV2>): ChatThemeV2 {
  return {
    ...baseTheme,
    ...overrides,
  };
}

export function validateConfigV2(config: ChatConfigV2): string[] {
  const warnings: string[] = [];
  
  if (!config.agentId) {
    warnings.push('agentId is required - set your ElevenLabs Agent ID');
  }
  
  return warnings;
}
