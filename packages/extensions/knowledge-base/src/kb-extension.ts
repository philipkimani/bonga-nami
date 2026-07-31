/**
 * Knowledge Base Extension
 * 
 * Integration with the platform core extension system.
 * This allows knowledge-base to be registered as a capability.
 */

import { createKnowledgeBaseClient, KnowledgeBaseClient } from './client.js';
import { createKBHandlers, KBHandlers } from './handlers.js';
import { KBConfig } from './types.js';

export interface KnowledgeBaseExtension {
  name: string;
  client: KnowledgeBaseClient;
  handlers: KBHandlers;
}

/**
 * Create a Knowledge Base extension instance
 * 
 * Usage:
 * ```typescript
 * // In your client configuration
 * import { createKnowledgeBaseExtension } from '@platform/knowledge-base';
 * 
 * const kbExtension = createKnowledgeBaseExtension({
 *   apiKey: process.env.ELEVENLABS_API_KEY!,
 *   agentId: process.env.ELEVENLABS_AGENT_ID,
 * });
 * 
 * // Mount handlers
 * app.use('/api/kb', kbExtension.handlers);
 * ```
 */
export function createKnowledgeBaseExtension(config: KBConfig): KnowledgeBaseExtension {
  const client = createKnowledgeBaseClient(config);
  const handlers = createKBHandlers(client);
  
  return {
    name: 'knowledge-base',
    client,
    handlers,
  };
}
