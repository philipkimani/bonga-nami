/**
 * Knowledge Base Extension Tests
 * 
 * Tests for the ElevenLabs Knowledge Base integration.
 */

import { describe, it, expect } from "vitest";
import { createKnowledgeBaseClient } from "../src/index.js";

describe("Knowledge Base Client", () => {
  describe("createKnowledgeBaseClient", () => {
    it("should create client with API key", () => {
      const client = createKnowledgeBaseClient({
        apiKey: "test-api-key",
      });
      
      expect(client).toBeDefined();
      expect(typeof client.listDocuments).toBe("function");
      expect(typeof client.uploadFile).toBe("function");
      expect(typeof client.addUrl).toBe("function");
      expect(typeof client.addText).toBe("function");
      expect(typeof client.deleteDocument).toBe("function");
    });

    it("should create client with custom base URL", () => {
      const client = createKnowledgeBaseClient({
        apiKey: "test-api-key",
        baseUrl: "https://custom.api.elevenlabs.io",
      });
      
      expect(client).toBeDefined();
    });
    
    it("should report config status correctly", () => {
      const client = createKnowledgeBaseClient({
        apiKey: "test-api-key",
        agentId: "agent-123",
      });
      
      expect(client.isConfigured()).toBe(true);
      
      const configInfo = client.getConfig();
      expect(configInfo.agentId).toBe("agent-123");
      // API key should not be exposed
      expect((configInfo as any).apiKey).toBeUndefined();
    });
  });
});
