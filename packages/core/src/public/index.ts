/**
 * PUBLIC API - Platform Core
 * 
 * This is the ONLY surface clients are allowed to import.
 * Everything else in core is internal and subject to change.
 * 
 * Import like this:
 *   import { globalToolRegistry, TenantContext } from "@platform/core"
 */

// Extension system (for organizing tools by domain)
export * from "./extensions.js";
export * from "./extension-factory.js";

// Observability & Logging
export * from "./observability.js";
export * from "./logger.js";

// Multi-tenant support
export * from "./tenant.js";

// ElevenLabs Tools Integration
export * from "./tools.js";

// System Prompt Builder
export * from "./prompt-builder.js";

// Analytics & Metrics
export * from "./analytics.js";

// Middleware (for Express apps)
export * from "../middleware/index.js";