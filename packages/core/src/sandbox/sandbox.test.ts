/**
 * Sandbox Integration Test
 * 
 * This file demonstrates how a CLIENT would use the sandbox.
 * Run with: npx tsx packages/core/src/sandbox/sandbox.test.ts
 */

import { createSandbox } from './executor.js'
import { generateBindings } from './binding-generator.js'
import { buildCodeExecutionPrompt } from './prompt-templates.js'
import type { SandboxToolDefinition } from './types.js'

// =============================================================================
// EXAMPLE: E-commerce Client Setup
// =============================================================================

// Step 1: Client defines their MCP tools
const ecommerceTools: SandboxToolDefinition[] = [
  {
    name: 'searchProducts',
    description: 'Search for products by query, category, or filters',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        category: { type: 'string', description: 'Product category' },
        minPrice: { type: 'number', description: 'Minimum price' },
        maxPrice: { type: 'number', description: 'Maximum price' },
        limit: { type: 'number', description: 'Max results to return' },
      },
      required: ['query'],
    },
  },
  {
    name: 'getProductDetails',
    description: 'Get detailed information about a specific product',
    parameters: {
      type: 'object',
      properties: {
        productId: { type: 'string', description: 'Product ID' },
      },
      required: ['productId'],
    },
  },
  {
    name: 'getInventory',
    description: 'Check inventory/stock for a product',
    parameters: {
      type: 'object',
      properties: {
        productId: { type: 'string', description: 'Product ID' },
      },
      required: ['productId'],
    },
  },
  {
    name: 'addToCart',
    description: 'Add a product to the shopping cart',
    parameters: {
      type: 'object',
      properties: {
        productId: { type: 'string', description: 'Product ID' },
        quantity: { type: 'number', description: 'Quantity to add' },
      },
      required: ['productId', 'quantity'],
    },
  },
]

// Step 2: Generate TypeScript bindings (client does this once during setup)
console.log('=== Generated TypeScript Bindings ===\n')
const bindings = generateBindings({
  tools: ecommerceTools,
  format: 'typescript',
  includeJsDoc: true,
})
console.log(bindings.types)
console.log('\n--- Code ---\n')
console.log(bindings.code)

// Step 3: Build system prompt addition
console.log('\n=== System Prompt Addition ===\n')
const toolDescriptions = ecommerceTools
  .map(t => `- ${t.name}: ${t.description}`)
  .join('\n')
const promptAddition = buildCodeExecutionPrompt(toolDescriptions)
console.log(promptAddition)

// Step 4: Create sandbox with mock tool implementations
// In production, these would call the client's actual backend APIs
const mockProducts = [
  { id: 'p1', name: 'Nike Air Max', price: 120, category: 'shoes', brand: 'Nike' },
  { id: 'p2', name: 'Adidas Runner', price: 90, category: 'shoes', brand: 'Adidas' },
  { id: 'p3', name: 'Nike Zoom', price: 150, category: 'shoes', brand: 'Nike' },
  { id: 'p4', name: 'Puma Speed', price: 80, category: 'shoes', brand: 'Puma' },
]

const mockInventory: Record<string, number> = {
  p1: 10,
  p2: 0, // Out of stock
  p3: 5,
  p4: 3,
}

const sandbox = createSandbox({
  tools: {
    searchProducts: async (params: any) => {
      console.log(`  [Tool Call] searchProducts(${JSON.stringify(params)})`)
      let results = mockProducts
      if (params.query) {
        const q = params.query.toLowerCase()
        results = results.filter(p => 
          p.name.toLowerCase().includes(q) || 
          p.brand.toLowerCase().includes(q)
        )
      }
      if (params.maxPrice) {
        results = results.filter(p => p.price <= params.maxPrice)
      }
      if (params.limit) {
        results = results.slice(0, params.limit)
      }
      return results
    },
    
    getProductDetails: async (params: any) => {
      console.log(`  [Tool Call] getProductDetails(${JSON.stringify(params)})`)
      return mockProducts.find(p => p.id === params.productId) || null
    },
    
    getInventory: async (params: any) => {
      console.log(`  [Tool Call] getInventory(${JSON.stringify(params)})`)
      return { 
        productId: params.productId, 
        quantity: mockInventory[params.productId] ?? 0 
      }
    },
    
    addToCart: async (params: any) => {
      console.log(`  [Tool Call] addToCart(${JSON.stringify(params)})`)
      return { success: true, cartItemId: 'cart-123', ...params }
    },
  },
  timeout: 5000,
  enableLogging: true,
})

// =============================================================================
// Test Executions
// =============================================================================

async function runTests() {
  console.log('\n=== Test 1: Simple Search ===\n')
  
  // This is what the LLM would generate
  const simpleResult = await sandbox.execute(`
    const products = await searchProducts({ query: 'nike' });
    return products;
  `)
  
  console.log('Result:', JSON.stringify(simpleResult.data, null, 2))
  console.log('Execution time:', simpleResult.executionTimeMs.toFixed(2), 'ms')
  console.log('Tool calls:', simpleResult.context.toolCalls.length)
  
  // -------------------------------------------------------------------------
  
  console.log('\n=== Test 2: Multi-Step with Inventory Check ===\n')
  
  // This replaces what would be 4+ separate tool calls
  const complexResult = await sandbox.execute(`
    // Step 1: Search for Nike products under $130
    const products = await searchProducts({ 
      query: 'nike',
      maxPrice: 130 
    });
    
    // Step 2: Check inventory for each product
    const withInventory = await Promise.all(
      products.map(async (product) => {
        const inv = await getInventory({ productId: product.id });
        return {
          ...product,
          inStock: inv.quantity > 0,
          stockLevel: inv.quantity,
        };
      })
    );
    
    // Step 3: Filter to only in-stock items
    const available = withInventory.filter(p => p.inStock);
    
    return {
      searchQuery: 'Nike products under $130',
      totalFound: products.length,
      inStock: available.length,
      products: available,
    };
  `)
  
  console.log('Result:', JSON.stringify(complexResult.data, null, 2))
  console.log('Execution time:', complexResult.executionTimeMs.toFixed(2), 'ms')
  console.log('Tool calls:', complexResult.context.toolCalls.length)
  console.log('Tools called:', complexResult.context.toolCalls.map(c => c.toolName).join(', '))
  
  // -------------------------------------------------------------------------
  
  console.log('\n=== Test 3: Error Handling ===\n')
  
  const errorResult = await sandbox.execute(`
    // Intentional error - invalid syntax
    const x = await searchProducts({ query: 'test' }
    return x;
  `)
  
  console.log('Success:', errorResult.success)
  console.log('Error:', errorResult.error)
  
  // -------------------------------------------------------------------------
  
  console.log('\n=== Test 4: Timeout Protection ===\n')
  
  // Create a sandbox with short timeout
  const quickSandbox = createSandbox({
    tools: {
      slowOperation: async () => {
        await new Promise(resolve => setTimeout(resolve, 10000))
        return 'done'
      },
    },
    timeout: 100, // 100ms timeout
  })
  
  const timeoutResult = await quickSandbox.execute(`
    const result = await slowOperation({});
    return result;
  `)
  
  console.log('Success:', timeoutResult.success)
  console.log('Error:', timeoutResult.error)
  
  // -------------------------------------------------------------------------
  
  console.log('\n=== Summary: Cost Savings ===\n')
  
  console.log('Traditional approach (Test 2 scenario):')
  console.log('  - 1 searchProducts call')
  console.log('  - 2 getInventory calls (one per product)')
  console.log('  - Total: 3+ LLM round trips with tokens for each')
  console.log('')
  console.log('Code execution approach:')
  console.log('  - 1 code generation')
  console.log('  - All tools executed locally')
  console.log('  - 1 result returned')
  console.log('')
  console.log('Estimated savings: 60-80% token reduction')
}

// Run tests
runTests().catch(console.error)
