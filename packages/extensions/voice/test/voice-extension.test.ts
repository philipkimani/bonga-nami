/**
 * Voice Extension Tests
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createVoiceExtension } from "../src/voice-extension.js";
import { MockVoiceBackend } from "../src/backend/mock-backend.js";
import type { ExtensionContext } from "@platform/core";

describe("Voice Extension", () => {
  let mockBackend: MockVoiceBackend;

  beforeEach(() => {
    mockBackend = new MockVoiceBackend();
    mockBackend.reset();
  });

  function createMockContext(tenantId = "test-client"): ExtensionContext {
    return {
      tenant: {
        tenantId,
        role: "client_user",
        requestId: `req-${Date.now()}`,
        sessionId: `sess-${Date.now()}`,
      },
      clientId: tenantId,
      requestId: `req-${Date.now()}`,
    };
  }

  describe("createVoiceExtension", () => {
    it("should create extension with mock backend", () => {
      const extension = createVoiceExtension({ backend: "mock" });
      expect(extension).toBeDefined();
      expect(extension.onInitialize).toBeDefined();
      expect(extension.beforeResponse).toBeDefined();
    });

    it("should initialize without error", async () => {
      const extension = createVoiceExtension({ backend: "mock", debug: true });
      await expect(extension.onInitialize?.()).resolves.toBeUndefined();
    });
  });

  describe("Voice Config Intent", () => {
    it("should respond to 'voice config' intent", async () => {
      const extension = createVoiceExtension({ backend: "mock" });
      const context = createMockContext();

      await extension.beforeResponse?.("show me voice config", context);

      expect(context.response).toBeDefined();
      expect(context.response?.message).toContain("Voice Configuration");
      expect(context.response?.message).toContain("Demo Assistant");
    });

    it("should handle missing config gracefully", async () => {
      const extension = createVoiceExtension({ backend: "mock" });
      const context = createMockContext("unknown-tenant");

      await extension.beforeResponse?.("voice settings", context);

      expect(context.response).toBeDefined();
      expect(context.response?.message).toContain("AI Assistant");
    });
  });

  describe("Rate Limiting (DISABLED)", () => {
    it("should always allow requests (rate limiting disabled)", async () => {
      const result = await mockBackend.checkRateLimits("platform-client");
      
      expect(result.allowed).toBe(true);
      expect(result.remaining?.messagesPerMinute).toBeGreaterThan(0);
    });

    it("should allow unlimited concurrent sessions (rate limiting disabled)", async () => {
      // Create more sessions than the "limit" would allow
      for (let i = 0; i < 10; i++) {
        await mockBackend.createSession("platform-client", `user-${i}`, "voice");
      }

      const result = await mockBackend.checkRateLimits("platform-client");
      
      // Rate limiting is disabled, so this should still be allowed
      expect(result.allowed).toBe(true);
    });
  });

  describe("Session Management", () => {
    it("should create and track sessions", async () => {
      const session = await mockBackend.createSession(
        "platform-client",
        "user-123",
        "text"
      );

      expect(session.sessionId).toBeDefined();
      expect(session.tenantId).toBe("platform-client");
      expect(session.status).toBe("active");
    });

    it("should end sessions and calculate duration", async () => {
      const session = await mockBackend.createSession(
        "platform-client",
        "user-123",
        "voice"
      );

      // Wait a bit
      await new Promise((r) => setTimeout(r, 100));

      const endedSession = await mockBackend.endSession(session.sessionId);

      expect(endedSession.status).toBe("ended");
      expect(endedSession.endedAt).toBeDefined();
      expect(endedSession.voiceDurationSeconds).toBeGreaterThanOrEqual(0);
    });

    it("should record usage metrics", async () => {
      const session = await mockBackend.createSession(
        "platform-client",
        "user-123",
        "text"
      );

      await mockBackend.recordUsage(session.sessionId, { messageCount: 5 });

      const metrics = await mockBackend.getUsageMetrics(
        "platform-client",
        new Date(Date.now() - 3600000),
        new Date()
      );

      expect(metrics.textMessageCount).toBe(5);
    });
  });

  describe("Public Config", () => {
    it("should return safe public config without secrets", async () => {
      const config = await mockBackend.getPublicConfig("platform-client");

      expect(config.agentId).toBeDefined();
      expect(config.agentName).toBe("Demo Assistant");
      expect(config.voiceEnabled).toBe(true);
      
      // Ensure no sensitive data
      expect((config as any).apiKey).toBeUndefined();
      expect((config as any).rateLimits).toBeUndefined();
    });
  });
});
