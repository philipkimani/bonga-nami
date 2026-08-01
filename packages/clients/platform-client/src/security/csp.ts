/**
 * Content Security Policy directives for the platform.
 *
 * Extracted from server.ts so the policy can be asserted in tests. A CSP that is
 * too tight fails silently in production - the browser blocks a resource, the SDK
 * reports a generic error, and the user sees a capability as "unsupported".
 */

/**
 * The voice SDK loads its audio worklet processors by generating the module
 * source at runtime: it creates a `blob:` URL first and falls back to a
 * `data:` URL. Both must be permitted or `audioWorklet.addModule()` throws
 * "Make sure the browser supports AudioWorklets" - blaming the browser for
 * what is actually our header. Worklets are governed by script-src in Chromium
 * and by worker-src in some other engines, so both directives carry them.
 */
const WORKLET_SOURCES = ["blob:", "data:"];

export const CSP_DIRECTIVES: Record<string, string[]> = {
  defaultSrc: ["'self'"],
  scriptSrc: ["'self'", "'unsafe-inline'", "https://elevenlabs.io", ...WORKLET_SOURCES],
  workerSrc: ["'self'", ...WORKLET_SOURCES],
  styleSrc: ["'self'", "'unsafe-inline'"],
  imgSrc: ["'self'", "data:", "https:"],
  connectSrc: ["'self'", "wss://api.elevenlabs.io", "https://api.elevenlabs.io"],
  frameSrc: ["'self'"],
};
