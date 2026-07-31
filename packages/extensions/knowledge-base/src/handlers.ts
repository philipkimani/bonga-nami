/**
 * Knowledge Base HTTP Handlers
 * 
 * Framework-agnostic HTTP handlers that can be adapted to any framework.
 * Each handler takes a standardized request and returns a standardized response.
 * 
 * Usage with Express:
 * ```typescript
 * import { createKBHandlers, expressAdapter } from '@platform/knowledge-base';
 * const handlers = createKBHandlers(kbClient);
 * 
 * app.get('/api/kb', expressAdapter(handlers.list));
 * app.post('/api/kb', expressAdapter(handlers.create));
 * app.delete('/api/kb/:id', expressAdapter(handlers.delete));
 * ```
 * 
 * Usage with Next.js App Router:
 * ```typescript
 * import { createKBHandlers, nextjsAdapter } from '@platform/knowledge-base';
 * const handlers = createKBHandlers(kbClient);
 * 
 * export const GET = nextjsAdapter(handlers.list);
 * export const POST = nextjsAdapter(handlers.create);
 * export const DELETE = nextjsAdapter(handlers.delete);
 * ```
 */

import { KnowledgeBaseClient } from './client.js';
import {
  Handler,
  HandlerRequest,
  HandlerResponse,
  DocumentType,
} from './types.js';

export interface KBHandlers {
  /** GET - List all documents */
  list: Handler;
  /** POST - Create document (file, URL, or text) */
  create: Handler;
  /** DELETE - Remove document by ID */
  delete: Handler;
}

/**
 * Create HTTP handlers for a Knowledge Base client
 */
export function createKBHandlers(client: KnowledgeBaseClient): KBHandlers {
  return {
    // GET - List documents
    async list(req: HandlerRequest): Promise<HandlerResponse> {
      if (!client.isConfigured()) {
        return { status: 500, body: { error: 'Knowledge base not configured' } };
      }
      
      try {
        const pageSize = req.query.page_size 
          ? parseInt(String(req.query.page_size), 10) 
          : undefined;
        const search = req.query.search ? String(req.query.search) : undefined;
        const cursor = req.query.cursor ? String(req.query.cursor) : undefined;
        const types = req.query.types 
          ? (Array.isArray(req.query.types) ? req.query.types : [req.query.types]) as DocumentType[]
          : undefined;
        
        const result = await client.listDocuments({
          page_size: pageSize,
          search,
          cursor,
          types,
        });
        
        return { status: 200, body: result };
      } catch (error) {
        console.error('[KB Handler] List error:', error);
        return { 
          status: 500, 
          body: { error: 'Failed to fetch documents' } 
        };
      }
    },
    
    // POST - Create document (handles file upload, URL, and text)
    async create(req: HandlerRequest): Promise<HandlerResponse> {
      if (!client.isConfigured()) {
        return { status: 500, body: { error: 'Knowledge base not configured' } };
      }
      
      try {
        // Check content type to determine upload type
        const contentType = req.query._contentType as string || '';
        
        // Handle file upload (multipart/form-data)
        if (contentType.includes('multipart/form-data') || req.formData) {
          if (!req.formData) {
            return { status: 400, body: { error: 'No form data parser available' } };
          }
          
          const formData = await req.formData();
          const file = formData.get('file') as File | null;
          const name = formData.get('name') as string || file?.name || 'Untitled';
          const attachToAgent = formData.get('attach_to_agent') === 'true';
          
          if (!file) {
            return { status: 400, body: { error: 'No file provided' } };
          }
          
          const result = await client.uploadFile({
            file,
            name,
            attach_to_agent: attachToAgent,
          });
          
          return { 
            status: result.success ? 200 : 500, 
            body: result 
          };
        }
        
        // Handle JSON body (URL or text)
        const body = req.body as {
          type?: string;
          url?: string;
          text?: string;
          name?: string;
          attach_to_agent?: boolean;
        };
        
        if (!body || typeof body !== 'object') {
          return { status: 400, body: { error: 'Invalid request body' } };
        }
        
        const { type, url, text, name, attach_to_agent } = body;
        
        if (type === 'url') {
          if (!url) {
            return { status: 400, body: { error: 'URL required' } };
          }
          
          const result = await client.addUrl({
            url,
            name,
            attach_to_agent,
          });
          
          return { 
            status: result.success ? 200 : 500, 
            body: result 
          };
        }
        
        if (type === 'text') {
          if (!text || !name) {
            return { status: 400, body: { error: 'Text and name required' } };
          }
          
          const result = await client.addText({
            text,
            name,
            attach_to_agent,
          });
          
          return { 
            status: result.success ? 200 : 500, 
            body: result 
          };
        }
        
        return { status: 400, body: { error: 'Invalid document type' } };
      } catch (error) {
        console.error('[KB Handler] Create error:', error);
        return { 
          status: 500, 
          body: { error: 'Failed to create document' } 
        };
      }
    },
    
    // DELETE - Remove document
    async delete(req: HandlerRequest): Promise<HandlerResponse> {
      if (!client.isConfigured()) {
        return { status: 500, body: { error: 'Knowledge base not configured' } };
      }
      
      try {
        // Document ID can come from URL params or body
        let documentId: string | undefined;
        
        // Try to get from URL path (e.g., /api/kb/documents/abc123)
        const urlParts = req.url.split('/');
        const lastPart = urlParts[urlParts.length - 1];
        if (lastPart && !lastPart.includes('?')) {
          documentId = lastPart;
        }
        
        // Or from body
        if (!documentId && req.body && typeof req.body === 'object') {
          documentId = (req.body as { documentId?: string }).documentId;
        }
        
        if (!documentId) {
          return { status: 400, body: { error: 'Document ID required' } };
        }
        
        const result = await client.deleteDocument(documentId);
        
        return { 
          status: result.success ? 200 : 500, 
          body: result 
        };
      } catch (error) {
        console.error('[KB Handler] Delete error:', error);
        return { 
          status: 500, 
          body: { error: 'Failed to delete document' } 
        };
      }
    },
  };
}

// ============================================================================
// Framework Adapters
// ============================================================================

/**
 * Adapter for Express.js
 */
export function expressAdapter(handler: Handler) {
  return async (req: any, res: any) => {
    const request: HandlerRequest = {
      method: req.method,
      url: req.url,
      query: req.query,
      body: req.body,
      formData: req.file ? async () => {
        const fd = new FormData();
        fd.append('file', new Blob([req.file.buffer]), req.file.originalname);
        Object.entries(req.body || {}).forEach(([k, v]) => fd.append(k, String(v)));
        return fd;
      } : undefined,
    };
    
    const response = await handler(request);
    res.status(response.status).json(response.body);
  };
}

/**
 * Adapter for Next.js App Router
 * 
 * Usage:
 * ```typescript
 * // app/api/kb/route.ts
 * import { createKBHandlers } from '@platform/knowledge-base';
 * import { nextjsAdapter } from '@platform/knowledge-base/handlers';
 * 
 * const kb = createKnowledgeBaseClient({ apiKey: process.env.ELEVENLABS_API_KEY });
 * const handlers = createKBHandlers(kb);
 * 
 * export const GET = nextjsAdapter(handlers.list);
 * export const POST = nextjsAdapter(handlers.create);
 * export const DELETE = nextjsAdapter(handlers.delete);
 * ```
 */
export function nextjsAdapter(handler: Handler): (request: Request) => Promise<Response> {
  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    const query: Record<string, string> = {};
    url.searchParams.forEach((value, key) => {
      query[key] = value;
    });
    
    // Add content type to query for handler to detect
    const contentType = request.headers.get('content-type') || '';
    query._contentType = contentType;
    
    let body: unknown = undefined;
    let formDataFn: (() => Promise<FormData>) | undefined = undefined;
    
    if (contentType.includes('application/json')) {
      body = await request.json().catch(() => undefined);
    } else if (contentType.includes('multipart/form-data')) {
      formDataFn = () => request.formData();
    }
    
    const req: HandlerRequest = {
      method: request.method,
      url: url.pathname,
      query,
      body,
      formData: formDataFn,
    };
    
    const response = await handler(req);
    
    return new Response(JSON.stringify(response.body), {
      status: response.status,
      headers: { 'Content-Type': 'application/json' },
    });
  };
}
