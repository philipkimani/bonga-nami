/**
 * Chat V2 Type Definitions (SDK-based)
 * 
 * These types are ISOLATED from the old chat/ implementation.
 * V2 uses @elevenlabs/react SDK which handles protocol complexity.
 * 
 * CRITICAL: Do NOT import from ../chat/types.ts
 */

import type { ReactNode } from 'react';

// =============================================================================
// UI STATE (simplified from v1)
// =============================================================================

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  /** Message display type — defaults to 'text' if omitted */
  type?: 'text' | 'card';
  /** Rich card data (only present when type === 'card') */
  cardData?: CardData;
}

// =============================================================================
// CLIENT TOOLS — Rich content types
// =============================================================================

/** Data for a rich content card rendered inline in the message stream */
export interface CardData {
  title?: string;
  description?: string;
  imageUrl?: string;
  /** Displayed as a link in the card; opens in new tab when clicked */
  url?: string;
  /** Optional CTA buttons — each opens its URL in a new tab */
  buttons?: CardButton[];
}

export interface CardButton {
  label: string;
  url: string;
}

/** Data for a toast notification shown at the top of the chat window */
export interface ToastData {
  id: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  /** Auto-dismiss duration in ms (default: 5000) */
  duration: number;
}

/** Client tool handler function signature (matches ElevenLabs SDK) */
export type ClientToolHandler = (parameters: any) => Promise<string | number | void> | string | number | void;

/** Map of client tool name → handler */
export type ClientToolMap = Record<string, ClientToolHandler>;

export interface ChatState {
  isOpen: boolean;
  messages: Message[];
  isSpeaking: boolean;
  isThinking: boolean;
  canSendFeedback: boolean;
  isListening: boolean;
  connectionError: string | null;
  voiceCallActive: boolean;
  selectedLanguage: string;
  /** Active toast notifications */
  toasts: ToastData[];
}

export interface ChatActions {
  openWidget: () => void;
  closeWidget: () => void;
  toggleWidget: () => void;
  clearMessages: () => void;
  startVoiceCall: () => Promise<void>;
  endVoiceCall: () => Promise<void>;
  setLanguage: (lang: string) => void;
  /** Dismiss a toast notification by id */
  dismissToast: (id: string) => void;
}

// =============================================================================
// CONVERSATION (exposed from the single useConversation() instance in provider)
// =============================================================================

export type ConversationStatus = 'connecting' | 'connected' | 'disconnecting' | 'disconnected';

export interface ConversationMethods {
  sendUserMessage: (text: string) => void;
  sendUserActivity: () => void;
  sendFeedback: (like: boolean) => void;
  endSession: () => Promise<void>;
  status: ConversationStatus;
  isSpeaking: boolean;
  canSendFeedback: boolean;

  // Voice / microphone
  micMuted: boolean;
  toggleMic: () => void;
  getInputVolume: () => number;
  getOutputVolume: () => number;
}

// =============================================================================
// CONFIGURATION (simplified from v1)
// =============================================================================

export interface ChatConfigV2 {
  // ElevenLabs agent
  agentId: string;
  signedUrlEndpoint?: string;
  
  // Mode: text-only or voice capable
  textOnly: boolean;

  // Agent greeting (passed as overrides.agent.firstMessage to SDK)
  greeting?: string;

  // Inactivity timeout — end session after N ms of no user interaction (0 = disabled)
  inactivityTimeoutMs: number;

  // Graceful close — show a warning before ending the session
  // Warning appears at 70% of inactivityTimeoutMs (e.g. 2m6s for a 3m timeout)
  inactivityWarningMessage?: string;
  // Farewell message shown when session ends after warning goes unanswered
  inactivityFarewellMessage?: string;

  // Default language (ISO code, e.g. 'en'). User can change via language selector.
  defaultLanguage?: string;

  // Show language selector in the chat header
  showLanguageSelector?: boolean;

  // UI behavior
  position: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
  autoOpen: boolean;
  defaultOpen?: boolean;
  
  // Content
  title: string;
  subtitle: string;
  placeholderText: string;
  
  // Branding
  showPoweredBy: boolean;
  poweredByText: string;
  poweredByLink: string;

  // Client tools — additional tool handlers merged with built-in tools
  clientTools?: ClientToolMap;

  // Security: allow navigateToPage to navigate to external (cross-origin) URLs
  // Default: false (only same-origin navigation allowed)
  allowExternalNavigation?: boolean;
  
  // Callbacks
  onOpen?: () => void;
  onClose?: () => void;
  onMessage?: (message: Message) => void;
  onError?: (error: Error) => void;
  onFeedback?: (feedback: boolean) => void;
}

// =============================================================================
// THEME (reusable from v1)
// =============================================================================

export interface ChatThemeV2 {
  // Brand colors
  primaryColor: string;
  primaryColorHover: string;
  secondaryColor: string;
  
  // Background colors
  backgroundColor: string;
  surfaceColor: string;
  
  // Text colors
  textColor: string;
  textColorMuted: string;
  textColorInverse: string;
  
  // Message bubbles
  userMessageBg: string;
  userMessageText: string;
  assistantMessageBg: string;
  assistantMessageText: string;
  
  // Borders and shadows
  borderRadius: string;
  borderRadiusLarge: string;
  shadow: string;
  shadowLarge: string;
  
  // Typography
  fontFamily: string;
  fontSizeBase: string;
  fontSizeSmall: string;
  fontSizeLarge: string;
  
  // Spacing
  spacingXs: string;
  spacingSm: string;
  spacingMd: string;
  spacingLg: string;
  spacingXl: string;
  
  // Widget dimensions
  widgetWidth: string;
  widgetHeight: string;
  widgetButtonSize: string;
  
  // Animation
  transitionDuration: string;
  transitionEasing: string;
}

// =============================================================================
// PROVIDER PROPS
// =============================================================================

export interface ChatProviderV2Props {
  children: ReactNode;
  agentId: string;
  config?: Partial<Omit<ChatConfigV2, 'agentId'>>;
  theme?: 'default' | 'dark' | 'brand' | 'kenya' | 'minimal' | Partial<ChatThemeV2>;
}

// =============================================================================
// CONTEXT VALUE
// =============================================================================

export interface ChatContextV2Value {
  config: ChatConfigV2;
  theme: ChatThemeV2;
  state: ChatState;
  actions: ChatActions;
  conversation: ConversationMethods;
}
