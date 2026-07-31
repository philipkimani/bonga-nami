/**
 * OpenAPI to ElevenLabs Tool Generator
 * 
 * Generates ElevenLabs-compatible tool definitions from OpenAPI/Swagger specs.
 * Clients provide their API spec, we generate ready-to-paste tool JSON.
 * 
 * Usage:
 *   npx ts-node openapi-to-elevenlabs.ts path/to/openapi.json
 *   npx ts-node openapi-to-elevenlabs.ts https://api.example.com/openapi.json
 * 
 * Output: ElevenLabs tool definitions ready to paste into the console
 */

import * as fs from 'fs'
import * as path from 'path'

interface OpenAPISpec {
  openapi?: string
  swagger?: string
  info: {
    title: string
    description?: string
    version: string
  }
  servers?: Array<{ url: string; description?: string }>
  paths: Record<string, PathItem>
  components?: {
    schemas?: Record<string, SchemaObject>
  }
}

interface PathItem {
  get?: Operation
  post?: Operation
  put?: Operation
  patch?: Operation
  delete?: Operation
  summary?: string
  description?: string
}

interface Operation {
  operationId?: string
  summary?: string
  description?: string
  tags?: string[]
  parameters?: Parameter[]
  requestBody?: RequestBody
  responses?: Record<string, Response>
}

interface Parameter {
  name: string
  in: 'query' | 'path' | 'header' | 'cookie'
  description?: string
  required?: boolean
  schema?: SchemaObject
}

interface RequestBody {
  description?: string
  required?: boolean
  content?: {
    'application/json'?: {
      schema?: SchemaObject
    }
  }
}

interface Response {
  description?: string
  content?: Record<string, { schema?: SchemaObject }>
}

interface SchemaObject {
  type?: string
  format?: string
  description?: string
  properties?: Record<string, SchemaObject>
  required?: string[]
  items?: SchemaObject
  enum?: string[]
  $ref?: string
}

interface ElevenLabsTool {
  type: "webhook"
  name: string
  description: string
  api_schema: {
    url: string
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
    path_params_schema: Array<{
      name: string
      type: string
      description?: string
      required: boolean
    }>
    query_params_schema: Array<{
      name: string
      type: string
      description?: string
      required: boolean
      enum?: string[]
    }>
    request_body_schema: {
      type: string
      properties: Record<string, { type: string; description?: string; enum?: string[] }>
      required: string[]
    } | null
    request_headers: Array<{ name: string; value: string }>
    auth_connection: string | null
  }
  response_timeout_secs: number
  dynamic_variables: {
    dynamic_variable_placeholders: Record<string, unknown>
  }
  assignments: Array<unknown>
  disable_interruptions: boolean
  force_pre_tool_speech: "auto" | "always" | "never"
  tool_call_sound: string | null
  tool_call_sound_behavior: "auto" | "always" | "never"
  execution_mode: "immediate" | "deferred"
}

/**
 * Convert OpenAPI schema to ElevenLabs parameter type
 */
function schemaToElevenLabsType(schema: SchemaObject | undefined): string {
  if (!schema) return 'string'
  if (schema.$ref) return 'object' // Complex types become objects
  
  switch (schema.type) {
    case 'integer':
    case 'number':
      return 'number'
    case 'boolean':
      return 'boolean'
    case 'array':
      return 'array'
    case 'object':
      return 'object'
    default:
      return 'string'
  }
}

/**
 * Generate a tool name from path and method
 */
function generateToolName(path: string, method: string, operationId?: string): string {
  if (operationId) {
    // Convert camelCase or snake_case to consistent snake_case
    return operationId.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '')
  }
  
  // Generate from path
  const parts = path.split('/').filter(p => p && !p.startsWith('{'))
  const resource = parts[parts.length - 1] || 'resource'
  
  const methodPrefix = {
    get: parts.length > 1 ? 'get' : 'list',
    post: 'create',
    put: 'update',
    patch: 'update',
    delete: 'delete',
  }[method] || method
  
  return `${methodPrefix}_${resource}`.toLowerCase().replace(/-/g, '_')
}

/**
 * Extract path parameters schema from an OpenAPI operation
 */
function extractPathParamsSchema(
  operation: Operation,
  pathParams: string[]
): ElevenLabsTool['api_schema']['path_params_schema'] {
  const schema: ElevenLabsTool['api_schema']['path_params_schema'] = []
  
  pathParams.forEach(param => {
    const opParam = operation.parameters?.find(p => p.name === param && p.in === 'path')
    schema.push({
      name: param,
      type: opParam ? schemaToElevenLabsType(opParam.schema) : 'string',
      description: opParam?.description || `The ${param.replace(/_/g, ' ')} identifier`,
      required: true,
    })
  })
  
  return schema
}

/**
 * Extract query parameters schema from an OpenAPI operation
 */
function extractQueryParamsSchema(
  operation: Operation
): ElevenLabsTool['api_schema']['query_params_schema'] {
  const schema: ElevenLabsTool['api_schema']['query_params_schema'] = []
  
  operation.parameters?.forEach(param => {
    if (param.in === 'query') {
      schema.push({
        name: param.name,
        type: schemaToElevenLabsType(param.schema),
        description: param.description,
        required: param.required || false,
        enum: param.schema?.enum as string[],
      })
    }
  })
  
  return schema
}

/**
 * Extract request body schema from an OpenAPI operation
 */
function extractRequestBodySchema(
  operation: Operation
): ElevenLabsTool['api_schema']['request_body_schema'] {
  const bodySchema = operation.requestBody?.content?.['application/json']?.schema
  if (!bodySchema?.properties) return null
  
  const properties: Record<string, { type: string; description?: string; enum?: string[] }> = {}
  
  Object.entries(bodySchema.properties).forEach(([name, schema]) => {
    properties[name] = {
      type: schemaToElevenLabsType(schema),
      description: schema.description,
      enum: schema.enum as string[],
    }
  })
  
  return {
    type: 'object',
    properties,
    required: bodySchema.required || [],
  }
}

/**
 * Extract path parameters from a path string
 */
function extractPathParams(path: string): string[] {
  const matches = path.match(/\{([^}]+)\}/g) || []
  return matches.map(m => m.slice(1, -1))
}

/**
 * Convert an OpenAPI spec to ElevenLabs tools
 */
export function convertOpenAPIToElevenLabsTools(
  spec: OpenAPISpec,
  baseUrl: string = 'https://YOUR-SERVER.railway.app'
): ElevenLabsTool[] {
  const tools: ElevenLabsTool[] = []
  
  // Use server URL from spec if available
  const serverUrl = spec.servers?.[0]?.url || baseUrl
  
  for (const [path, pathItem] of Object.entries(spec.paths)) {
    const methods = ['get', 'post', 'put', 'patch', 'delete'] as const
    const pathParams = extractPathParams(path)
    
    for (const method of methods) {
      const operation = pathItem[method]
      if (!operation) continue
      
      // Skip internal/admin endpoints
      if (operation.tags?.some(t => ['admin', 'internal'].includes(t.toLowerCase()))) {
        continue
      }
      
      const toolName = generateToolName(path, method, operation.operationId)
      
      // Build description
      let description = operation.summary || operation.description || `${method.toUpperCase()} ${path}`
      if (description.length > 200) {
        description = description.substring(0, 197) + '...'
      }
      
      // Build webhook URL - keep path params in OpenAPI format for the URL
      const webhookUrl = `${serverUrl}${path}`
      
      const tool: ElevenLabsTool = {
        type: 'webhook',
        name: toolName,
        description,
        api_schema: {
          url: webhookUrl,
          method: method.toUpperCase() as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
          path_params_schema: extractPathParamsSchema(operation, pathParams),
          query_params_schema: extractQueryParamsSchema(operation),
          request_body_schema: extractRequestBodySchema(operation),
          request_headers: [],
          auth_connection: null,
        },
        response_timeout_secs: 20,
        dynamic_variables: {
          dynamic_variable_placeholders: {},
        },
        assignments: [],
        disable_interruptions: false,
        force_pre_tool_speech: 'auto',
        tool_call_sound: null,
        tool_call_sound_behavior: 'auto',
        execution_mode: 'immediate',
      }
      
      tools.push(tool)
    }
  }
  
  return tools
}

/**
 * Format tools as ElevenLabs-ready JSON
 */
export function formatForElevenLabs(tools: ElevenLabsTool[]): string {
  return JSON.stringify(
    {
      note: 'Copy each tool definition to your ElevenLabs Agent console',
      generated_at: new Date().toISOString(),
      tool_count: tools.length,
      tools: tools,
    },
    null,
    2
  )
}

/**
 * Generate a summary of the tools
 */
export function generateToolSummary(tools: ElevenLabsTool[]): string {
  const lines = [
    '# Generated ElevenLabs Tools',
    '',
    `Generated ${tools.length} tools from OpenAPI spec.`,
    '',
    '## Tool List:',
    '',
  ]
  
  tools.forEach((tool, i) => {
    lines.push(`${i + 1}. **${tool.name}**: ${tool.description}`)
    lines.push(`   - Type: ${tool.type}`)
    lines.push(`   - Method: ${tool.api_schema.method}`)
    lines.push(`   - URL: ${tool.api_schema.url}`)
    lines.push('')
  })
  
  lines.push('## How to Use:')
  lines.push('')
  lines.push('1. Open your ElevenLabs Agent console')
  lines.push('2. Go to Tools section')
  lines.push('3. Click "Add tool" → "Webhook"')
  lines.push('4. Copy the JSON for each tool')
  lines.push('5. Update the server URL to your actual deployment')
  
  return lines.join('\n')
}

// CLI entrypoint
async function main() {
  const args = process.argv.slice(2)
  
  if (args.length === 0) {
    console.log(`
OpenAPI to ElevenLabs Tool Generator
=====================================

Usage:
  npx ts-node openapi-to-elevenlabs.ts <openapi-file-or-url> [options]

Options:
  --base-url <url>    Override the server URL (default: from spec or placeholder)
  --output <file>     Output file path (default: stdout)

Examples:
  npx ts-node openapi-to-elevenlabs.ts ./api-spec.json
  npx ts-node openapi-to-elevenlabs.ts https://api.example.com/openapi.json
  npx ts-node openapi-to-elevenlabs.ts ./spec.yaml --output tools.json
`)
    process.exit(0)
  }
  
  const specPath = args[0]
  let baseUrl = 'https://YOUR-SERVER.railway.app'
  let outputPath: string | null = null
  
  // Parse options
  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--base-url' && args[i + 1]) {
      baseUrl = args[++i]
    } else if (args[i] === '--output' && args[i + 1]) {
      outputPath = args[++i]
    }
  }
  
  // Load spec
  let spec: OpenAPISpec
  
  if (specPath.startsWith('http://') || specPath.startsWith('https://')) {
    // Fetch from URL
    const response = await fetch(specPath)
    spec = await response.json() as OpenAPISpec
  } else {
    // Read from file
    const content = fs.readFileSync(path.resolve(specPath), 'utf-8')
    spec = JSON.parse(content) as OpenAPISpec
  }
  
  console.log(`Loaded: ${spec.info.title} v${spec.info.version}`)
  
  // Convert
  const tools = convertOpenAPIToElevenLabsTools(spec, baseUrl)
  console.log(`Generated ${tools.length} tools`)
  
  // Output
  const output = formatForElevenLabs(tools)
  
  if (outputPath) {
    fs.writeFileSync(outputPath, output)
    console.log(`Written to: ${outputPath}`)
    
    // Also write summary
    const summaryPath = outputPath.replace(/\.json$/, '-summary.md')
    fs.writeFileSync(summaryPath, generateToolSummary(tools))
    console.log(`Summary: ${summaryPath}`)
  } else {
    console.log('\n' + output)
  }
}

// Run if called directly (ES module compatible)
const isMainModule = import.meta.url.endsWith(process.argv[1]?.replace(/\\/g, '/') || '')
if (isMainModule) {
  main().catch(console.error)
}
