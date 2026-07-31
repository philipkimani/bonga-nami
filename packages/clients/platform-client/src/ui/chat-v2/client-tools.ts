/**
 * Built-in Client Tools for Chat V2 Widget
 *
 * These tools are registered automatically with the ElevenLabs SDK.
 * Clients create matching tool definitions in their ElevenLabs dashboard;
 * the widget handles execution on the client side.
 *
 * Built-in tools:
 *   - navigateToPage  → Same-page navigation (widget as site concierge)
 *   - showNotification → Toast notification in the widget
 *   - displayContent   → Rich card rendered in the message stream
 *
 * Clients can also pass additional custom tools via config.clientTools;
 * those are merged with (and can override) these built-ins.
 */

import type { CardData, ToastData, ClientToolMap } from './types';

// =============================================================================
// URL VALIDATION
// =============================================================================

/**
 * Check whether a URL string is safe for navigation / display.
 * Blocks javascript:, data:, vbscript: etc. Only allows http(s) and relative paths.
 */
function isSafeUrl(url: string): boolean {
  const trimmed = url.trim();
  // Allow relative paths (start with / or alphanumeric)
  if (trimmed.startsWith('/') || /^[a-zA-Z0-9]/.test(trimmed)) {
    // Block protocol injection hidden in relative-looking strings
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed) && !trimmed.startsWith('http')) {
      return false;
    }
    return true;
  }
  // Allow explicit http/https
  if (/^https?:\/\//i.test(trimmed)) return true;
  return false;
}

/**
 * Check whether a URL is same-origin relative to the current page.
 */
function isSameOrigin(url: string): boolean {
  // Relative paths are always same-origin
  if (url.startsWith('/') || !url.includes('://')) return true;
  try {
    const parsed = new URL(url, window.location.origin);
    return parsed.origin === window.location.origin;
  } catch {
    return false;
  }
}

/**
 * Validate image URLs: must be https:// (no data:, javascript:, blob:)
 */
function isSafeImageUrl(url: string): boolean {
  return /^https:\/\//i.test(url.trim());
}

// =============================================================================
// CALLBACKS INTERFACE — provided by the provider
// =============================================================================

export interface ClientToolCallbacks {
  /** Add a card message to the chat */
  addCardMessage: (card: CardData) => void;
  /** Show a toast notification */
  showToast: (toast: Omit<ToastData, 'id'>) => void;
  /** Whether cross-origin navigation is allowed */
  allowExternalNavigation: boolean;
}

// =============================================================================
// FACTORY — creates the built-in tool map
// =============================================================================

export function createBuiltinClientTools(callbacks: ClientToolCallbacks): ClientToolMap {
  return {
    /**
     * navigateToPage — Navigate the user to a URL on the same site.
     *
     * ElevenLabs tool config:
     *   Name: navigateToPage
     *   Parameters: { url: string (required) }
     *   Wait for response: true
     */
    navigateToPage: ({ url }: { url: string }) => {
      if (!url || typeof url !== 'string') {
        return 'Error: url parameter is required and must be a string.';
      }

      if (!isSafeUrl(url)) {
        console.warn('[ClientTools] Blocked unsafe URL:', url);
        return 'Error: URL is not allowed for security reasons.';
      }

      if (!callbacks.allowExternalNavigation && !isSameOrigin(url)) {
        console.warn('[ClientTools] Blocked cross-origin navigation:', url);
        return 'Error: External navigation is not allowed. Only same-site URLs are permitted.';
      }

      try {
        window.location.href = url;
        return `Navigating to ${url}`;
      } catch (err) {
        console.error('[ClientTools] Navigation failed:', err);
        return `Error: Navigation failed — ${err instanceof Error ? err.message : String(err)}`;
      }
    },

    /**
     * showNotification — Display a toast notification in the widget.
     *
     * ElevenLabs tool config:
     *   Name: showNotification
     *   Parameters:
     *     message: string (required) — The notification text
     *     type: string (optional) — "info" | "success" | "warning" | "error" (default: "info")
     *     duration: number (optional) — Auto-dismiss in ms (default: 5000)
     *   Wait for response: false
     */
    showNotification: ({ message, type, duration }: { message: string; type?: string; duration?: number }) => {
      if (!message || typeof message !== 'string') {
        return 'Error: message parameter is required.';
      }

      const validTypes = ['info', 'success', 'warning', 'error'] as const;
      const safeType = validTypes.includes(type as any) ? (type as ToastData['type']) : 'info';
      const safeDuration = typeof duration === 'number' && duration > 0 ? Math.min(duration, 30000) : 5000;

      callbacks.showToast({
        message: message.slice(0, 500), // Limit length
        type: safeType,
        duration: safeDuration,
      });

      return 'Notification displayed.';
    },

    /**
     * displayContent — Render a rich content card in the chat stream.
     *
     * ElevenLabs tool config:
     *   Name: displayContent
     *   Parameters:
     *     title: string (optional)
     *     description: string (optional)
     *     imageUrl: string (optional) — Must be https://
     *     url: string (optional) — Link shown in card, opens in new tab when clicked
     *     buttons: string (optional) — JSON array of {label, url} objects
     *   Wait for response: false
     */
    displayContent: (params: {
      title?: string;
      description?: string;
      imageUrl?: string;
      url?: string;
      buttons?: string | Array<{ label: string; url: string }>;
    }) => {
      const { title, description, imageUrl, url, buttons: rawButtons } = params;

      // Must have at least title or description
      if (!title && !description && !imageUrl) {
        return 'Error: At least one of title, description, or imageUrl is required.';
      }

      // Validate image URL
      let safeImageUrl: string | undefined;
      if (imageUrl) {
        if (isSafeImageUrl(imageUrl)) {
          safeImageUrl = imageUrl;
        } else {
          console.warn('[ClientTools] Blocked non-https image URL:', imageUrl);
        }
      }

      // Validate card URL
      let safeUrl: string | undefined;
      if (url && isSafeUrl(url)) {
        safeUrl = url;
      }

      // Parse buttons — ElevenLabs may send as JSON string
      let parsedButtons: Array<{ label: string; url: string }> | undefined;
      if (rawButtons) {
        try {
          const arr = typeof rawButtons === 'string' ? JSON.parse(rawButtons) : rawButtons;
          if (Array.isArray(arr)) {
            parsedButtons = arr
              .filter((b: any) => b && typeof b.label === 'string' && typeof b.url === 'string' && isSafeUrl(b.url))
              .slice(0, 5) // Max 5 buttons
              .map((b: any) => ({ label: b.label.slice(0, 50), url: b.url }));
          }
        } catch {
          console.warn('[ClientTools] Failed to parse buttons parameter');
        }
      }

      callbacks.addCardMessage({
        title: title?.slice(0, 200),
        description: description?.slice(0, 1000),
        imageUrl: safeImageUrl,
        url: safeUrl,
        buttons: parsedButtons,
      });

      return 'Content displayed in chat.';
    },
  };
}

// =============================================================================
// MERGE UTILITY — combines built-in tools with custom tools from config
// =============================================================================

/**
 * Merge built-in tools with custom tools from config.
 * Custom tools take precedence (can override built-in behavior).
 */
export function mergeClientTools(
  builtinTools: ClientToolMap,
  customTools?: ClientToolMap,
): ClientToolMap {
  if (!customTools || Object.keys(customTools).length === 0) {
    return builtinTools;
  }
  return { ...builtinTools, ...customTools };
}
