import { describe, it, expect } from "vitest";
import { generateKeyPairSync, createSign } from "crypto";
import {
  verifyEventWebhookSignature,
  secretMatches,
} from "../src/routes/admin-assistant/email.js";

function signPayload(privateKey: any, timestamp: string, body: string): string {
  const sign = createSign("sha256");
  sign.update(Buffer.concat([Buffer.from(timestamp), Buffer.from(body)]));
  sign.end();
  return sign.sign(privateKey).toString("base64");
}

describe("SendGrid signature verification", () => {
  const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const pubB64 = publicKey.export({ type: "spki", format: "der" }).toString("base64");
  const timestamp = "1700000000";
  const body = JSON.stringify([{ event: "delivered", email: "a@b.com" }]);

  it("accepts a valid signature", () => {
    const sig = signPayload(privateKey, timestamp, body);
    expect(verifyEventWebhookSignature(pubB64, body, sig, timestamp)).toBe(true);
  });

  it("rejects a tampered body", () => {
    const sig = signPayload(privateKey, timestamp, body);
    expect(verifyEventWebhookSignature(pubB64, body + "x", sig, timestamp)).toBe(false);
  });

  it("rejects a mismatched timestamp", () => {
    const sig = signPayload(privateKey, timestamp, body);
    expect(verifyEventWebhookSignature(pubB64, body, sig, "1700000999")).toBe(false);
  });

  it("rejects empty inputs", () => {
    expect(verifyEventWebhookSignature("", body, "sig", timestamp)).toBe(false);
  });
});

describe("secretMatches", () => {
  it("matches equal secrets and rejects others", () => {
    expect(secretMatches("abc123", "abc123")).toBe(true);
    expect(secretMatches("abc123", "abc124")).toBe(false);
    expect(secretMatches("abc", "")).toBe(false);
    expect(secretMatches("", "abc")).toBe(false);
  });
});
