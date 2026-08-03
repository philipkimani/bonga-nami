/**
 * @platform/code-execution-sandbox
 * 
 * A secure, scalable code execution sandbox for MCP tool orchestration.
 * This module allows LLMs to generate and execute code that calls multiple
 * MCP tools in a single request, dramatically reducing token consumption.
 * 
 * SCALABILITY: This is a generic executor. Each client configures it with
 * their own MCP tool bindings - no per-client code changes needed.
 * 
 * @example
 * ```typescript
 * import { createSandbox } from '@platform/core/sandbox'
 * 
 * // Client creates sandbox with THEIR tool bindings
 * const sandbox = createSandbox({
 *   tools: {
 *     searchProducts: async (params) => fetch('/api/products', {...}),
 *     getInventory: async (params) => fetch('/api/inventory', {...}),
 *   },
 *   timeout: 5000,
 *   memoryLimit: 128 * 1024 * 1024, // 128MB
 * })
 * 
 * // Execute LLM-generated code
 * const result = await sandbox.execute(`
 *   const products = await searchProducts({ category: 'shoes' });
 *   const withStock = await Promise.all(
 *     products.map(async p => ({
 *       ...p,
 *       stock: await getInventory({ productId: p.id })
 *     }))
 *   );
 *   return withStock.filter(p => p.stock > 0);
 * `)
 * ```
 */

export { createSandbox, Sandbox } from './executor.js'
export { generateBindings } from './binding-generator.js'
export { generateTypes } from './type-generator.js'
export { PROMPT_TEMPLATES, buildCodeExecutionPrompt, getAllTemplates } from './prompt-templates.js'
export { 
  convertOpenAPIToElevenLabsTools, 
  formatForElevenLabs, 
  generateToolSummary 
} from './openapi-to-elevenlabs.js'

export type { 
  SandboxConfig, 
  SandboxResult, 
  SandboxToolDefinition,
  ToolBindings,
  ExecutionContext,
} from './types.js'
