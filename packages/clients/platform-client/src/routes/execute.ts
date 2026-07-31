/**
 * CODE EXECUTION ROUTE — Sandbox Integration for ElevenLabs
 * 
 * This route allows ElevenLabs to send generated code for execution,
 * instead of making multiple individual tool calls.
 * 
 * HOW IT WORKS:
 * 1. User asks complex question: "Find Nike shoes under $100 that are in stock"
 * 2. LLM generates JavaScript code that calls multiple tools
 * 3. ElevenLabs POSTs the code to /webhooks/execute
 * 4. Sandbox executes code locally, calling tools as needed
 * 5. Single result returned to LLM
 * 
 * ELEVENLABS WEBHOOK FORMAT:
 * ElevenLabs sends tool calls with this structure:
 * {
 *   "code": "const products = await searchProducts({...}); return products;",
 *   "conversation_id": "conv_xxx",
 *   "user_id": "user_xxx"
 * }
 * 
 * COST SAVINGS:
 * - Traditional: 3+ LLM round trips (search → inventory → inventory → format)
 * - Code Execution: 1 round trip (code → result)
 * - Measured savings: 77% token reduction, 64% cost savings
 * 
 * @since v3.2.0
 */

import express from "express";
import type { TenantContext } from "@platform/core";
import { createSandbox, type ToolBindings } from "@platform/core";
import { 
  globalToolRegistry,
  type ToolExecutionContext 
} from "@platform/core";
import { 
  getCachedToolResponse, 
  cacheToolResponse,
  getCacheStats,
} from "../services/cache.js";
import { getBackendApiUrl, getBackendApiKey } from "./admin-config.js";
import {
  getUserContext,
  buildUserContextForLLM,
  saveConversationSummary,
  type ConversationSummary,
} from "../services/user-memory.js";
import { isRedisAvailable } from "../services/redis.js";

// ============================================================================
// SETUP
// ============================================================================

const router = express.Router();

/**
 * Create tool bindings from the global registry.
 * These are the actual functions the sandbox can call.
 * 
 * CACHING: Tool responses are cached in Redis when available.
 * Cache hits return immediately without calling the backend API.
 */
function createToolBindingsFromRegistry(context: ToolExecutionContext): ToolBindings {
  const bindings: Record<string, (params: unknown) => Promise<unknown>> = {};
  
  // Get all server-side tools
  const serverTools = globalToolRegistry.getServerTools();
  
  for (const tool of serverTools) {
    // Convert tool ID (e.g., "ecommerce.search_products") to camelCase function name
    const functionName = toolIdToFunctionName(tool.definition.id);
    const toolId = tool.definition.id;
    
    // Determine if this tool should be cached
    const isCacheable = shouldCacheTool(tool.definition);
    
    bindings[functionName] = async (params: unknown) => {
      const typedParams = params as Record<string, unknown>;
      
      // Try cache first (if enabled and tool is cacheable)
      if (isCacheable) {
        const cached = await getCachedToolResponse(toolId, typedParams);
        if (cached !== null) {
          return cached;
        }
      }
      
      // Execute the actual tool
      const result = await globalToolRegistry.execute(
        toolId,
        typedParams,
        context
      );
      
      if (!result.success) {
        throw new Error(result.error || "Tool execution failed");
      }
      
      // Cache successful responses
      if (isCacheable && result.data !== undefined) {
        await cacheToolResponse(toolId, typedParams, result.data);
      }
      
      return result.data;
    };
  }
  
  return bindings;
}

/**
 * Determine if a tool's responses should be cached.
 * Write operations (create, update, delete) should NOT be cached.
 */
function shouldCacheTool(definition: { id: string; description?: string }): boolean {
  const id = definition.id.toLowerCase();
  const desc = (definition.description || '').toLowerCase();
  
  // Never cache write operations
  const writeKeywords = ['create', 'update', 'delete', 'book', 'order', 'pay', 'send', 'submit', 'cancel'];
  for (const keyword of writeKeywords) {
    if (id.includes(keyword) || desc.includes(keyword)) {
      return false;
    }
  }
  
  // Cache read operations
  const readKeywords = ['get', 'search', 'find', 'list', 'check', 'lookup', 'fetch'];
  for (const keyword of readKeywords) {
    if (id.includes(keyword)) {
      return true;
    }
  }
  
  // Default: cache if no write keywords found
  return true;
}

/**
 * Convert tool ID to function name
 * "ecommerce.search_products" → "searchProducts"
 */
function toolIdToFunctionName(toolId: string): string {
  const parts = toolId.split(".");
  const name = parts[parts.length - 1]; // Get last part (e.g., "search_products")
  
  // Convert snake_case to camelCase
  return name.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

/**
 * Extract execution context from request
 */
function extractExecutionContext(req: any): ToolExecutionContext {
  const tenantCtx = req.tenantContext as TenantContext | undefined;
  
  const {
    conversation_id,
    user_id,
    metadata = {},
  } = req.body;
  
  return {
    tenantId: tenantCtx?.tenantId || "default",
    sessionId: conversation_id || `session-${Date.now()}`,
    userId: user_id,
    requestId: req.headers["x-request-id"] as string || `req-${Date.now()}`,
    conversationMetadata: metadata,
  };
}

// ============================================================================
// GENERIC API BINDINGS — Industry-Agnostic Backend Access
// ============================================================================

/**
 * Create generic API bindings for the sandbox.
 * 
 * These bindings allow LLM-generated code to call the client's backend API
 * without needing specific tools registered in globalToolRegistry.
 * 
 * SCALABLE ARCHITECTURE:
 * - Platform provides: apiGet, apiPost, apiPut, apiDelete (generic)
 * - Client configures: Backend URL in Admin Console
 * - Client teaches LLM: API paths via ElevenLabs system prompt
 * 
 * USAGE IN LLM-GENERATED CODE:
 * ```javascript
 * // GET request with query params
 * const safaris = await apiGet({ path: '/api/safaris', query: { maxPrice: 500 } });
 * 
 * // POST request with body
 * const booking = await apiPost({ path: '/api/bookings', data: { safariId: '123', guests: 4 } });
 * 
 * // PUT request
 * await apiPut({ path: '/api/bookings/123', data: { status: 'confirmed' } });
 * 
 * // DELETE request
 * await apiDelete({ path: '/api/bookings/123' });
 * ```
 * 
 * WHY GENERIC IS BETTER:
 * - Works for ANY industry (hospitality, ecommerce, healthcare, etc.)
 * - No code changes needed for new clients
 * - Client owns their API structure
 * - 77% token reduction through code execution
 */
function createApiBindings(): ToolBindings {
  const backendUrl = getBackendApiUrl();
  const backendKey = getBackendApiKey();
  
  if (!backendUrl) {
    console.warn('[execute] ⚠️ No backendApiUrl configured - API bindings will fail');
  } else {
    console.log(`[execute] 📡 Backend URL configured: ${backendUrl}`);
  }
  
  /**
   * Make an HTTP request to the client's backend API.
   * Handles GET (query params) and POST/PUT/DELETE (JSON body).
   */
  async function apiRequest(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    data?: Record<string, unknown>
  ): Promise<unknown> {
    if (!backendUrl) {
      throw new Error('Backend API URL not configured. Please set it in Admin Console → Platform Settings.');
    }
    
    // Normalize path - ensure it starts with /
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    
    // Build full URL - backendUrl should NOT end with /, path should start with /
    const fullUrl = `${backendUrl.replace(/\/$/, '')}${normalizedPath}`;
    
    console.log(`[execute] 🔄 API ${method} ${fullUrl}`);
    console.log(`[execute]    Data/Query params:`, data);
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    
    // Add API key if configured
    if (backendKey) {
      headers['x-api-key'] = backendKey;
    }
    
    const options: RequestInit = {
      method,
      headers,
    };
    
    // GET requests: encode data as query params
    let requestUrl = fullUrl;
    if (method === 'GET' && data && Object.keys(data).length > 0) {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(data)) {
        if (value !== undefined && value !== null) {
          params.append(key, String(value));
        }
      }
      requestUrl = `${fullUrl}?${params.toString()}`;
      console.log(`[execute]    Final URL with params: ${requestUrl}`);
    } else if (data && method !== 'GET') {
      // POST/PUT/DELETE: send as JSON body
      options.body = JSON.stringify(data);
    }
    
    const response = await fetch(requestUrl, options);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[execute] ❌ API error ${response.status}: ${errorText}`);
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }
    
    const result = await response.json();
    // Log enough of the actual response to diagnose search/query issues.
    // For arrays: show count + first 3 items (to see what the backend returned).
    // For objects: show top-level keys.
    if (Array.isArray(result)) {
      console.log(`[execute] ✅ API response: array with ${result.length} items`);
      if (result.length > 0) {
        const preview = result.slice(0, 3).map(item => 
          typeof item === 'object' ? JSON.stringify(item).slice(0, 200) : String(item)
        );
        console.log(`[execute]    First items: ${preview.join(' | ')}`);
      }
    } else if (result && typeof result === 'object') {
      const keys = Object.keys(result);
      console.log(`[execute] ✅ API response: object with keys [${keys.join(', ')}]`);
      // If the result contains a data/items/results array, log its count
      for (const key of ['data', 'items', 'results', 'packages', 'safaris', 'activities']) {
        if (Array.isArray(result[key])) {
          console.log(`[execute]    ${key}: ${result[key].length} items`);
        }
      }
    } else {
      console.log(`[execute] ✅ API response: ${typeof result}`);
    }
    return result;
  }
  
  // Return ONLY generic bindings - no industry-specific functions
  return {
    /**
     * Generic GET request
     * @param params.path - API endpoint path (e.g., '/api/safaris')
     * @param params.query - Optional query parameters
     */
    apiGet: async (params: unknown): Promise<unknown> => {
      const { path, query } = params as { path: string; query?: Record<string, unknown> };
      if (!path) throw new Error('apiGet requires a "path" parameter');
      return apiRequest('GET', path, query);
    },
    
    /**
     * Generic POST request
     * @param params.path - API endpoint path
     * @param params.data - Request body data
     */
    apiPost: async (params: unknown): Promise<unknown> => {
      const { path, data } = params as { path: string; data?: Record<string, unknown> };
      if (!path) throw new Error('apiPost requires a "path" parameter');
      return apiRequest('POST', path, data);
    },
    
    /**
     * Generic PUT request
     * @param params.path - API endpoint path
     * @param params.data - Request body data
     */
    apiPut: async (params: unknown): Promise<unknown> => {
      const { path, data } = params as { path: string; data?: Record<string, unknown> };
      if (!path) throw new Error('apiPut requires a "path" parameter');
      return apiRequest('PUT', path, data);
    },
    
    /**
     * Generic DELETE request
     * @param params.path - API endpoint path
     * @param params.data - Optional request body data
     */
    apiDelete: async (params: unknown): Promise<unknown> => {
      const { path, data } = params as { path: string; data?: Record<string, unknown> };
      if (!path) throw new Error('apiDelete requires a "path" parameter');
      return apiRequest('DELETE', path, data);
    },
  };
}

// ============================================================================
// CODE EXECUTION ENDPOINT
// ============================================================================

/**
 * POST /api/execute
 * 
 * Execute LLM-generated code in a secure sandbox.
 * 
 * Request body:
 * {
 *   code: "const products = await searchProducts({...}); return products;",
 *   conversation_id: "...",
 *   user_id: "...",
 *   metadata: {...}
 * }
 * 
 * Response:
 * {
 *   status: "success",
 *   data: { ... },
 *   execution_time_ms: 123,
 *   tool_calls: ["searchProducts", "getInventory"]
 * }
 */
router.post("/", async (req: any, res: any) => {
  const startTime = Date.now();
  const { code, conversation_id, user_id, metadata } = req.body;
  
  // Validate code is provided
  if (!code || typeof code !== "string") {
    res.status(400).json({
      status: "error",
      error: "Missing or invalid 'code' in request body",
    });
    return;
  }
  
  // Log the FULL code received from ElevenLabs (up to 2000 chars).
  // This is essential for diagnosing search/query issues — the 100-char
  // preview was too short to see what API calls the LLM generated.
  const codePreview = code.length > 2000 ? code.slice(0, 2000) + `\n... [truncated, ${code.length} chars total]` : code;
  console.log(`[execute] 📥 Code execution request (${code.length} chars) | conv: ${conversation_id || 'n/a'}`);
  console.log(`[execute] === LLM-GENERATED CODE ===\n${codePreview}\n[execute] === END CODE ===`);
  
  // Extract context
  const context = extractExecutionContext(req);
  
  // Fetch user memory context if available (for personalization)
  let userContextForLLM: string | null = null;
  if (user_id && isRedisAvailable()) {
    userContextForLLM = await buildUserContextForLLM(user_id);
    if (userContextForLLM) {
      console.log(`[execute] 🧠 User memory loaded for: ${user_id.substring(0, 6)}***`);
    }
  }
  
  // Create tool bindings from registry (with caching) - these are specific registered tools
  const registryBindings = createToolBindingsFromRegistry(context);
  
  // Create generic API bindings - these work for any client's backend API
  const apiBindings = createApiBindings();
  
  // Merge bindings: API bindings first (generic), then registry bindings (specific overrides)
  const allBindings = {
    ...apiBindings,
    ...registryBindings,
  };
  
  // Log available tools and cache status
  const cacheStatus = isRedisAvailable() ? '✅ enabled' : '⚠️ disabled';
  const registryToolCount = Object.keys(registryBindings).length;
  const apiToolCount = Object.keys(apiBindings).length;
  console.log(`[execute] 🔧 Available bindings: ${Object.keys(allBindings).join(", ")}`);
  console.log(`[execute]    API bindings: ${apiToolCount} | Registry tools: ${registryToolCount} | Cache: ${cacheStatus}`);
  
  // Create sandbox with all bindings
  const sandbox = createSandbox({
    tools: allBindings,
    timeout: 30000, // 30 second timeout for complex multi-step operations
    enableLogging: process.env.NODE_ENV === "development",
  });
  
  try {
    // Execute the code
    const result = await sandbox.execute(code);
    
    const totalTime = Date.now() - startTime;
    
    // Log execution summary
    const toolsCalled = result.context.toolCalls.map(c => c.toolName);
    const cacheStats = getCacheStats();
    console.log(`[execute] 📤 Execution complete | success=${result.success} | tools=${toolsCalled.length} | ${totalTime}ms | cache hit rate: ${cacheStats.hitRate}`);
    
    // Log each tool call with its arguments for full traceability.
    // This reveals exactly what API paths + query params the LLM-generated
    // code used — critical for diagnosing "no results" issues.
    for (const tc of result.context.toolCalls) {
      const argsPreview = JSON.stringify(tc.params).slice(0, 300);
      console.log(`[execute] 🔧 Tool call: ${tc.toolName}(${argsPreview})`);
    }
    
    // Log what the code actually returned (with enough detail to diagnose)
    console.log(`[execute] 📊 Result data type: ${typeof result.data}`);
    if (Array.isArray(result.data)) {
      console.log(`[execute] 📊 Result is array with ${result.data.length} items`);
      if (result.data.length > 0 && result.data.length <= 5) {
        console.log(`[execute] 📊 Full result: ${JSON.stringify(result.data).slice(0, 1000)}`);
      }
    } else if (result.data && typeof result.data === 'object') {
      console.log(`[execute] 📊 Result keys: ${Object.keys(result.data).join(', ')}`);
      console.log(`[execute] 📊 Result preview: ${JSON.stringify(result.data).slice(0, 500)}`);
    } else {
      console.log(`[execute] 📊 Result value: ${JSON.stringify(result.data)}`);
    }
    
    if (result.success) {
      // Build response with optional user context
      const response: Record<string, unknown> = {
        status: "success",
        data: result.data,
        execution_time_ms: totalTime,
        sandbox_time_ms: result.executionTimeMs,
        tool_calls: toolsCalled,
        tool_call_count: toolsCalled.length,
      };
      
      // Include user context if available (LLM can use this for personalization)
      if (userContextForLLM) {
        response.user_context = userContextForLLM;
      }
      
      // Include cache stats in development
      if (process.env.NODE_ENV === 'development') {
        response.cache = cacheStats;
      }
      
      res.json(response);
    } else {
      // Code execution failed (syntax error, runtime error, etc.)
      console.error(`[execute] ❌ Execution failed: ${result.error}`);
      res.status(400).json({
        status: "error",
        error: result.error,
        execution_time_ms: totalTime,
        tool_calls: toolsCalled,
      });
    }
  } catch (error) {
    const totalTime = Date.now() - startTime;
    const err = error as Error;
    
    console.error(`[execute] ❌ Unexpected error: ${err.message}`);
    res.status(500).json({
      status: "error",
      error: err.message,
      execution_time_ms: totalTime,
    });
  }
});

// ============================================================================
// TOOL DISCOVERY FOR CODE EXECUTION
// ============================================================================

/**
 * GET /api/execute/tools
 * 
 * List available tools for code execution.
 * Useful for generating system prompts.
 */
router.get("/tools", (req: any, res: any) => {
  const serverTools = globalToolRegistry.getServerTools();
  
  const tools = serverTools.map(t => ({
    id: t.definition.id,
    functionName: toolIdToFunctionName(t.definition.id),
    description: t.definition.description,
    parameters: t.definition.parameters,
  }));
  
  res.json({
    count: tools.length,
    tools,
  });
});

/**
 * GET /api/execute/prompt
 * 
 * Generate system prompt addition for code execution mode.
 * Add this to your ElevenLabs agent system prompt.
 */
router.get("/prompt", (req: any, res: any) => {
  const serverTools = globalToolRegistry.getServerTools();
  
  const toolDescriptions = serverTools.map(t => {
    const funcName = toolIdToFunctionName(t.definition.id);
    return `- ${funcName}: ${t.definition.description}`;
  }).join("\n");
  
  const prompt = `
## Code Execution Mode

You have access to a code execution environment. Instead of making multiple individual tool calls, you can write JavaScript code that orchestrates multiple operations efficiently.

### When to Use Code Execution:
- When you need to call multiple tools
- When you need to filter, transform, or combine data
- When you need conditional logic (if/else)
- When you need loops or iterations

### Code Execution Format:
When you want to execute code, use the execute_code tool with your JavaScript code:

\`\`\`javascript
// Your code here
const result = await toolName({ param: value });
return result;
\`\`\`

### Available Tools:
${toolDescriptions}

### Rules:
1. Always use \`await\` when calling tools (they are async)
2. Always \`return\` your final result
3. You can use: JSON, Math, Date, Array methods, Object methods
4. You CANNOT use: setTimeout, setInterval, fetch, require, import
5. Keep code simple and readable

### Example:
\`\`\`javascript
// Find Nike shoes under $100 that are in stock
const products = await searchProducts({ query: 'nike', maxPrice: 100 });

const withInventory = await Promise.all(
  products.map(async (p) => {
    const inv = await getInventory({ productId: p.id });
    return { ...p, inStock: inv.quantity > 0 };
  })
);

return withInventory.filter(p => p.inStock);
\`\`\`
`.trim();
  
  res.json({
    message: "Add this to your ElevenLabs agent system prompt",
    prompt,
  });
});

/**
 * GET /api/execute/health
 * 
 * Health check for code execution endpoint.
 */
router.get("/health", (req: any, res: any) => {
  const serverTools = globalToolRegistry.getServerTools();
  
  res.json({
    status: "healthy",
    availableTools: serverTools.length,
    toolNames: serverTools.map(t => toolIdToFunctionName(t.definition.id)),
  });
});

export default router;
