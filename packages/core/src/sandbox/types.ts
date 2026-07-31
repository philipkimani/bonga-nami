/**
 * Sandbox Type Definitions
 * 
 * Generic types that work for ANY client's tools.
 * Clients define their specific tool shapes when creating the sandbox.
 */

import { z } from 'zod'

// =============================================================================
// Tool Definition Types (MCP-compatible)
// =============================================================================

/**
 * JSON Schema for tool parameters (MCP standard)
 */
export interface JSONSchema {
  type: 'object' | 'string' | 'number' | 'boolean' | 'array'
  properties?: Record<string, JSONSchema & { description?: string }>
  required?: string[]
  items?: JSONSchema
  description?: string
  enum?: string[]
}

/**
 * MCP Tool Definition for Sandbox
 * This matches the standard MCP tool format used by ElevenLabs and other platforms.
 */
export interface SandboxToolDefinition {
  name: string
  description: string
  parameters: JSONSchema
}

/**
 * Runtime tool bindings - actual functions that execute the tools
 */
export type ToolBindings = Record<string, (params: unknown) => Promise<unknown>>

// =============================================================================
// Sandbox Configuration
// =============================================================================

export interface SandboxConfig {
  /**
   * Tool bindings - functions that implement each MCP tool.
   * Clients provide these based on their specific backend.
   */
  tools: ToolBindings

  /**
   * Maximum execution time in milliseconds.
   * @default 5000 (5 seconds)
   */
  timeout?: number

  /**
   * Memory limit in bytes.
   * @default 134217728 (128MB)
   */
  memoryLimit?: number

  /**
   * Enable console.log capture for debugging.
   * @default false in production
   */
  enableLogging?: boolean

  /**
   * Custom global variables available in sandbox.
   * Use for constants, configuration, etc.
   */
  globals?: Record<string, unknown>
}

// =============================================================================
// Execution Types
// =============================================================================

export interface ExecutionContext {
  /** Unique execution ID for tracing */
  executionId: string
  
  /** Start timestamp */
  startedAt: Date
  
  /** Tool calls made during execution */
  toolCalls: ToolCall[]
  
  /** Console output captured */
  logs: string[]
}

export interface ToolCall {
  toolName: string
  params: unknown
  result: unknown
  durationMs: number
  timestamp: Date
}

export interface SandboxResult<T = unknown> {
  /** Whether execution completed successfully */
  success: boolean
  
  /** The return value from the executed code */
  data?: T
  
  /** Error message if execution failed */
  error?: string
  
  /** Error stack trace (only in development) */
  stack?: string
  
  /** Execution metadata */
  context: ExecutionContext
  
  /** Total execution time in milliseconds */
  executionTimeMs: number
}

// =============================================================================
// Validation Schemas
// =============================================================================

export const SandboxConfigSchema = z.object({
  tools: z.record(z.function()),
  timeout: z.number().min(100).max(30000).default(5000),
  memoryLimit: z.number().min(1024 * 1024).max(512 * 1024 * 1024).default(128 * 1024 * 1024),
  enableLogging: z.boolean().default(false),
  globals: z.record(z.unknown()).optional(),
})

// =============================================================================
// Binding Generator Types
// =============================================================================

export interface BindingGeneratorConfig {
  /** MCP tool definitions to generate bindings for */
  tools: SandboxToolDefinition[]
  
  /** Output format */
  format: 'typescript' | 'javascript'
  
  /** Include JSDoc comments */
  includeJsDoc?: boolean
}

export interface GeneratedBindings {
  /** Generated TypeScript/JavaScript code */
  code: string
  
  /** Type definitions (for TypeScript) */
  types?: string
  
  /** Tool names that were generated */
  toolNames: string[]
}
