/**
 * Knowledge Base API Routes
 * 
 * Tenant-aware Knowledge Base management endpoints.
 * These routes proxy requests to ElevenLabs KB API while keeping
 * the tenant's API key secure on the server.
 * 
 * Each client deployment has their own ElevenLabs account.
 * Documents are stored in their account, NOT ours.
 * 
 * SECURITY:
 * - API keys NEVER leave the server
 * - All requests require client_admin role (set in tenant middleware)
 * - Document operations are scoped to tenant's ElevenLabs account
 */

import express from "express";
import multer from "multer";
import fs from "fs";
import FormData from "form-data";
import { getTenantContext, createLogger } from "@platform/core";
import {
  createKnowledgeBaseClient,
  type KBConfig,
} from "@platform/knowledge-base";
import { getElevenLabsConfig } from "./admin-config.js";

export const knowledgeBaseRouter = express.Router();

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Create KB config from Admin Console settings (preferred) or environment.
 * Admin Console settings take precedence over environment variables.
 */
function getKBConfig(): KBConfig {
  // First, try to get from Admin Console config
  const adminConfig = getElevenLabsConfig();
  
  // Use Admin Console values if available, fall back to env vars
  const apiKey = adminConfig.apiKey || process.env.ELEVENLABS_API_KEY;
  const agentId = adminConfig.agentId || process.env.ELEVENLABS_AGENT_ID;

  if (!apiKey) {
    throw new Error("ELEVENLABS_API_KEY is required for Knowledge Base. Set it in Admin Console → Settings or as environment variable.");
  }

  return {
    apiKey,
    agentId,
  };
}

// Multer for file uploads (store in temp directory)
const upload = multer({ dest: "tmp/" });

// ============================================================================
// ROUTES
// ============================================================================

/**
 * GET /api/knowledge-base/documents
 * 
 * List documents attached to the tenant's ElevenLabs Agent.
 * Shows only documents in the agent's knowledge_base, not all workspace documents.
 * 
 * Response:
 * - documents: Array of document metadata
 */
knowledgeBaseRouter.get("/documents", async (req: any, res: any) => {
  const tenantCtx = getTenantContext(req);
  const logger = createLogger(tenantCtx);

  try {
    logger.info("kb_list_documents", {});

    const config = getKBConfig();
    const client = createKnowledgeBaseClient(config);
    
    // Get documents attached to this agent (not all workspace documents)
    const documents = await client.listAgentDocuments();

    logger.info("kb_list_success", { count: documents.length });

    res.json({ 
      documents,
      count: documents.length,
      has_more: false,
    });
  } catch (error) {
    logger.error("kb_list_error", {
      error: error instanceof Error ? error.message : String(error),
    });

    if (error instanceof Error && error.message.includes("401")) {
      return res.status(401).json({
        error: "Invalid API key",
        message: "Please check your ElevenLabs API key configuration.",
      });
    }

    res.status(500).json({
      error: "Failed to list documents",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * GET /api/knowledge-base/documents/:id
 * 
 * Get a specific document from the tenant's ElevenLabs Knowledge Base.
 * 
 * Response:
 * - document: Document metadata
 */
knowledgeBaseRouter.get("/documents/:id", async (req: any, res: any) => {
  const tenantCtx = getTenantContext(req);
  const logger = createLogger(tenantCtx);

  try {
    const { id } = req.params;
    logger.info("kb_get_document", { documentId: id });

    const config = getKBConfig();
    const client = createKnowledgeBaseClient(config);
    
    // List documents and find by ID (ElevenLabs API doesn't have a direct get by ID)
    const result = await client.listDocuments();
    const document = result.documents.find(d => d.id === id);

    if (!document) {
      return res.status(404).json({
        error: "Document not found",
        documentId: id,
      });
    }

    logger.info("kb_get_success", { documentId: id });
    res.json({ document });
  } catch (error) {
    logger.error("kb_get_error", {
      documentId: req.params.id,
      error: error instanceof Error ? error.message : String(error),
    });

    res.status(500).json({
      error: "Failed to get document",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * POST /api/knowledge-base/documents/upload
 * 
 * Upload a document to the tenant's ElevenLabs Knowledge Base.
 * Supports: PDF, TXT, DOC, DOCX, HTML, EPUB, MD
 * 
 * Request:
 * - file: Multipart file upload
 * - name (optional): Custom document name
 * 
 * Response:
 * - document: Created document metadata
 */
knowledgeBaseRouter.post(
  "/documents/upload",
  upload.single("file"),
  async (req: any, res: any) => {
    const tenantCtx = getTenantContext(req);
    const logger = createLogger(tenantCtx);

    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const { originalname, path: tmpPath, mimetype, size } = req.file;
      const customName = req.body.name || originalname;

      logger.info("kb_upload_document", {
        filename: originalname,
        customName,
        mimetype,
        size,
      });

      const config = getKBConfig();
      const client = createKnowledgeBaseClient(config);

      // Read file and upload using uploadFile method
      const fileBuffer = fs.readFileSync(tmpPath);
      const blob = new Blob([fileBuffer], { type: mimetype });
      const result = await client.uploadFile({
        name: customName,
        file: blob,
        attach_to_agent: true,
      });

      // Clean up temp file
      fs.unlinkSync(tmpPath);

      if (!result.success || !result.document) {
        throw new Error(result.error || "Upload failed");
      }

      logger.info("kb_upload_success", {
        documentId: result.document.id,
        name: result.document.name,
      });

      res.json({ document: result.document });
    } catch (error) {
      // Clean up temp file on error
      if (req.file?.path && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }

      logger.error("kb_upload_error", {
        error: error instanceof Error ? error.message : String(error),
      });

      if (error instanceof Error && error.message.includes("File type")) {
        return res.status(400).json({
          error: "Invalid file type",
          message: error.message,
        });
      }

      res.status(500).json({
        error: "Failed to upload document",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
);

/**
 * POST /api/knowledge-base/documents/url
 * 
 * Add a document from URL to the tenant's ElevenLabs Knowledge Base.
 * 
 * Request body:
 * - url: URL to fetch document from
 * - name (optional): Custom document name
 * 
 * Response:
 * - document: Created document metadata
 */
knowledgeBaseRouter.post("/documents/url", async (req: any, res: any) => {
  const tenantCtx = getTenantContext(req);
  const logger = createLogger(tenantCtx);

  try {
    const { url, name } = req.body;

    if (!url) {
      return res.status(400).json({ error: "URL is required" });
    }

    logger.info("kb_add_url", { url, name });

    const config = getKBConfig();
    const client = createKnowledgeBaseClient(config);

    const result = await client.addUrl({
      url,
      name: name || url,
      attach_to_agent: true,
    });

    if (!result.success || !result.document) {
      throw new Error(result.error || "Failed to add URL");
    }

    logger.info("kb_url_success", {
      documentId: result.document.id,
      name: result.document.name,
    });

    res.json({ document: result.document });
  } catch (error) {
    logger.error("kb_url_error", {
      error: error instanceof Error ? error.message : String(error),
    });

    res.status(500).json({
      error: "Failed to add document from URL",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * POST /api/knowledge-base/documents/text
 * 
 * Add raw text as a document to the tenant's ElevenLabs Knowledge Base.
 * 
 * Request body:
 * - text: Raw text content
 * - name: Document name (required)
 * 
 * Response:
 * - document: Created document metadata
 */
knowledgeBaseRouter.post("/documents/text", async (req: any, res: any) => {
  const tenantCtx = getTenantContext(req);
  const logger = createLogger(tenantCtx);

  try {
    const { text, name } = req.body;

    if (!text) {
      return res.status(400).json({ error: "Text content is required" });
    }

    if (!name) {
      return res.status(400).json({ error: "Document name is required" });
    }

    logger.info("kb_add_text", { name, textLength: text.length });

    const config = getKBConfig();
    const client = createKnowledgeBaseClient(config);

    const result = await client.addText({
      text,
      name,
      attach_to_agent: true,
    });

    if (!result.success || !result.document) {
      throw new Error(result.error || "Failed to add text");
    }

    logger.info("kb_text_success", {
      documentId: result.document.id,
      name: result.document.name,
    });

    res.json({ document: result.document });
  } catch (error) {
    logger.error("kb_text_error", {
      error: error instanceof Error ? error.message : String(error),
    });

    res.status(500).json({
      error: "Failed to add text document",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * DELETE /api/knowledge-base/documents/:id
 * 
 * Delete a document from the tenant's ElevenLabs Knowledge Base.
 * 
 * Response:
 * - success: boolean
 */
knowledgeBaseRouter.delete("/documents/:id", async (req: any, res: any) => {
  const tenantCtx = getTenantContext(req);
  const logger = createLogger(tenantCtx);

  try {
    const { id } = req.params;
    logger.info("kb_delete_document", { documentId: id });

    const config = getKBConfig();
    const client = createKnowledgeBaseClient(config);

    await client.deleteDocument(id);

    logger.info("kb_delete_success", { documentId: id });
    res.json({ success: true, documentId: id });
  } catch (error) {
    logger.error("kb_delete_error", {
      documentId: req.params.id,
      error: error instanceof Error ? error.message : String(error),
    });

    res.status(500).json({
      error: "Failed to delete document",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * GET /api/knowledge-base/status
 * 
 * Get the status of the Knowledge Base configuration including RAG settings.
 * 
 * Response:
 * - configured: boolean
 * - agentId: string (masked)
 * - rag: { enabled: boolean, embeddingModel?: string }
 * - documentCount: number
 */
knowledgeBaseRouter.get("/status", async (req: any, res: any) => {
  const tenantCtx = getTenantContext(req);
  const logger = createLogger(tenantCtx);

  try {
    let apiKey: string | undefined;
    let agentId: string | undefined;

    try {
      const kbConfig = getKBConfig();
      apiKey = kbConfig.apiKey;
      agentId = kbConfig.agentId;
    } catch {
      // getKBConfig throws if no API key found
    }

    const configured = !!(apiKey && agentId);

    if (!configured) {
      logger.info("kb_status_check", { configured });
      return res.json({
        configured,
        agentId: null,
        rag: { enabled: false },
        documentCount: 0,
        message: "ElevenLabs API key or Agent ID not configured. Set them in Admin Console → Settings.",
      });
    }

    // Fetch agent config to get RAG status
    let ragEnabled = false;
    let ragConfig = null;
    let attachedDocs = 0;

    try {
      const agentResponse = await fetch(
        `https://api.elevenlabs.io/v1/convai/agents/${agentId}`,
        {
          headers: { "xi-api-key": apiKey },
        }
      );

      if (agentResponse.ok) {
        const agent = await agentResponse.json();
        ragConfig = agent.conversation_config?.agent?.prompt?.rag;
        ragEnabled = ragConfig?.enabled || false;
        attachedDocs = agent.conversation_config?.agent?.prompt?.knowledge_base?.length || 0;
      }
    } catch (err) {
      logger.warn("kb_status_agent_fetch_failed", { 
        error: err instanceof Error ? err.message : String(err) 
      });
    }

    logger.info("kb_status_check", { configured, ragEnabled, attachedDocs });

    res.json({
      configured,
      agentId: agentId ? `${agentId.slice(0, 8)}...` : null,
      rag: {
        enabled: ragEnabled,
        embeddingModel: ragConfig?.embedding_model || null,
        maxDocumentsLength: ragConfig?.max_documents_length || null,
      },
      documentCount: attachedDocs,
      message: configured
        ? "Knowledge Base is configured"
        : "Missing ELEVENLABS_API_KEY or ELEVENLABS_AGENT_ID",
    });
  } catch (error) {
    logger.error("kb_status_error", {
      error: error instanceof Error ? error.message : String(error),
    });

    res.status(500).json({
      error: "Failed to check status",
    });
  }
});

/**
 * POST /api/knowledge-base/rag
 * 
 * Enable or disable RAG for the agent.
 * 
 * Request body:
 * - enabled: boolean
 * 
 * Response:
 * - success: boolean
 * - rag: { enabled: boolean }
 */
knowledgeBaseRouter.post("/rag", async (req: any, res: any) => {
  const tenantCtx = getTenantContext(req);
  const logger = createLogger(tenantCtx);

  try {
    let apiKey: string | undefined;
    let agentId: string | undefined;

    try {
      const kbConfig = getKBConfig();
      apiKey = kbConfig.apiKey;
      agentId = kbConfig.agentId;
    } catch {
      // getKBConfig throws if no API key found
    }

    if (!apiKey || !agentId) {
      return res.status(400).json({
        error: "ElevenLabs not configured",
        message: "ElevenLabs API key or Agent ID not configured. Set them in Admin Console → Settings.",
      });
    }

    const { enabled } = req.body;

    if (typeof enabled !== "boolean") {
      return res.status(400).json({ error: "'enabled' must be a boolean" });
    }

    logger.info("kb_rag_toggle", { enabled });

    // Update agent RAG configuration
    const response = await fetch(
      `https://api.elevenlabs.io/v1/convai/agents/${agentId}`,
      {
        method: "PATCH",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          conversation_config: {
            agent: {
              prompt: {
                rag: {
                  enabled,
                  embedding_model: enabled ? "e5_mistral_7b_instruct" : undefined,
                },
              },
            },
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`ElevenLabs API error: ${errorText}`);
    }

    logger.info("kb_rag_toggle_success", { enabled });

    res.json({
      success: true,
      rag: { enabled },
      message: enabled ? "RAG enabled" : "RAG disabled",
    });
  } catch (error) {
    logger.error("kb_rag_toggle_error", {
      error: error instanceof Error ? error.message : String(error),
    });

    res.status(500).json({
      error: "Failed to update RAG settings",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});
