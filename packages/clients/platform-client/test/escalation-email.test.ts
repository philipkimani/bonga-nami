import { describe, it, expect } from "vitest";
import { escalate, getQueue, getQueueStats } from "../src/routes/admin-assistant/escalation.js";

describe("escalation email channel", () => {
  it("accepts an email escalation and lists it under the email queue", async () => {
    const entry = await escalate({
      channel: "email",
      conversationId: "conv-email-1",
      contactEmail: "jane@example.com",
      reason: "complaint",
      lastMessage: "I want a refund",
    });
    expect(entry.channel).toBe("email");
    expect(entry.contactEmail).toBe("jane@example.com");

    const emailQueue = getQueue("email");
    expect(emailQueue.some((e) => e.conversationId === "conv-email-1")).toBe(true);
    expect(getQueueStats().byChannel.email).toBeGreaterThanOrEqual(1);
  });
});
