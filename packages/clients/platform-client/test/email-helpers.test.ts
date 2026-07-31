import { describe, it, expect } from "vitest";
import {
  parseFromEmail,
  buildReplySubject,
  extractMessageId,
  buildThreadHeaders,
} from "../src/routes/admin-assistant/email.js";

describe("email helpers", () => {
  it("parseFromEmail extracts bare lowercased address", () => {
    expect(parseFromEmail('"Jane Doe" <Jane@Example.com>')).toBe("jane@example.com");
    expect(parseFromEmail("bob@example.com")).toBe("bob@example.com");
    expect(parseFromEmail("")).toBe("");
  });

  it("buildReplySubject prefixes Re: once", () => {
    expect(buildReplySubject("Help")).toBe("Re: Help");
    expect(buildReplySubject("Re: Help")).toBe("Re: Help");
    expect(buildReplySubject("RE: Help")).toBe("RE: Help");
    expect(buildReplySubject("")).toBe("Re: (no subject)");
  });

  it("extractMessageId pulls the Message-ID header value", () => {
    const raw = "From: a@b.com\r\nMessage-ID: <abc123@mail.example.com>\r\nSubject: Hi";
    expect(extractMessageId(raw)).toBe("<abc123@mail.example.com>");
    expect(extractMessageId("Subject: none")).toBeUndefined();
  });

  it("buildThreadHeaders sets In-Reply-To and References when present", () => {
    expect(buildThreadHeaders("<x@y>")).toEqual({ "In-Reply-To": "<x@y>", References: "<x@y>" });
    expect(buildThreadHeaders(undefined)).toEqual({});
  });
});
