import { describe, it, expect, vi } from "vitest";
import { processInbound } from "../src/routes/admin-assistant/email.js";

describe("processInbound", () => {
  it("threads a normal message and sends an AI reply with Re: subject + threading headers", async () => {
    const sendReply = vi.fn(async () => {});
    const getAiResponse = vi.fn(async () => "Here is your answer.");
    const result = await processInbound(
      {
        from: '"Jane" <jane@example.com>',
        subject: "Question about my policy",
        text: "How do I claim?",
        headers: "Message-ID: <parent@mail.example.com>\r\nSubject: Question about my policy",
      },
      { getAiResponse, sendReply },
    );

    expect(result.escalated).toBe(false);
    expect(getAiResponse).toHaveBeenCalledWith("jane@example.com", "How do I claim?", expect.any(Array));
    expect(sendReply).toHaveBeenCalledWith(
      "jane@example.com",
      "Re: Question about my policy",
      "Here is your answer.",
      { "In-Reply-To": "<parent@mail.example.com>", References: "<parent@mail.example.com>" },
    );
  });

  it("escalates on a keyword and does NOT call the AI", async () => {
    const sendReply = vi.fn(async () => {});
    const getAiResponse = vi.fn(async () => "should not be called");
    const result = await processInbound(
      { from: "bob@example.com", subject: "Angry", text: "I have a complaint about my policy", headers: "" },
      { getAiResponse, sendReply },
    );
    expect(result.escalated).toBe(true);
    expect(getAiResponse).not.toHaveBeenCalled();
    expect(sendReply).toHaveBeenCalledTimes(1); // acknowledgement reply
  });
});
