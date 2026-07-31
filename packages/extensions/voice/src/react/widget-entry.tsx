/**
 * Widget Entry Point for Bundling
 * 
 * This file is the entry point for building a standalone widget bundle.
 * It auto-renders the VoiceChatWidget when the script loads.
 * 
 * USAGE (in any HTML page):
 * ```html
 * <div id="voice-widget-root"></div>
 * <script src="https://your-domain.com/widget/voice-widget.js"></script>
 * <script>
 *   VoiceWidget.init({
 *     container: '#voice-widget-root',
 *     voiceApiEndpoint: '/api/voice',
 *     primaryColor: '#BB0000',
 *     title: 'AI Assistant',
 *   });
 * </script>
 * ```
 */

import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { VoiceChatWidget, VoiceChatWidgetProps } from './VoiceChatWidget.js';

// Store root for cleanup
let widgetRoot: Root | null = null;

export interface VoiceWidgetConfig extends VoiceChatWidgetProps {
  /** CSS selector or HTMLElement for container */
  container?: string | HTMLElement;
}

/**
 * Initialize the Voice Widget
 */
export function init(config: VoiceWidgetConfig = {}) {
  const { container = '#voice-widget-root', ...widgetProps } = config;
  
  // Find or create container
  let containerEl: HTMLElement | null = null;
  
  if (typeof container === 'string') {
    containerEl = document.querySelector(container);
  } else if (container instanceof HTMLElement) {
    containerEl = container;
  }
  
  // If no container found, create one in body
  if (!containerEl) {
    containerEl = document.createElement('div');
    containerEl.id = 'voice-widget-root';
    document.body.appendChild(containerEl);
  }
  
  // Unmount previous instance if exists
  if (widgetRoot) {
    widgetRoot.unmount();
  }
  
  // Render widget
  widgetRoot = createRoot(containerEl);
  widgetRoot.render(
    <React.StrictMode>
      <VoiceChatWidget {...widgetProps} />
    </React.StrictMode>
  );
  
  console.log('[VoiceWidget] Initialized with config:', widgetProps);
  
  return {
    unmount: () => {
      if (widgetRoot) {
        widgetRoot.unmount();
        widgetRoot = null;
      }
    },
  };
}

/**
 * Auto-initialize if data attributes are present
 */
function autoInit() {
  const autoContainer = document.querySelector('[data-voice-widget]');
  
  if (autoContainer) {
    const config: VoiceWidgetConfig = {
      container: autoContainer as HTMLElement,
      voiceApiEndpoint: autoContainer.getAttribute('data-api-endpoint') || '/api/voice',
      toolsApiEndpoint: autoContainer.getAttribute('data-tools-endpoint') || '/api/tools',
      primaryColor: autoContainer.getAttribute('data-primary-color') || '#BB0000',
      title: autoContainer.getAttribute('data-title') || 'AI Assistant',
      subtitle: autoContainer.getAttribute('data-subtitle') || 'Voice & Text Assistant',
      defaultOpen: autoContainer.getAttribute('data-default-open') !== 'false',
      autoStartVoice: autoContainer.getAttribute('data-auto-start-voice') !== 'false',
      forceTextOnly: autoContainer.getAttribute('data-force-text-only') === 'true',
    };
    
    init(config);
  }
}

// Auto-init when DOM is ready
if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoInit);
  } else {
    autoInit();
  }
}

// Export for UMD/global access
if (typeof window !== 'undefined') {
  (window as any).VoiceWidget = { init };
}

export { VoiceChatWidget, type VoiceChatWidgetProps };
