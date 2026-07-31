/**
 * MCP Binding Generator
 * 
 * Generates TypeScript/JavaScript code from MCP tool definitions.
 * This allows clients to auto-generate type-safe tool bindings
 * from their existing MCP configuration.
 * 
 * SCALABILITY: This generator works with ANY MCP tool definition.
 * Clients run it once during setup with their specific tools.
 */

import type { 
  SandboxToolDefinition, 
  BindingGeneratorConfig, 
  GeneratedBindings,
  JSONSchema,
} from './types.js'

/**
 * Generate TypeScript/JavaScript bindings from MCP tool definitions
 * 
 * @example
 * ```typescript
 * const bindings = generateBindings({
 *   tools: [
 *     {
 *       name: 'searchProducts',
 *       description: 'Search for products',
 *       parameters: {
 *         type: 'object',
 *         properties: {
 *           query: { type: 'string', description: 'Search query' },
 *           limit: { type: 'number', description: 'Max results' },
 *         },
 *         required: ['query'],
 *       },
 *     },
 *   ],
 *   format: 'typescript',
 *   includeJsDoc: true,
 * })
 * 
 * console.log(bindings.code)
 * // Output: TypeScript interface and function declarations
 * ```
 */
export function generateBindings(config: BindingGeneratorConfig): GeneratedBindings {
  const { tools, format, includeJsDoc = true } = config
  
  const toolNames = tools.map(t => t.name)
  
  if (format === 'typescript') {
    return generateTypeScriptBindings(tools, includeJsDoc)
  } else {
    return generateJavaScriptBindings(tools, includeJsDoc)
  }
}

/**
 * Generate TypeScript bindings with full type safety
 */
function generateTypeScriptBindings(
  tools: SandboxToolDefinition[], 
  includeJsDoc: boolean
): GeneratedBindings {
  const lines: string[] = []
  const typeLines: string[] = []
  
  // Header
  lines.push('/**')
  lines.push(' * Auto-generated MCP Tool Bindings')
  lines.push(` * Generated at: ${new Date().toISOString()}`)
  lines.push(' * ')
  lines.push(' * DO NOT EDIT - Regenerate using: npx ruskins-generate-bindings')
  lines.push(' */')
  lines.push('')
  
  // Generate types for each tool
  typeLines.push('// Tool Parameter Types')
  typeLines.push('')
  
  for (const tool of tools) {
    // Generate parameter interface
    const interfaceName = `${pascalCase(tool.name)}Params`
    typeLines.push(`export interface ${interfaceName} {`)
    
    if (tool.parameters.properties) {
      for (const [propName, propSchema] of Object.entries(tool.parameters.properties)) {
        const isRequired = tool.parameters.required?.includes(propName)
        const tsType = jsonSchemaToTsType(propSchema)
        const optional = isRequired ? '' : '?'
        
        if (includeJsDoc && propSchema.description) {
          typeLines.push(`  /** ${propSchema.description} */`)
        }
        typeLines.push(`  ${propName}${optional}: ${tsType}`)
      }
    }
    
    typeLines.push('}')
    typeLines.push('')
  }
  
  // Generate tool bindings type
  typeLines.push('// Tool Bindings Interface')
  typeLines.push('export interface GeneratedToolBindings {')
  
  for (const tool of tools) {
    const interfaceName = `${pascalCase(tool.name)}Params`
    if (includeJsDoc) {
      typeLines.push(`  /** ${tool.description} */`)
    }
    typeLines.push(`  ${tool.name}: (params: ${interfaceName}) => Promise<unknown>`)
  }
  
  typeLines.push('}')
  typeLines.push('')
  
  // Generate tool definitions constant
  lines.push('// Tool Definitions for Prompt Templates')
  lines.push('export const TOOL_DEFINITIONS = [')
  
  for (const tool of tools) {
    lines.push('  {')
    lines.push(`    name: '${tool.name}',`)
    lines.push(`    description: '${escapeString(tool.description)}',`)
    lines.push(`    parameters: ${JSON.stringify(tool.parameters, null, 6).split('\n').join('\n    ')},`)
    lines.push('  },')
  }
  
  lines.push('] as const')
  lines.push('')
  
  // Generate tool names type
  lines.push('// Tool Names (for type-safe references)')
  lines.push(`export type ToolName = ${tools.map(t => `'${t.name}'`).join(' | ')}`)
  lines.push('')
  
  // Generate prompt helper
  lines.push('// Generate tool description for LLM prompts')
  lines.push('export function getToolDescriptions(): string {')
  lines.push('  return TOOL_DEFINITIONS.map(t => ')
  lines.push('    `${t.name}: ${t.description}`')
  lines.push('  ).join("\\n")')
  lines.push('}')
  lines.push('')
  
  return {
    code: lines.join('\n'),
    types: typeLines.join('\n'),
    toolNames: tools.map(t => t.name),
  }
}

/**
 * Generate JavaScript bindings (for non-TypeScript clients)
 */
function generateJavaScriptBindings(
  tools: SandboxToolDefinition[], 
  includeJsDoc: boolean
): GeneratedBindings {
  const lines: string[] = []
  
  // Header
  lines.push('/**')
  lines.push(' * Auto-generated MCP Tool Bindings')
  lines.push(` * Generated at: ${new Date().toISOString()}`)
  lines.push(' */')
  lines.push('')
  
  // Generate tool definitions
  lines.push('export const TOOL_DEFINITIONS = [')
  
  for (const tool of tools) {
    lines.push('  {')
    lines.push(`    name: '${tool.name}',`)
    lines.push(`    description: '${escapeString(tool.description)}',`)
    lines.push(`    parameters: ${JSON.stringify(tool.parameters, null, 6).split('\n').join('\n    ')},`)
    lines.push('  },')
  }
  
  lines.push(']')
  lines.push('')
  
  // Generate prompt helper
  if (includeJsDoc) {
    lines.push('/**')
    lines.push(' * Generate tool description for LLM prompts')
    lines.push(' * @returns {string} Formatted tool descriptions')
    lines.push(' */')
  }
  lines.push('export function getToolDescriptions() {')
  lines.push('  return TOOL_DEFINITIONS.map(t => ')
  lines.push('    `${t.name}: ${t.description}`')
  lines.push('  ).join("\\n")')
  lines.push('}')
  lines.push('')
  
  return {
    code: lines.join('\n'),
    toolNames: tools.map(t => t.name),
  }
}

/**
 * Convert JSON Schema type to TypeScript type
 */
function jsonSchemaToTsType(schema: JSONSchema): string {
  switch (schema.type) {
    case 'string':
      return schema.enum ? schema.enum.map(e => `'${e}'`).join(' | ') : 'string'
    case 'number':
      return 'number'
    case 'boolean':
      return 'boolean'
    case 'array':
      return schema.items ? `${jsonSchemaToTsType(schema.items)}[]` : 'unknown[]'
    case 'object':
      if (schema.properties) {
        const props = Object.entries(schema.properties)
          .map(([k, v]) => `${k}: ${jsonSchemaToTsType(v)}`)
          .join('; ')
        return `{ ${props} }`
      }
      return 'Record<string, unknown>'
    default:
      return 'unknown'
  }
}

/**
 * Convert string to PascalCase
 */
function pascalCase(str: string): string {
  return str
    .replace(/[-_](.)/g, (_, c) => c.toUpperCase())
    .replace(/^(.)/, (_, c) => c.toUpperCase())
}

/**
 * Escape string for use in generated code
 */
function escapeString(str: string): string {
  return str.replace(/'/g, "\\'").replace(/\n/g, '\\n')
}
