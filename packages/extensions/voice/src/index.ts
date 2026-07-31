/**
 * Voice Extension
 * 
 * A tenant-aware voice/conversational AI extension for chatbots.
 * Designed for multi-tenant SaaS where each client has their own:
 * - ElevenLabs account
 * - Database
 * - Knowledge base
 * 
 * PUBLIC API:
 * - Extension factory: createVoiceExtension()
 * - Types: TenantVoiceConfig, VoiceSession, VoiceBackend, etc.
 * 
 * USAGE:
 * ```ts
 * import { createVoiceExtension } from '@platform/voice-extension'
 * 
 * const extension = createVoiceExtension({
 *   backend: 'elevenlabs',
 *   credentialProvider: myCredentialProvider,
 * })
 * 
 * // Register with chatbot engine
 * extensions.register(extension)
 * ```
 */

export * from './voice-extension.js'
export * from './types.js'
export { MockVoiceBackend } from './backend/mock-backend.js'
export { ElevenLabsVoiceBackend } from './backend/elevenlabs-backend.js'
export { EnvCredentialProvider } from './backend/env-credential-provider.js'
export { ElevenLabsTextSession, TextConversationManager } from './backend/elevenlabs-text-client.js'
export type { VoiceBackend, VoiceCredentialProvider } from './types.js'
// v3.1.0 — Event System
export * from './events.js'