/**
 * Bonga Nami Chat Widget - React App Entry
 *
 * This is the React application that powers the embeddable chat widget.
 * It uses Chat V2 components backed by the @elevenlabs/react SDK.
 *
 * DEPLOYMENT OPTIONS:
 * 1. Embedded via <script> tag (builds to widget.bundle.js)
 * 2. Full-page experience (builds to chatbot app)
 * 3. React component (import directly)
 */

import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ChatProviderV2,
  ChatWidgetV2,
  createThemeV2,
  type ChatConfigV2,
  type ChatThemeV2
} from '../chat-v2';

// =============================================================================
// CONFIGURATION LOADER
// =============================================================================

interface PlatformConfig {
  elevenLabs: {
    agentId: string;
  };
  conversationMode: 'text_only' | 'voice_only' | 'voice_and_text';
  conversationFlow?: {
    greeting?: string;
    firstMessageMode?: string;
    waitForUserFirst?: boolean;
    inactivityTimeout?: number; // seconds — set in Admin Console
  };
  widget: {
    primaryColor?: string;
    title?: string;
    subtitle?: string;
    position?: 'bottom-right' | 'bottom-left';
    poweredByText?: string;
    poweredByLink?: string;
    showPoweredBy?: boolean;
  };
  branding: {
    companyName?: string;
    logoUrl?: string;
  };
}

// Get platform URL from embed loader (or use current origin for standalone)
function getPlatformUrl(): string {
  if (typeof window !== 'undefined' && (window as any).__BONGA_NAMI_PLATFORM_URL__) {
    return (window as any).__BONGA_NAMI_PLATFORM_URL__;
  }
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }
  return '';
}

// Get user-provided config overrides from embed code
function getUserConfig(): Record<string, any> {
  if (typeof window !== 'undefined' && (window as any).__BONGA_NAMI_USER_CONFIG__) {
    return (window as any).__BONGA_NAMI_USER_CONFIG__;
  }
  if (typeof window !== 'undefined' && (window as any).BONGA_NAMI_CONFIG) {
    return (window as any).BONGA_NAMI_CONFIG;
  }
  return {};
}

async function loadPlatformConfig(): Promise<PlatformConfig | null> {
  const platformUrl = getPlatformUrl();
  const userConfig = getUserConfig();
  
  try {
    const response = await fetch(`${platformUrl}/api/config/public`, {
      headers: {
        'Accept': 'application/json',
      },
      // Include credentials for same-origin, omit for cross-origin
      credentials: 'omit',
    });
    
    if (response.status === 403) {
      console.error('[Widget] Origin not allowed. Configure allowed domains in Admin Console.');
      return null;
    }
    
    if (response.status === 429) {
      console.error('[Widget] Rate limit exceeded. Please try again later.');
      return null;
    }
    
    if (!response.ok) {
      console.error('[Widget] Failed to load config:', response.status);
      return null;
    }
    
    const serverConfig = await response.json();

    // Warn if embed code tries to override conversation mode (now Admin Console only)
    if (userConfig.mode) {
      console.warn('[Widget] BONGA_NAMI_CONFIG.mode is deprecated — conversation mode is now controlled via Admin Console. Ignoring embed override.');
    }

    // Merge user config overrides (from embed code) with server config
    // Only presentational settings (color, position, title) can be overridden via embed code
    // Functional settings like conversationMode are authoritative from server/Admin Console
    return {
      ...serverConfig,
      widget: {
        ...serverConfig.widget,
        primaryColor: userConfig.primaryColor || serverConfig.widget?.primaryColor,
        position: userConfig.position || serverConfig.widget?.position,
        title: userConfig.title || serverConfig.widget?.title,
      },
      conversationMode: serverConfig.conversationMode,
    };
  } catch (error) {
    console.error('[Widget] Error loading config:', error);
    return null;
  }
}

// =============================================================================
// WIDGET APP
// =============================================================================

function WidgetApp() {
  const [config, setConfig] = useState<PlatformConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadPlatformConfig()
      .then((cfg) => {
        if (cfg) {
          setConfig(cfg);
        } else {
          setError('Failed to load configuration');
        }
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <LoadingIndicator />;
  }

  if (error || !config) {
    return <ErrorState message={error || 'Configuration not available'} />;
  }

  if (!config.elevenLabs.agentId) {
    return <ErrorState message="ElevenLabs Agent ID not configured" />;
  }

  // Build theme from platform config
  const theme: Partial<ChatThemeV2> = config.widget.primaryColor
    ? {
        primaryColor: config.widget.primaryColor,
        primaryColorHover: adjustColor(config.widget.primaryColor, -20),
        userMessageBg: config.widget.primaryColor,
      }
    : {};

  // Build chat config from platform config
  const platformUrl = getPlatformUrl();
  const chatConfig: Partial<Omit<ChatConfigV2, 'agentId'>> = {
    textOnly: config.conversationMode === 'text_only',
    greeting: config.conversationFlow?.greeting || undefined,
    // Convert seconds (from Admin Console) to milliseconds for the provider
    inactivityTimeoutMs: (config.conversationFlow?.inactivityTimeout ?? 180) * 1000,
    title: config.widget.title || config.branding.companyName || 'AI Assistant',
    subtitle: config.widget.subtitle || 'How can I help you today?',
    position: config.widget.position || 'bottom-right',
    poweredByText: config.widget.poweredByText || 'Bonga Nami',
    poweredByLink: config.widget.poweredByLink ?? '',
    showPoweredBy: config.widget.showPoweredBy !== false,
    signedUrlEndpoint: `${platformUrl}/api/elevenlabs/signed-url`,
    clientTools: getUserConfig().clientTools || undefined,
  };

  return (
    <ChatProviderV2
      agentId={config.elevenLabs.agentId}
      config={chatConfig}
      theme={createThemeV2(theme)}
    >
      <ChatWidgetV2 />
    </ChatProviderV2>
  );
}

// =============================================================================
// HELPER COMPONENTS
// =============================================================================

function LoadingIndicator() {
  return (
    <div style={{
      position: 'fixed',
      bottom: '1.5rem',
      right: '1.5rem',
      width: '60px',
      height: '60px',
      borderRadius: '50%',
      backgroundColor: '#6366f1',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
    }}>
      <div style={{
        width: '20px',
        height: '20px',
        border: '2px solid rgba(255,255,255,0.3)',
        borderTopColor: '#fff',
        borderRadius: '50%',
        animation: 'spin 1s linear infinite',
      }} />
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div style={{
      position: 'fixed',
      bottom: '1.5rem',
      right: '1.5rem',
      padding: '1rem',
      backgroundColor: '#fef2f2',
      border: '1px solid #fecaca',
      borderRadius: '0.5rem',
      color: '#dc2626',
      fontSize: '0.875rem',
      maxWidth: '300px',
      boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
    }}>
      <strong>Widget Error</strong>
      <p style={{ margin: '0.5rem 0 0' }}>{message}</p>
    </div>
  );
}

// =============================================================================
// UTILITIES
// =============================================================================

/**
 * Adjust color brightness
 */
function adjustColor(hex: string, amount: number): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, Math.max(0, (num >> 16) + amount));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0x00FF) + amount));
  const b = Math.min(255, Math.max(0, (num & 0x0000FF) + amount));
  return `#${(1 << 24 | r << 16 | g << 8 | b).toString(16).slice(1)}`;
}

// =============================================================================
// MOUNT
// =============================================================================

// Auto-mount if running as standalone
if (typeof window !== 'undefined') {
  const mountPoint = document.getElementById('bonga-nami-chat-widget');
  if (mountPoint) {
    const root = createRoot(mountPoint);
    root.render(<WidgetApp />);
  }
}

// Export for programmatic use
export { WidgetApp };
export default WidgetApp;
