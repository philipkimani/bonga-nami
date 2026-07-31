/**
 * Chat V2 - ElevenLabs React SDK Implementation
 * 
 * CRITICAL ISOLATION NOTES:
 * - All imports from this directory ONLY
 * - Never import from ../chat/ (old implementation)
 * - Uses @elevenlabs/react for all protocol handling
 * - Simplified UI state management on top
 * 
 * USAGE:
 * ```tsx
 * import { ChatProviderV2, ChatWidgetV2 } from '@ui/chat-v2';
 * 
 * export function App() {
 *   return (
 *     <ChatProviderV2 agentId="your-agent-id" theme="ruskins">
 *       <ChatWidgetV2 />
 *     </ChatProviderV2>
 *   );
 * }
 * ```
 */

// Provider & Hooks
export { ChatProviderV2, useChatContextV2, useChatConfigV2, useChatThemeV2, useChatStateV2, useConversationV2 } from './provider';

// Components
export {
  ChatWidgetV2,
  ChatWindow,
  ChatHeader,
  ChatMessages,
  ChatInput,
  Message,
  TypingIndicator,
  ChatTrigger,
  Feedback,
  MicButton,
} from './components';

// Types
export type {
  ChatConfigV2,
  ChatThemeV2,
  ChatState,
  ChatActions,
  ChatContextV2Value,
  ChatProviderV2Props,
  ConversationMethods,
  ConversationStatus,
  Message as MessageType,
  CardData,
  CardButton,
  ToastData,
  ClientToolHandler,
  ClientToolMap,
} from './types';

// Config
export { 
  defaultConfigV2,
  getPresetThemeV2,
  createThemeV2,
  validateConfigV2,
} from './config';
