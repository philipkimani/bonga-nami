/**
 * Knowledge Base Client
 * 
 * Framework-agnostic client for ElevenLabs Knowledge Base API.
 * Can be used in any Node.js environment (Express, Next.js, Fastify, etc.)
 * 
 * 📚 ElevenLabs Documentation Reference:
 * - Agents Platform: https://elevenlabs.io/docs/agents-platform/
 * - Knowledge Base: https://elevenlabs.io/docs/agents-platform/build/knowledge-base
 * - Developer Quickstart: https://elevenlabs.io/docs/developers/
 */

import {
  KBConfig,
  KBConfigSchema,
  KBDocument,
  KBDocumentList,
  ListDocumentsRequest,
  UploadFileRequest,
  AddUrlRequest,
  AddTextRequest,
  UploadResponse,
  DeleteResponse,
  ElevenLabsDocument,
  ElevenLabsListResponse,
} from './types.js';

export interface AgentDocument {
  id: string;
  name: string;
  type: string;
}

export interface KnowledgeBaseClient {
  // Document operations
  listDocuments(params?: ListDocumentsRequest): Promise<KBDocumentList>;
  listAgentDocuments(): Promise<AgentDocument[]>;
  uploadFile(params: UploadFileRequest): Promise<UploadResponse>;
  addUrl(params: AddUrlRequest): Promise<UploadResponse>;
  addText(params: AddTextRequest): Promise<UploadResponse>;
  deleteDocument(documentId: string): Promise<DeleteResponse>;
  
  // Agent operations (optional)
  attachToAgent(docId: string, docName: string, docType: string): Promise<boolean>;
  
  // Config access
  getConfig(): Omit<KBConfig, 'apiKey'>;
  isConfigured(): boolean;
}

/**
 * Create a Knowledge Base client for a tenant
 */
export function createKnowledgeBaseClient(config: KBConfig): KnowledgeBaseClient {
  // Validate config
  const parsed = KBConfigSchema.safeParse(config);
  if (!parsed.success) {
    throw new Error(`Invalid KB config: ${parsed.error.message}`);
  }
  
  const { apiKey, agentId, baseUrl } = parsed.data;
  
  // Helper: Make API request
  async function apiRequest<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${baseUrl}${endpoint}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        'xi-api-key': apiKey,
        ...options.headers,
      },
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`ElevenLabs API error (${response.status}): ${error}`);
    }
    
    return response.json() as Promise<T>;
  }
  
  // Helper: Transform ElevenLabs document to our format
  function transformDocument(doc: ElevenLabsDocument): KBDocument {
    return {
      id: doc.id,
      name: doc.name,
      type: doc.type as KBDocument['type'],
      size_bytes: doc.metadata?.size_bytes,
      created_at: doc.metadata?.created_at_unix_secs
        ? new Date(doc.metadata.created_at_unix_secs * 1000).toISOString()
        : undefined,
      updated_at: doc.metadata?.last_updated_at_unix_secs
        ? new Date(doc.metadata.last_updated_at_unix_secs * 1000).toISOString()
        : undefined,
      url: doc.url,
      dependent_agents: doc.dependent_agents?.length || 0,
    };
  }
  
  return {
    async listDocuments(params = {}): Promise<KBDocumentList> {
      const searchParams = new URLSearchParams();
      if (params.page_size) searchParams.set('page_size', String(params.page_size));
      if (params.search) searchParams.set('search', params.search);
      if (params.cursor) searchParams.set('cursor', params.cursor);
      if (params.types?.length) {
        params.types.forEach(t => searchParams.append('types', t));
      }
      
      const query = searchParams.toString();
      const endpoint = `/convai/knowledge-base${query ? `?${query}` : ''}`;
      
      const data = await apiRequest<ElevenLabsListResponse>(endpoint);
      
      return {
        documents: data.documents.map(transformDocument),
        has_more: data.has_more,
        next_cursor: data.next_cursor,
      };
    },
    
    async listAgentDocuments(): Promise<AgentDocument[]> {
      if (!agentId) {
        return [];
      }
      
      try {
        const agent = await apiRequest<{
          conversation_config?: {
            agent?: {
              prompt?: {
                knowledge_base?: Array<{ type: string; id: string; name: string }>;
              };
            };
          };
        }>(`/convai/agents/${agentId}`);
        
        const knowledgeBase = agent.conversation_config?.agent?.prompt?.knowledge_base || [];
        return knowledgeBase.map(kb => ({
          id: kb.id,
          name: kb.name,
          type: kb.type,
        }));
      } catch (error) {
        console.error('[KB] Failed to list agent documents:', error);
        return [];
      }
    },
    
    async uploadFile(params: UploadFileRequest): Promise<UploadResponse> {
      try {
        const formData = new FormData();
        formData.append('file', params.file);
        if (params.name) {
          formData.append('name', params.name);
        }
        
        const data = await apiRequest<{ id: string; name: string }>(
          '/convai/knowledge-base/file',
          {
            method: 'POST',
            body: formData,
            // Don't set Content-Type - let browser set it with boundary
          }
        );
        
        if (params.attach_to_agent && agentId) {
          await this.attachToAgent(data.id, data.name, 'file');
        }
        
        return {
          success: true,
          document: {
            id: data.id,
            name: data.name,
            type: 'file',
          },
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Upload failed',
        };
      }
    },
    
    async addUrl(params: AddUrlRequest): Promise<UploadResponse> {
      try {
        const data = await apiRequest<{ id: string; name: string; url: string }>(
          '/convai/knowledge-base/url',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              url: params.url,
              name: params.name || params.url,
            }),
          }
        );
        
        if (params.attach_to_agent && agentId) {
          await this.attachToAgent(data.id, data.name, 'url');
        }
        
        return {
          success: true,
          document: {
            id: data.id,
            name: data.name,
            type: 'url',
            url: data.url,
          },
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to add URL',
        };
      }
    },
    
    async addText(params: AddTextRequest): Promise<UploadResponse> {
      try {
        const data = await apiRequest<{ id: string; name: string }>(
          '/convai/knowledge-base/text',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              text: params.text,
              name: params.name,
            }),
          }
        );
        
        if (params.attach_to_agent && agentId) {
          await this.attachToAgent(data.id, data.name, 'text');
        }
        
        return {
          success: true,
          document: {
            id: data.id,
            name: data.name,
            type: 'text',
          },
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to add text',
        };
      }
    },
    
    async deleteDocument(documentId: string): Promise<DeleteResponse> {
      try {
        await apiRequest(`/convai/knowledge-base/${documentId}`, {
          method: 'DELETE',
        });
        
        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Delete failed',
        };
      }
    },
    
    async attachToAgent(docId: string, docName: string, docType: string): Promise<boolean> {
      if (!agentId) return false;
      
      try {
        // Get current agent config
        const agent = await apiRequest<{
          conversation_config?: {
            agent?: {
              prompt?: {
                knowledge_base?: Array<{ type: string; id: string; name: string }>;
              };
            };
          };
        }>(`/convai/agents/${agentId}`);
        
        const currentKB = agent.conversation_config?.agent?.prompt?.knowledge_base || [];
        
        // Check if already attached
        if (currentKB.some(kb => kb.id === docId)) {
          return true;
        }
        
        // Add new document
        const updatedKB = [
          ...currentKB,
          { type: docType, id: docId, name: docName },
        ];
        
        // Update agent
        await apiRequest(`/convai/agents/${agentId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            conversation_config: {
              agent: {
                prompt: {
                  knowledge_base: updatedKB,
                },
              },
            },
          }),
        });
        
        return true;
      } catch (error) {
        console.error('[KB] Failed to attach document to agent:', error);
        return false;
      }
    },
    
    getConfig() {
      return { agentId, baseUrl };
    },
    
    isConfigured() {
      return Boolean(apiKey);
    },
  };
}
