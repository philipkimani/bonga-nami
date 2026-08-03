/**
 * Bonga Nami Chat Widget - Embed Loader
 * 
 * This lightweight loader script:
 * 1. Creates the widget mount point
 * 2. Loads the widget bundle
 * 3. Passes configuration from window.BONGA_NAMI_CONFIG
 * 
 * SECURITY:
 * - Origin validated on server via /api/config/public
 * - Signed URLs for ElevenLabs connection
 * - Rate limiting on all public endpoints
 * 
 * Usage:
 * <script>
 *   window.BONGA_NAMI_CONFIG = {
 *     agentId: "agent_xxx",  // Optional - fetched from server if omitted
 *     primaryColor: "#6366f1",
 *     position: "bottom-right"
 *   };
 *   // Note: conversation mode (text_only, voice_and_text, voice_only)
 *   // is controlled via Admin Console, not embed config.
 * </script>
 * <script src="https://your-platform.railway.app/widget/embed.js" async></script>
 */

(function() {
  'use strict';

  // Prevent double initialization
  if (window.__BONGA_NAMI_WIDGET_LOADED__) {
    console.warn('[Bonga Nami Widget] Already loaded, skipping duplicate initialization');
    return;
  }
  window.__BONGA_NAMI_WIDGET_LOADED__ = true;

  // Get the script's origin (platform URL)
  var scripts = document.getElementsByTagName('script');
  var currentScript = scripts[scripts.length - 1];
  var platformUrl = '';
  
  // Extract base URL from script src
  if (currentScript && currentScript.src) {
    try {
      var url = new URL(currentScript.src);
      platformUrl = url.origin;
    } catch (e) {
      console.error('[Bonga Nami Widget] Failed to parse script URL:', e);
      return;
    }
  }

  if (!platformUrl) {
    console.error('[Bonga Nami Widget] Could not determine platform URL');
    return;
  }

  // Get user config (or empty object)
  var userConfig = window.BONGA_NAMI_CONFIG || {};

  // Create mount point
  var mountPoint = document.createElement('div');
  mountPoint.id = 'bonga-nami-chat-widget';
  mountPoint.style.cssText = 'position: fixed; z-index: 999999;';
  document.body.appendChild(mountPoint);

  // Store config globally for widget bundle to access
  window.__BONGA_NAMI_PLATFORM_URL__ = platformUrl;
  window.__BONGA_NAMI_USER_CONFIG__ = userConfig;

  // Load the widget bundle
  var bundleScript = document.createElement('script');
  bundleScript.src = platformUrl + '/widget/widget.bundle.iife.js';
  bundleScript.async = true;
  bundleScript.onerror = function() {
    console.error('[Bonga Nami Widget] Failed to load widget bundle');
    mountPoint.innerHTML = '<div style="position: fixed; bottom: 1.5rem; right: 1.5rem; padding: 1rem; background: #fef2f2; border: 1px solid #fecaca; border-radius: 0.5rem; color: #dc2626; font-size: 0.875rem; max-width: 300px; box-shadow: 0 4px 20px rgba(0,0,0,0.1);"><strong>Widget Error</strong><p style="margin: 0.5rem 0 0;">Failed to load chat widget</p></div>';
  };
  document.body.appendChild(bundleScript);

  // Log initialization (dev mode only)
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    console.log('[Bonga Nami Widget] Initializing...', {
      platformUrl: platformUrl,
      userConfig: userConfig
    });
  }
})();
