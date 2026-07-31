/**
 * Knowledge Base Types
 * 
 * These types are shared across:
 * - Backend client
 * - HTTP handlers
 * - React components
 */

import { z } from 'zod';

// ============================================================================
// Configuration
// ============================================================================

export const KBConfigSchema = z.object({
  apiKey: z.string().min(1, 'ElevenLabs API key required'),
  agentId: z.string().optional(), // Optional: for auto-attach feature
  baseUrl: z.string().default('https://api.elevenlabs.io/v1'),
});

export type KBConfig = z.infer<typeof KBConfigSchema>;

// ============================================================================
// Document Types
// ============================================================================

export type DocumentType = 'file' | 'url' | 'text';

export interface KBDocument {
  id: string;
  name: string;
  type: DocumentType;
  size_bytes?: number;
  created_at?: string;
  updated_at?: string;
  url?: string; // For URL type documents
  dependent_agents?: number;
}

export interface KBDocumentList {
  documents: KBDocument[];
  has_more: boolean;
  next_cursor?: string;
}

// ============================================================================
// Request/Response Types
// ============================================================================

// List documents
export interface ListDocumentsRequest {
  page_size?: number;
  search?: string;
  cursor?: string;
  types?: DocumentType[];
}

// Upload file
export interface UploadFileRequest {
  file: File | Blob;
  name: string;
  attach_to_agent?: boolean;
}

// Add URL
export interface AddUrlRequest {
  url: string;
  name?: string;
  attach_to_agent?: boolean;
}

// Add text
export interface AddTextRequest {
  text: string;
  name: string;
  attach_to_agent?: boolean;
}

// Generic upload response
export interface UploadResponse {
  success: boolean;
  document?: KBDocument;
  error?: string;
}

// Delete response
export interface DeleteResponse {
  success: boolean;
  error?: string;
}

// ============================================================================
// ElevenLabs API Response Types (internal)
// ============================================================================

export interface ElevenLabsDocument {
  id: string;
  name: string;
  type: string;
  url?: string;
  metadata?: {
    created_at_unix_secs?: number;
    last_updated_at_unix_secs?: number;
    size_bytes?: number;
  };
  dependent_agents?: Array<{
    id: string;
    name: string;
  }>;
}

export interface ElevenLabsListResponse {
  documents: ElevenLabsDocument[];
  has_more: boolean;
  next_cursor?: string;
}

export interface ElevenLabsUploadResponse {
  id: string;
  name: string;
}

// ============================================================================
// Handler Types (framework-agnostic)
// ============================================================================

export interface HandlerRequest {
  method: string;
  url: string;
  query: Record<string, string | string[] | undefined>;
  body?: unknown;
  formData?: () => Promise<FormData>;
}

export interface HandlerResponse {
  status: number;
  body: unknown;
}

export type Handler = (req: HandlerRequest) => Promise<HandlerResponse>;
