/**
 * @platform/knowledge-base
 * 
 * Multi-tenant Knowledge Base Extension
 * 
 * This extension provides:
 * 1. Types for KB configuration and documents
 * 2. Backend client for ElevenLabs Knowledge Base API
 * 3. HTTP handlers that can be mounted in any framework (Express, Next.js, etc.)
 * 4. Optional React components for admin UI
 * 
 * Usage:
 * ```typescript
 * import { createKnowledgeBaseClient, createKBHandlers } from '@platform/knowledge-base';
 * 
 * // Create client with tenant config
 * const kb = createKnowledgeBaseClient({
 *   apiKey: process.env.ELEVENLABS_API_KEY,
 *   agentId: process.env.ELEVENLABS_AGENT_ID,
 * });
 * 
 * // Get handlers for your framework
 * const handlers = createKBHandlers(kb);
 * 
 * // Mount in Express
 * app.get('/api/kb/documents', handlers.listDocuments);
 * app.post('/api/kb/documents', handlers.uploadDocument);
 * app.delete('/api/kb/documents/:id', handlers.deleteDocument);
 * ```
 */

// Types
export * from './types.js';

// Client
export { createKnowledgeBaseClient, type KnowledgeBaseClient } from './client.js';

// Handlers
export { createKBHandlers, type KBHandlers } from './handlers.js';

// Extension (for platform core integration)
export { createKnowledgeBaseExtension } from './kb-extension.js';
