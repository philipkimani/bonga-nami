/**
 * Code Execution Integration Test
 * 
 * Tests the /api/execute endpoint with real tool bindings.
 * Run with: pnpm tsx packages/clients/platform-client/test/execute-integration.test.ts
 */

const BASE_URL = process.env.TEST_URL || "http://localhost:3001";

interface ExecuteResponse {
  status: "success" | "error";
  data?: unknown;
  error?: string;
  execution_time_ms: number;
  tool_calls?: string[];
  tool_call_count?: number;
}

async function testExecute(code: string, description: string): Promise<void> {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`TEST: ${description}`);
  console.log(`${"=".repeat(60)}`);
  console.log(`Code:\n${code.trim()}\n`);

  try {
    const response = await fetch(`${BASE_URL}/api/execute`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Tenant-ID": "test-tenant",
      },
      body: JSON.stringify({
        code,
        conversation_id: `test-${Date.now()}`,
        user_id: "test-user",
      }),
    });

    const result: ExecuteResponse = await response.json();

    console.log(`Status: ${result.status}`);
    console.log(`Execution Time: ${result.execution_time_ms}ms`);
    
    if (result.tool_calls) {
      console.log(`Tool Calls: ${result.tool_calls.join(", ")} (${result.tool_call_count} total)`);
    }

    if (result.status === "success") {
      console.log(`Result:`, JSON.stringify(result.data, null, 2));
    } else {
      console.log(`Error: ${result.error}`);
    }
  } catch (err) {
    console.error(`Request failed:`, err);
  }
}

async function runTests() {
  console.log(`\nTesting Code Execution at: ${BASE_URL}`);
  console.log(`${"=".repeat(60)}\n`);

  // Test 1: Simple search
  await testExecute(
    `
    const products = await searchProducts({ query: 'laptop', limit: 3 });
    return products;
    `,
    "Simple product search"
  );

  // Test 2: Search with filtering (handle API response structure)
  await testExecute(
    `
    const result = await searchProducts({ query: 'phone', limit: 10 });
    const products = result.products || [];
    const affordable = products.filter(p => parseFloat(String(p.price).replace(/[^0-9.]/g, '')) < 500);
    return {
      total: products.length,
      affordable: affordable.length,
      products: affordable.slice(0, 3).map(p => ({ name: p.name, price: p.price }))
    };
    `,
    "Search with price filtering"
  );

  // Test 3: Multi-step workflow - Search then Add to Cart
  await testExecute(
    `
    // Step 1: Search for products
    const searchResult = await searchProducts({ query: 'headphones', limit: 3 });
    const products = searchResult.products || [];
    
    if (products.length === 0) {
      return { error: 'No products found' };
    }
    
    // Step 2: Add first product to cart
    const firstProduct = products[0];
    const cartResult = await addToCart({ productId: firstProduct.id, quantity: 2 });
    
    // Step 3: Get cart to verify
    const cart = await getCart({});
    
    return {
      searchFound: products.length,
      addedProduct: firstProduct.name,
      cartResult: cartResult,
      currentCart: cart
    };
    `,
    "Multi-step: Search → Add to Cart → View Cart"
  );

  // Test 4: Complete checkout flow
  await testExecute(
    `
    // Search for a product
    const result = await searchProducts({ query: 'watch', limit: 1 });
    const products = result.products || [];
    
    if (products.length === 0) {
      return { error: 'No products found' };
    }
    
    // Add to cart
    await addToCart({ productId: products[0].id, quantity: 1 });
    
    // Get cart summary
    const cart = await getCart({});
    
    return {
      addedProduct: products[0].name,
      cart: cart
    };
    `,
    "Search → Add to Cart → View Cart"
  );

  // Test 5: Error handling (bad syntax)
  await testExecute(
    `
    const x = await searchProducts({ query: 'test' }
    return x;
    `,
    "Error handling - syntax error"
  );

  console.log(`\n${"=".repeat(60)}`);
  console.log("TESTS COMPLETE");
  console.log(`${"=".repeat(60)}\n`);
}

// Also test the helper endpoints
async function testHelperEndpoints() {
  console.log(`\nTesting Helper Endpoints`);
  console.log(`${"=".repeat(60)}\n`);

  // Test /api/execute/tools
  try {
    const toolsResponse = await fetch(`${BASE_URL}/api/execute/tools`, {
      headers: { "X-Tenant-ID": "test-tenant" },
    });
    const tools = await toolsResponse.json();
    console.log("Available Tools:", JSON.stringify(tools, null, 2));
  } catch (err) {
    console.error("Failed to fetch tools:", err);
  }

  // Test /api/execute/health
  try {
    const healthResponse = await fetch(`${BASE_URL}/api/execute/health`);
    const health = await healthResponse.json();
    console.log("\nHealth Check:", JSON.stringify(health, null, 2));
  } catch (err) {
    console.error("Failed health check:", err);
  }
}

// Run all tests
async function main() {
  await testHelperEndpoints();
  await runTests();
}

main().catch(console.error);
