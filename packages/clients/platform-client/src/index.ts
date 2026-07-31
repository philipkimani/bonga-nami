/**
 * Platform Client Entry Point
 *
 * This file is for CLI testing only.
 * In production, server.ts is the entry point.
 */

import { tenantId } from "./config.js";

async function main() {
  console.log("[platform] Starting with tenant:", tenantId);
  console.log("[platform] All AI is handled by ElevenLabs Conversational AI.");
  console.log("[platform] Use server.ts for production.");
}

main();