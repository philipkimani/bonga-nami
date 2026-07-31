/**
 * TOOL DEFINITIONS — ElevenLabs Integration
 * 
 * This module provides the interface between our extensions and ElevenLabs tools.
 * 
 * ElevenLabs supports:
 * - Server Tools: Webhooks that ElevenLabs calls during conversation
 * - Client Tools: Functions executed in the browser
 * 
 * 📚 ElevenLabs Documentation Reference:
 * - Tools Overview: https://elevenlabs.io/docs/agents-platform/customization/tools
 * - Server Tools: https://elevenlabs.io/docs/agents-platform/customization/tools/server-tools
 * - Client Tools: https://elevenlabs.io/docs/agents-platform/customization/tools/client-tools
 * 
 * @since v3.1.0
 */

import { z } from "zod";

// ============================================================================
// TOOL PARAMETER TYPES
// ============================================================================

/**
 * Parameter types supported by ElevenLabs tools
 */
export type ToolParameterType = "string" | "number" | "boolean" | "array" | "object";

/**
 * Schema for a single tool parameter
 */
export interface ToolParameter {
  /** Parameter name */
  name: string;
  /** Parameter type */
  type: ToolParameterType;
  /** Human-readable description (helps LLM understand when to use) */
  description: string;
  /** Whether this parameter is required */
  required: boolean;
  /** Default value if not provided */
  default?: unknown;
  /** Enum values (for string type) */
  enum?: string[];
  /** Nested schema (for object/array types) */
  items?: ToolParameter;
  /** Properties (for object type) */
  properties?: ToolParameter[];
}

/**
 * Zod schema for tool parameter validation
 */
export const ToolParameterSchema: z.ZodType<ToolParameter> = z.lazy(() =>
  z.object({
    name: z.string(),
    type: z.enum(["string", "number", "boolean", "array", "object"]),
    description: z.string(),
    required: z.boolean(),
    default: z.unknown().optional(),
    enum: z.array(z.string()).optional(),
    items: ToolParameterSchema.optional(),
    properties: z.array(ToolParameterSchema).optional(),
  })
);

// ============================================================================
// TOOL DEFINITION
// ============================================================================

/**
 * Where the tool executes
 */
export type ToolExecutionLocation = "server" | "client";

/**
 * Complete tool definition that can be registered with ElevenLabs
 */
export interface ToolDefinition {
  /** Unique tool identifier (e.g., "ecommerce.search_products") */
  id: string;
  
  /** Human-readable name (shown in ElevenLabs dashboard) */
  name: string;
  
  /** Description (helps LLM understand when to call this tool) */
  description: string;
  
  /** Where the tool executes */
  executionContext: ToolExecutionLocation;
  
  /** Tool parameters */
  parameters: ToolParameter[];
  
  /** Which extension provides this tool */
  extensionId: string;
  
  /** Webhook path for server tools (relative, e.g., "/search_products") */
  webhookPath?: string;
  
  /** Whether this tool requires authentication */
  requiresAuth?: boolean;
  
  /** Estimated execution time in ms (for timeout configuration) */
  estimatedDuration?: number;
  
  /** Tags for categorization */
  tags?: string[];
}

/**
 * Zod schema for tool definition validation
 */
export const ToolDefinitionSchema = z.object({
  id: z.string().regex(/^[a-z_]+\.[a-z_]+$/, "Tool ID must be in format 'extension.tool_name'"),
  name: z.string().min(1),
  description: z.string().min(10),
  executionContext: z.enum(["server", "client"]),
  parameters: z.array(ToolParameterSchema),
  extensionId: z.string(),
  webhookPath: z.string().optional(),
  requiresAuth: z.boolean().optional(),
  estimatedDuration: z.number().positive().optional(),
  tags: z.array(z.string()).optional(),
});

// ============================================================================
// TOOL EXECUTION
// ============================================================================

/**
 * Context passed to tool handlers
 */
export interface ToolExecutionContext {
  /** Tenant ID */
  tenantId: string;
  /** Session/conversation ID */
  sessionId: string;
  /** User ID within tenant */
  userId?: string;
  /** Request ID for tracing */
  requestId: string;
  /** Conversation metadata */
  conversationMetadata?: Record<string, unknown>;
}

/**
 * Result of tool execution
 */
export interface ToolResult {
  /** Whether the tool executed successfully */
  success: boolean;
  /** Result data (returned to ElevenLabs) */
  data?: unknown;
  /** Error message if failed */
  error?: string;
  /** How long the tool took to execute */
  durationMs?: number;
}

/**
 * Server tool handler function signature
 */
export type ServerToolHandler = (
  params: Record<string, unknown>,
  context: ToolExecutionContext
) => Promise<ToolResult>;

/**
 * Client tool handler function signature (browser-side)
 */
export type ClientToolHandler = (
  params: Record<string, unknown>
) => Promise<unknown>;

// ============================================================================
// TOOL REGISTRY
// ============================================================================

/**
 * Registered tool with its handler
 */
export interface RegisteredTool {
  definition: ToolDefinition;
  handler: ServerToolHandler;
}

/**
 * Tool registry for managing platform tools
 */
export class ToolRegistry {
  private tools = new Map<string, RegisteredTool>();
  private toolsByExtension = new Map<string, Set<string>>();
  
  /**
   * Clear all registered tools (mainly for testing)
   */
  clear(): void {
    this.tools.clear();
    this.toolsByExtension.clear();
  }
  
  /**
   * Register a tool with the registry
   */
  register(definition: ToolDefinition, handler: ServerToolHandler): void {
    // Validate definition
    const parsed = ToolDefinitionSchema.safeParse(definition);
    if (!parsed.success) {
      throw new Error(`Invalid tool definition for ${definition.id}: ${parsed.error.message}`);
    }
    
    // Check for duplicate
    if (this.tools.has(definition.id)) {
      throw new Error(`Tool ${definition.id} is already registered`);
    }
    
    // Register
    this.tools.set(definition.id, { definition, handler });
    
    // Index by extension
    if (!this.toolsByExtension.has(definition.extensionId)) {
      this.toolsByExtension.set(definition.extensionId, new Set());
    }
    this.toolsByExtension.get(definition.extensionId)!.add(definition.id);
    
    console.log(`[ToolRegistry] ✅ Registered tool: ${definition.id}`);
  }
  
  /**
   * Get a tool by ID
   */
  get(toolId: string): RegisteredTool | undefined {
    return this.tools.get(toolId);
  }
  
  /**
   * Get all tools for an extension
   */
  getByExtension(extensionId: string): RegisteredTool[] {
    const toolIds = this.toolsByExtension.get(extensionId);
    if (!toolIds) return [];
    
    return Array.from(toolIds)
      .map(id => this.tools.get(id))
      .filter((t): t is RegisteredTool => t !== undefined);
  }
  
  /**
   * Get all registered tools
   */
  getAll(): RegisteredTool[] {
    return Array.from(this.tools.values());
  }
  
  /**
   * Get all server tools (for webhook registration)
   */
  getServerTools(): RegisteredTool[] {
    return this.getAll().filter(t => t.definition.executionContext === "server");
  }
  
  /**
   * Get all client tools (for browser registration)
   */
  getClientTools(): RegisteredTool[] {
    return this.getAll()
      .filter(t => t.definition.executionContext === "client");
  }
  
  /**
   * Execute a tool by ID
   */
  async execute(
    toolId: string,
    params: Record<string, unknown>,
    context: ToolExecutionContext
  ): Promise<ToolResult> {
    const tool = this.tools.get(toolId);
    
    if (!tool) {
      return {
        success: false,
        error: `Tool ${toolId} not found`,
      };
    }
    
    const startTime = Date.now();
    
    try {
      const result = await tool.handler(params, context);
      return {
        ...result,
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Tool execution failed",
        durationMs: Date.now() - startTime,
      };
    }
  }
  
  /**
   * Generate ElevenLabs tool configuration
   * This is what you'd paste into ElevenLabs dashboard or API
   * 
   * @param baseUrl - Base URL of the server (e.g., "http://localhost:3000")
   */
  generateElevenLabsConfig(baseUrl: string): object[] {
    return this.getServerTools().map(tool => {
      // webhookPath includes full path like "/api/tools/ecommerce/search_products"
      // Fallback to generating from tool ID
      const path = tool.definition.webhookPath || `/api/tools/${tool.definition.id.replace('.', '/')}`;
      const fullUrl = `${baseUrl}${path}`;
      
      return {
        type: "webhook",
        name: tool.definition.name,
        description: tool.definition.description,
        webhook: {
          url: fullUrl,
          method: "POST",
        },
        api_schema: {
          url: fullUrl,
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          path_params: {},
          query_params: {},
          body_params: Object.fromEntries(
            tool.definition.parameters.map(p => [
              p.name,
              {
                type: p.type,
                description: p.description,
                required: p.required,
                ...(p.enum && { enum: p.enum }),
                ...(p.default !== undefined && { default: p.default }),
              },
            ])
          ),
        },
      };
    });
  }
}

// ============================================================================
// GLOBAL REGISTRY INSTANCE
// ============================================================================

/**
 * Global tool registry instance
 * Extensions register their tools here
 */
export const globalToolRegistry = new ToolRegistry();

// ============================================================================
// HELPER: DEFINE TOOL
// ============================================================================

/**
 * Helper function to define a tool with type safety
 */
export function defineTool(
  definition: Omit<ToolDefinition, "id"> & { id: `${string}.${string}` },
  handler: ServerToolHandler
): { definition: ToolDefinition; handler: ServerToolHandler } {
  return { definition: definition as ToolDefinition, handler };
}
