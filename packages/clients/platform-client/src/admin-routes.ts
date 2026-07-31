import { Router } from "express";
import multer from "multer";
import fs from "fs";
import path from "path";

export const adminRouter = Router();

const upload = multer({ dest: "tmp/" });

// In-memory storage for context data and settings (replace with DB in production)
const contextDataStore: Record<string, Record<string, { value: any; description?: string; category?: string }>> = {};
const settingsStore: Record<string, {
  chatTitle: string;
  chatSubtitle: string;
  welcomeTitle: string;
  welcomeMessage: string;
  logoUrl: string;
  primaryColor: string;
  gradientStart: string;
  gradientEnd: string;
}> = {};

// Default settings
const defaultSettings = {
  chatTitle: "AI Assistant",
  chatSubtitle: "Powered by AI",
  welcomeTitle: "👋 Welcome!",
  welcomeMessage: "Start chatting to test the AI-powered assistant.",
  logoUrl: "",
  primaryColor: "#667eea",
  gradientStart: "#667eea",
  gradientEnd: "#764ba2"
};

// Helper to get tenant ID
function getTenantId(req: any): string {
  return req.headers['x-tenant-id'] || req.headers['x-client-id'] || 'default';
}

// ============================================================================
// SETTINGS ENDPOINTS
// ============================================================================

/**
 * GET /api/admin/settings
 * Get UI customization settings
 */
adminRouter.get("/settings", (req, res) => {
  const tenantId = getTenantId(req);
  const settings = settingsStore[tenantId] || defaultSettings;
  res.json({ success: true, settings });
});

/**
 * POST /api/admin/settings
 * Update UI customization settings
 */
adminRouter.post("/settings", (req, res) => {
  const tenantId = getTenantId(req);
  const current = settingsStore[tenantId] || { ...defaultSettings };
  
  // Merge with existing settings
  settingsStore[tenantId] = {
    ...current,
    ...req.body
  };
  
  res.json({ success: true, settings: settingsStore[tenantId] });
});

/**
 * POST /api/admin/settings/logo
 * Upload a logo image
 */
adminRouter.post("/settings/logo", upload.single("logo"), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: "No file uploaded" });
    }
    
    const tenantId = getTenantId(req);
    
    // Move to a permanent location in storage
    const logoDir = path.join(process.cwd(), "src", "storage", "logos");
    if (!fs.existsSync(logoDir)) {
      fs.mkdirSync(logoDir, { recursive: true });
    }
    
    const ext = path.extname(req.file.originalname) || ".png";
    const logoFilename = `${tenantId}-logo${ext}`;
    const logoPath = path.join(logoDir, logoFilename);
    
    fs.renameSync(req.file.path, logoPath);
    
    const logoUrl = `/storage/logos/${logoFilename}`;
    
    // Update settings
    const current = settingsStore[tenantId] || { ...defaultSettings };
    settingsStore[tenantId] = { ...current, logoUrl };
    
    res.json({ success: true, logoUrl });
  } catch (err: any) {
    if (req.file?.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================================
// STATS ENDPOINT
// ============================================================================

/**
 * GET /api/admin/stats
 * Get dashboard statistics
 */
adminRouter.get("/stats", async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    
    // Count context data keys
    const tenantData = contextDataStore[tenantId] || {};
    const totalDataKeys = Object.keys(tenantData).length;
    
    // Note: Document count comes from ElevenLabs KB via /api/knowledge-base/documents
    res.json({
      success: true,
      stats: {
        totalDocuments: 0, // Use /api/knowledge-base/documents for accurate count
        totalDataKeys,
        totalSize: 0
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================================
// CONTEXT DATA ENDPOINTS
// ============================================================================

/**
 * GET /api/admin/data
 * Get all context data for tenant
 */
adminRouter.get("/data", (req, res) => {
  const tenantId = getTenantId(req);
  const data = contextDataStore[tenantId] || {};
  res.json({ success: true, data });
});

/**
 * POST /api/admin/data
 * Add/update context data
 */
adminRouter.post("/data", (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { key, value, description, category } = req.body;
    
    if (!key) {
      return res.status(400).json({ success: false, error: "Key is required" });
    }
    
    if (!contextDataStore[tenantId]) {
      contextDataStore[tenantId] = {};
    }
    
    contextDataStore[tenantId][key] = { value, description, category };
    
    res.json({ success: true, key, data: contextDataStore[tenantId][key] });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * DELETE /api/admin/data/:key
 * Delete context data by key
 */
adminRouter.delete("/data/:key", (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const key = req.params.key;
    
    if (contextDataStore[tenantId] && contextDataStore[tenantId][key]) {
      delete contextDataStore[tenantId][key];
      res.json({ success: true, message: `Deleted ${key}` });
    } else {
      res.status(404).json({ success: false, error: "Key not found" });
    }
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================================
// SEARCH ENDPOINT
// ============================================================================

/**
 * GET /api/admin/search
 * Search documents - delegates to ElevenLabs KB
 */
adminRouter.get("/search", async (req, res) => {
  try {
    const query = req.query.q as string;
    
    if (!query) {
      return res.status(400).json({ success: false, error: "Query required" });
    }
    
    // Note: For document search, use /api/knowledge-base endpoints
    // This endpoint is kept for backward compatibility
    res.json({ 
      success: true, 
      results: [], 
      message: "Use /api/knowledge-base for document operations (ElevenLabs KB)" 
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================================
// ELEVENLABS TOOLS GENERATOR
// ============================================================================

interface OpenAPISpec {
  openapi?: string;
  swagger?: string;
  info: { title: string; description?: string; version: string };
  servers?: Array<{ url: string; description?: string }>;
  paths: Record<string, any>;
  components?: { schemas?: Record<string, any> };
}

interface ElevenLabsWebhookTool {
  type: "webhook";
  name: string;
  description: string;
  api_schema: {
    url: string;
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    path_params_schema: Array<{ name: string; type: string; description?: string; required: boolean }>;
    query_params_schema: Array<{ name: string; type: string; description?: string; required: boolean; enum?: string[] }>;
    request_body_schema: { type: string; properties: Record<string, any>; required: string[] } | null;
    request_headers: Array<{ name: string; value: string }>;
    auth_connection: string | null;
  };
  response_timeout_secs: number;
  dynamic_variables: { dynamic_variable_placeholders: Record<string, unknown> };
  assignments: Array<unknown>;
  disable_interruptions: boolean;
  force_pre_tool_speech: "auto" | "always" | "never";
  tool_call_sound: string | null;
  tool_call_sound_behavior: "auto" | "always" | "never";
  execution_mode: "immediate" | "deferred";
}

function schemaToElevenLabsType(schema: any): string {
  if (!schema) return "string";
  if (schema.$ref) return "object";
  switch (schema.type) {
    case "integer":
    case "number":
      return "number";
    case "boolean":
      return "boolean";
    case "array":
      return "array";
    case "object":
      return "object";
    default:
      return "string";
  }
}

function generateToolName(path: string, method: string, operationId?: string): string {
  if (operationId) {
    return operationId.replace(/([A-Z])/g, "_$1").toLowerCase().replace(/^_/, "");
  }
  const parts = path.split("/").filter((p) => p && !p.startsWith("{"));
  const resource = parts[parts.length - 1] || "resource";
  const methodPrefix: Record<string, string> = {
    get: parts.length > 1 ? "get" : "list",
    post: "create",
    put: "update",
    patch: "update",
    delete: "delete",
  };
  return `${methodPrefix[method] || method}_${resource}`.toLowerCase().replace(/-/g, "_");
}

function extractPathParams(path: string): string[] {
  const matches = path.match(/\{([^}]+)\}/g) || [];
  return matches.map((m) => m.slice(1, -1));
}

function extractPathParamsSchema(operation: any, pathParams: string[]): ElevenLabsWebhookTool["api_schema"]["path_params_schema"] {
  return pathParams.map((param) => {
    const opParam = operation.parameters?.find((p: any) => p.name === param && p.in === "path");
    return {
      name: param,
      type: opParam ? schemaToElevenLabsType(opParam.schema) : "string",
      description: opParam?.description || `The ${param.replace(/_/g, " ")} identifier`,
      required: true,
    };
  });
}

function extractQueryParamsSchema(operation: any): ElevenLabsWebhookTool["api_schema"]["query_params_schema"] {
  const schema: ElevenLabsWebhookTool["api_schema"]["query_params_schema"] = [];
  operation.parameters?.forEach((param: any) => {
    if (param.in === "query") {
      schema.push({
        name: param.name,
        type: schemaToElevenLabsType(param.schema),
        description: param.description,
        required: param.required || false,
        enum: param.schema?.enum,
      });
    }
  });
  return schema;
}

function extractRequestBodySchema(operation: any): ElevenLabsWebhookTool["api_schema"]["request_body_schema"] {
  const bodySchema = operation.requestBody?.content?.["application/json"]?.schema;
  if (!bodySchema?.properties) return null;
  
  const properties: Record<string, any> = {};
  Object.entries(bodySchema.properties).forEach(([name, schema]: [string, any]) => {
    properties[name] = { type: schemaToElevenLabsType(schema), description: schema.description, enum: schema.enum };
  });
  
  return { type: "object", properties, required: bodySchema.required || [] };
}

function convertOpenAPIToElevenLabsTools(spec: OpenAPISpec, baseUrl: string): ElevenLabsWebhookTool[] {
  const tools: ElevenLabsWebhookTool[] = [];
  const serverUrl = spec.servers?.[0]?.url || baseUrl;

  for (const [path, pathItem] of Object.entries(spec.paths)) {
    const methods = ["get", "post", "put", "patch", "delete"] as const;
    const pathParams = extractPathParams(path);

    for (const method of methods) {
      const operation = pathItem[method];
      if (!operation) continue;
      if (operation.tags?.some((t: string) => ["admin", "internal"].includes(t.toLowerCase()))) continue;

      const toolName = generateToolName(path, method, operation.operationId);
      let description = operation.summary || operation.description || `${method.toUpperCase()} ${path}`;
      if (description.length > 200) description = description.substring(0, 197) + "...";

      const webhookUrl = `${serverUrl}${path}`;

      tools.push({
        type: "webhook",
        name: toolName,
        description,
        api_schema: {
          url: webhookUrl,
          method: method.toUpperCase() as "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
          path_params_schema: extractPathParamsSchema(operation, pathParams),
          query_params_schema: extractQueryParamsSchema(operation),
          request_body_schema: extractRequestBodySchema(operation),
          request_headers: [],
          auth_connection: null,
        },
        response_timeout_secs: 20,
        dynamic_variables: { dynamic_variable_placeholders: {} },
        assignments: [],
        disable_interruptions: false,
        force_pre_tool_speech: "auto",
        tool_call_sound: null,
        tool_call_sound_behavior: "auto",
        execution_mode: "immediate",
      });
    }
  }

  return tools;
}

/**
 * POST /api/admin/generate-elevenlabs-tools
 * Generate ElevenLabs tool definitions from an OpenAPI specification
 */
adminRouter.post("/generate-elevenlabs-tools", async (req, res) => {
  try {
    const { openapi_url, openapi_spec, base_url } = req.body;

    let spec: OpenAPISpec;

    if (openapi_url) {
      // Fetch from URL
      const response = await fetch(openapi_url);
      if (!response.ok) {
        return res.status(400).json({ error: `Failed to fetch OpenAPI spec: ${response.statusText}` });
      }
      spec = (await response.json()) as OpenAPISpec;
    } else if (openapi_spec) {
      // Use provided spec
      spec = openapi_spec as OpenAPISpec;
    } else {
      return res.status(400).json({ error: "Please provide openapi_url or openapi_spec" });
    }

    // Validate spec has paths
    if (!spec.paths || Object.keys(spec.paths).length === 0) {
      return res.status(400).json({ error: "OpenAPI spec has no paths defined" });
    }

    const baseUrl = base_url || "https://YOUR-SERVER.railway.app";
    const tools = convertOpenAPIToElevenLabsTools(spec, baseUrl);

    res.json({
      note: "Copy each tool definition to your ElevenLabs Agent console",
      generated_at: new Date().toISOString(),
      source: spec.info?.title || "Unknown API",
      version: spec.info?.version || "unknown",
      tool_count: tools.length,
      tools,
    });
  } catch (err: any) {
    console.error("[Tools Generator] Error:", err);
    res.status(500).json({ error: err.message || "Failed to generate tools" });
  }
});

