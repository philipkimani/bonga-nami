/**
 * Framework Adapters
 * 
 * Adapters to convert framework-agnostic handlers to specific frameworks.
 */

import type { Handler, HttpRequest, HttpResponse } from './types.js';

/**
 * Next.js App Router adapter
 * 
 * Converts our generic handler to Next.js route handler.
 * 
 * @example
 * ```ts
 * // app/api/voice/config/route.ts
 * import { createVoiceHandlers, getConfigFromEnv, nextjsAdapter } from '@platform/voice-extension/handlers';
 * 
 * const handlers = createVoiceHandlers(getConfigFromEnv());
 * export const GET = nextjsAdapter(handlers.getConfig);
 * ```
 */
export function nextjsAdapter(handler: Handler) {
  return async (
    request: Request,
    context?: { params?: Promise<Record<string, string>> }
  ): Promise<Response> => {
    const url = new URL(request.url);
    
    // Parse query params
    const query: Record<string, string> = {};
    url.searchParams.forEach((value, key) => {
      query[key] = value;
    });

    // Parse headers
    const headers: Record<string, string> = {};
    request.headers.forEach((value, key) => {
      headers[key] = value;
    });

    // Parse body for POST/PUT/PATCH
    let body: unknown;
    if (['POST', 'PUT', 'PATCH'].includes(request.method)) {
      try {
        const contentType = request.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          body = await request.json();
        } else if (contentType.includes('multipart/form-data')) {
          body = await request.formData();
        } else {
          body = await request.text();
        }
      } catch {
        body = undefined;
      }
    }

    // Await params if provided (Next.js 15+ returns Promise)
    const params = context?.params ? await context.params : undefined;

    const req: HttpRequest = {
      method: request.method,
      url: request.url,
      headers,
      query,
      body,
      params,
    };

    const res = await handler(req);

    return new Response(JSON.stringify(res.body), {
      status: res.status,
      headers: res.headers,
    });
  };
}

/**
 * Express adapter
 * 
 * Converts our generic handler to Express middleware.
 * 
 * @example
 * ```ts
 * // routes/voice.ts
 * import { createVoiceHandlers, getConfigFromEnv, expressAdapter } from '@platform/voice-extension/handlers';
 * 
 * const handlers = createVoiceHandlers(getConfigFromEnv());
 * 
 * router.get('/config', expressAdapter(handlers.getConfig));
 * router.post('/session', expressAdapter(handlers.createSession));
 * ```
 */
export function expressAdapter(handler: Handler) {
  return async (
    req: { 
      method: string; 
      url: string; 
      headers: Record<string, string | string[] | undefined>;
      query: Record<string, string | string[] | undefined>;
      body?: unknown;
      params?: Record<string, string>;
    },
    res: {
      status: (code: number) => { json: (body: unknown) => void };
      set: (headers: Record<string, string>) => void;
    }
  ) => {
    const httpReq: HttpRequest = {
      method: req.method,
      url: req.url,
      headers: req.headers as Record<string, string | string[] | undefined>,
      query: req.query as Record<string, string | string[] | undefined>,
      body: req.body,
      params: req.params,
    };

    const httpRes = await handler(httpReq);
    
    res.set(httpRes.headers);
    res.status(httpRes.status).json(httpRes.body);
  };
}

/**
 * Helper to create all Next.js route handlers at once
 * 
 * @example
 * ```ts
 * // app/api/voice/config/route.ts
 * import { createNextjsVoiceRoutes } from '@platform/voice-extension/handlers';
 * 
 * const routes = createNextjsVoiceRoutes();
 * export const GET = routes.config.GET;
 * ```
 */
export function createNextjsVoiceRoutes(config?: Parameters<typeof import('./voice-handlers.js').createVoiceHandlers>[0]) {
  // Lazy import to avoid circular deps
  const { createVoiceHandlers, getConfigFromEnv } = require('./voice-handlers.js');
  
  const handlers = createVoiceHandlers(config || getConfigFromEnv());

  return {
    config: {
      GET: nextjsAdapter(handlers.getConfig),
    },
    session: {
      GET: nextjsAdapter(handlers.listSessions),
      POST: nextjsAdapter(handlers.createSession),
    },
    sessionById: {
      DELETE: nextjsAdapter(handlers.endSession),
    },
  };
}
