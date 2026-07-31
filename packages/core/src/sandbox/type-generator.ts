/**
 * Type Generator
 * 
 * Generates TypeScript types from JSON Schema definitions.
 * Used to create type-safe interfaces for tool parameters and responses.
 */

import type { JSONSchema } from './types.js'

export interface TypeGeneratorConfig {
  /** Schema to generate types from */
  schema: JSONSchema
  
  /** Name for the generated type */
  typeName: string
  
  /** Whether to export the type */
  export?: boolean
}

/**
 * Generate TypeScript type definition from JSON Schema
 */
export function generateTypes(config: TypeGeneratorConfig): string {
  const { schema, typeName, export: shouldExport = true } = config
  
  const exportKeyword = shouldExport ? 'export ' : ''
  const typeDefinition = schemaToType(schema, 0)
  
  return `${exportKeyword}type ${typeName} = ${typeDefinition}`
}

/**
 * Generate TypeScript interface from JSON Schema object
 */
export function generateInterface(
  schema: JSONSchema, 
  interfaceName: string, 
  shouldExport = true
): string {
  if (schema.type !== 'object') {
    throw new Error('generateInterface requires an object schema')
  }
  
  const lines: string[] = []
  const exportKeyword = shouldExport ? 'export ' : ''
  
  lines.push(`${exportKeyword}interface ${interfaceName} {`)
  
  if (schema.properties) {
    for (const [propName, propSchema] of Object.entries(schema.properties)) {
      const isRequired = schema.required?.includes(propName)
      const optional = isRequired ? '' : '?'
      const typeStr = schemaToType(propSchema, 1)
      
      if (propSchema.description) {
        lines.push(`  /** ${propSchema.description} */`)
      }
      
      lines.push(`  ${propName}${optional}: ${typeStr}`)
    }
  }
  
  lines.push('}')
  
  return lines.join('\n')
}

/**
 * Convert JSON Schema to TypeScript type string
 */
function schemaToType(schema: JSONSchema, depth: number): string {
  const indent = '  '.repeat(depth)
  
  switch (schema.type) {
    case 'string':
      if (schema.enum) {
        return schema.enum.map(e => `'${e}'`).join(' | ')
      }
      return 'string'
      
    case 'number':
      return 'number'
      
    case 'boolean':
      return 'boolean'
      
    case 'array':
      if (schema.items) {
        const itemType = schemaToType(schema.items, depth)
        return `${itemType}[]`
      }
      return 'unknown[]'
      
    case 'object':
      if (!schema.properties) {
        return 'Record<string, unknown>'
      }
      
      const propLines: string[] = []
      propLines.push('{')
      
      for (const [propName, propSchema] of Object.entries(schema.properties)) {
        const isRequired = schema.required?.includes(propName)
        const optional = isRequired ? '' : '?'
        const typeStr = schemaToType(propSchema, depth + 1)
        propLines.push(`${indent}  ${propName}${optional}: ${typeStr}`)
      }
      
      propLines.push(`${indent}}`)
      return propLines.join('\n')
      
    default:
      return 'unknown'
  }
}

/**
 * Generate types for multiple schemas at once
 */
export function generateMultipleTypes(
  schemas: Array<{ schema: JSONSchema; name: string }>
): string {
  return schemas
    .map(({ schema, name }) => generateTypes({ schema, typeName: name }))
    .join('\n\n')
}
