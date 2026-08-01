import { describe, it, expect } from "vitest";
import { CSP_DIRECTIVES } from "../src/security/csp.js";

/**
 * Regression: voice mode reported "unavailable in this browser" on the live
 * deployment. The cause was this policy, not the browser - the voice SDK builds
 * its audio worklet at runtime and loads it from a blob: URL, falling back to a
 * data: URL. With neither permitted, addModule() rejects and the SDK throws an
 * error naming the browser.
 */
describe("CSP allows the voice SDK to load its audio worklet", () => {
  for (const directive of ["scriptSrc", "workerSrc"] as const) {
    it(`${directive} permits blob: and data: worklet sources`, () => {
      const sources = CSP_DIRECTIVES[directive];
      expect(sources, `${directive} must be declared`).toBeDefined();
      expect(sources).toContain("blob:");
      expect(sources).toContain("data:");
    });
  }

  it("declares worker-src rather than relying on the default-src fallback", () => {
    // Without an explicit worker-src, workers/worklets fall back to default-src,
    // which is 'self' only - the exact condition that broke voice.
    expect(CSP_DIRECTIVES.workerSrc).toBeDefined();
    expect(CSP_DIRECTIVES.defaultSrc).toEqual(["'self'"]);
  });

  it("still reaches the conversational API over websocket", () => {
    expect(CSP_DIRECTIVES.connectSrc).toContain("wss://api.elevenlabs.io");
  });
});
