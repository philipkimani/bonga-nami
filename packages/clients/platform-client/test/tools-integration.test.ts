/**
 * Tools Integration Tests
 * 
 * Tests the ElevenLabs tools webhook flow end-to-end.
 * Run with: pnpm test
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { globalToolRegistry, type ToolDefinition, type ToolExecutionContext } from "@platform/core";

// Mock ecommerce tool definitions for testing
const mockToolDefinitions: ToolDefinition[] = [
  {
    id: "test.search_products",
    name: "search_products",
    description: "Search for products in the catalog",
    executionContext: "server",
    extensionId: "test",
    webhookPath: "/api/tools/test/search_products",
    parameters: [
      { name: "query", type: "string", description: "Search query", required: true },
    ],
  },
  {
    id: "test.show_alert",
    name: "show_alert",
    description: "Show an alert in the browser",
    executionContext: "client",
    extensionId: "test",
    parameters: [
      { name: "message", type: "string", description: "Alert message", required: true },
    ],
  },
];

describe("Tool Registry", () => {
  beforeAll(() => {
    // Clear and register test tools
    globalToolRegistry.clear();
    
    mockToolDefinitions.forEach(def => {
      globalToolRegistry.register(def, async (params) => {
        if (def.id === "test.search_products") {
          // Handler returns ToolResult format
          return {
            success: true,
            data: {
              products: [
                { id: "1", name: `Result for: ${params.query}`, price: 99.99 }
              ]
            }
          };
        }
        return { success: true };
      });
    });
  });

  afterAll(() => {
    globalToolRegistry.clear();
  });

  describe("Registration", () => {
    it("should register tools correctly", () => {
      const tools = globalToolRegistry.getAll();
      expect(tools.length).toBe(2);
    });

    it("should get tool by id", () => {
      const tool = globalToolRegistry.get("test.search_products");
      expect(tool).toBeDefined();
      expect(tool?.definition.name).toBe("search_products");
    });

    it("should separate server and client tools", () => {
      const serverTools = globalToolRegistry.getServerTools();
      const clientTools = globalToolRegistry.getClientTools();
      
      expect(serverTools.length).toBe(1);
      expect(clientTools.length).toBe(1);
      expect(serverTools[0].definition.id).toBe("test.search_products");
      expect(clientTools[0].definition.id).toBe("test.show_alert");
    });
  });

  describe("Execution", () => {
    it("should execute server tool with params", async () => {
      const context: ToolExecutionContext = {
        tenantId: "test-tenant",
        sessionId: "test-session",
        requestId: "test-request",
      };

      const result = await globalToolRegistry.execute(
        "test.search_products",
        { query: "shoes" },
        context
      );

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      // @ts-expect-error - testing dynamic data
      expect(result.data.products).toHaveLength(1);
      // @ts-expect-error - testing dynamic data
      expect(result.data.products[0].name).toContain("shoes");
    });

    it("should return error for non-existent tool", async () => {
      const context: ToolExecutionContext = {
        tenantId: "test-tenant",
        sessionId: "test-session",
        requestId: "test-request",
      };

      const result = await globalToolRegistry.execute(
        "nonexistent.tool",
        {},
        context
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("not found");
    });

    it("should track execution duration", async () => {
      const context: ToolExecutionContext = {
        tenantId: "test-tenant",
        sessionId: "test-session",
        requestId: "test-request",
      };

      const result = await globalToolRegistry.execute(
        "test.search_products",
        { query: "test" },
        context
      );

      expect(result.durationMs).toBeDefined();
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe("ElevenLabs Config Generation", () => {
    it("should generate ElevenLabs tool config", () => {
      const baseUrl = "https://example.com/api/tools";
      const config = globalToolRegistry.generateElevenLabsConfig(baseUrl) as any[];

      expect(config).toHaveLength(1); // Only server tools
      expect(config[0].name).toBe("search_products");
      expect(config[0].description).toBe("Search for products in the catalog");
      expect(config[0].webhook).toBeDefined();      // webhookPath is /api/tools/test/search_products      expect(config[0].webhook.url).toBe(`${baseUrl}/api/tools/test/search_products`);
    });
  });
});
