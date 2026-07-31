/**
 * Voice Extension - HTTP Handlers
 * 
 * Framework-agnostic HTTP handlers with adapters for:
 * - Next.js App Router
 * - Express
 * 
 * USAGE (Next.js):
 * ```ts
 * // app/api/voice/config/route.ts
 * import { createVoiceHandlers, getConfigFromEnv, nextjsAdapter } from '@platform/voice-extension/handlers';
 * 
 * const handlers = createVoiceHandlers(getConfigFromEnv());
 * export const GET = nextjsAdapter(handlers.getConfig);
 * ```
 * 
 * USAGE (Express):
 * ```ts
 * import { createVoiceHandlers, getConfigFromEnv, expressAdapter } from '@platform/voice-extension/handlers';
 * 
 * const handlers = createVoiceHandlers(getConfigFromEnv());
 * 
 * router.get('/config', expressAdapter(handlers.getConfig));
 * router.post('/session', expressAdapter(handlers.createSession));
 * router.delete('/session/:sessionId', expressAdapter(handlers.endSession));
 * ```
 */

export * from './types.js';
export * from './voice-handlers.js';
export * from './adapters.js';
