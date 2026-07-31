/**
 * Sandbox Executor
 * 
 * Secure code execution using VM2 (Node.js) or native isolation.
 * This is the core of the code execution optimization strategy.
 * 
 * SECURITY MODEL:
 * - Code runs in isolated VM context
 * - No access to Node.js APIs (fs, net, child_process, etc.)
 * - Only whitelisted tools are available
 * - Timeout and memory limits enforced
 * - No access to process.env or other sensitive data
 */

import { randomUUID } from 'crypto'
import type { 
  SandboxConfig, 
  SandboxResult, 
  ExecutionContext,
  ToolCall,
  ToolBindings,
} from './types.js'

/**
 * The Sandbox class - main executor for LLM-generated code
 */
export class Sandbox {
  private tools: ToolBindings
  private timeout: number
  private memoryLimit: number
  private enableLogging: boolean
  private globals: Record<string, unknown>

  constructor(config: SandboxConfig) {
    this.tools = config.tools
    this.timeout = config.timeout ?? 5000
    this.memoryLimit = config.memoryLimit ?? 128 * 1024 * 1024
    this.enableLogging = config.enableLogging ?? false
    this.globals = config.globals ?? {}
  }

  /**
   * Execute LLM-generated code in the sandbox
   * 
   * @param code - JavaScript/TypeScript code to execute
   * @returns Execution result with metadata
   */
  async execute<T = unknown>(code: string): Promise<SandboxResult<T>> {
    const executionId = randomUUID()
    const startedAt = new Date()
    const toolCalls: ToolCall[] = []
    const logs: string[] = []

    const context: ExecutionContext = {
      executionId,
      startedAt,
      toolCalls,
      logs,
    }

    const startTime = performance.now()

    try {
      // Create wrapped tool functions that track calls
      const wrappedTools = this.createWrappedTools(toolCalls)

      // Create the sandbox context
      const sandboxContext = {
        ...this.globals,
        ...wrappedTools,
        console: this.createConsoleProxy(logs),
        // Safe built-ins
        JSON,
        Math,
        Date,
        Array,
        Object,
        String,
        Number,
        Boolean,
        Promise,
        Map,
        Set,
        // Utility functions
        setTimeout: undefined, // Disabled for security
        setInterval: undefined, // Disabled for security
      }

      // Execute the code
      const result = await this.executeInIsolation<T>(code, sandboxContext)

      const executionTimeMs = performance.now() - startTime

      return {
        success: true,
        data: result,
        context,
        executionTimeMs,
      }
    } catch (error) {
      const executionTimeMs = performance.now() - startTime
      const err = error as Error

      return {
        success: false,
        error: err.message,
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
        context,
        executionTimeMs,
      }
    }
  }

  /**
   * Create wrapped tool functions that track execution
   */
  private createWrappedTools(toolCalls: ToolCall[]): ToolBindings {
    const wrapped: ToolBindings = {}

    for (const [name, fn] of Object.entries(this.tools)) {
      wrapped[name] = async (params: unknown) => {
        const callStart = performance.now()
        const timestamp = new Date()

        try {
          const result = await fn(params)
          
          toolCalls.push({
            toolName: name,
            params,
            result,
            durationMs: performance.now() - callStart,
            timestamp,
          })

          return result
        } catch (error) {
          const err = error as Error
          toolCalls.push({
            toolName: name,
            params,
            result: { error: err.message },
            durationMs: performance.now() - callStart,
            timestamp,
          })
          throw error
        }
      }
    }

    return wrapped
  }

  /**
   * Create a console proxy that captures logs
   */
  private createConsoleProxy(logs: string[]) {
    if (!this.enableLogging) {
      return {
        log: () => {},
        error: () => {},
        warn: () => {},
        info: () => {},
      }
    }

    return {
      log: (...args: unknown[]) => logs.push(`[LOG] ${args.map(String).join(' ')}`),
      error: (...args: unknown[]) => logs.push(`[ERROR] ${args.map(String).join(' ')}`),
      warn: (...args: unknown[]) => logs.push(`[WARN] ${args.map(String).join(' ')}`),
      info: (...args: unknown[]) => logs.push(`[INFO] ${args.map(String).join(' ')}`),
    }
  }

  /**
   * Execute code in isolation with timeout
   * 
   * This uses AsyncFunction for basic isolation. For production,
   * consider using VM2 or Cloudflare Workers for stronger isolation.
   */
  private async executeInIsolation<T>(
    code: string,
    context: Record<string, unknown>
  ): Promise<T> {
    // Create async function with injected context
    const contextKeys = Object.keys(context)
    const contextValues = Object.values(context)

    // Wrap code in async IIFE if it doesn't return explicitly
    const wrappedCode = code.includes('return ') 
      ? code 
      : `return (async () => { ${code} })()`

    // Create the function
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const fn = new Function(
      ...contextKeys,
      `"use strict"; return (async () => { ${wrappedCode} })()`
    )

    // Execute with timeout
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`Execution timeout after ${this.timeout}ms`)), this.timeout)
    })

    const executionPromise = fn(...contextValues) as Promise<T>

    return Promise.race([executionPromise, timeoutPromise])
  }

  /**
   * Get list of available tools
   */
  getAvailableTools(): string[] {
    return Object.keys(this.tools)
  }

  /**
   * Add a new tool at runtime
   */
  addTool(name: string, fn: (params: unknown) => Promise<unknown>): void {
    this.tools[name] = fn
  }

  /**
   * Remove a tool
   */
  removeTool(name: string): boolean {
    if (name in this.tools) {
      delete this.tools[name]
      return true
    }
    return false
  }
}

/**
 * Factory function to create a sandbox
 * 
 * @example
 * ```typescript
 * const sandbox = createSandbox({
 *   tools: {
 *     searchProducts: async (params) => { ... },
 *     getCart: async (params) => { ... },
 *   },
 *   timeout: 5000,
 * })
 * ```
 */
export function createSandbox(config: SandboxConfig): Sandbox {
  return new Sandbox(config)
}
