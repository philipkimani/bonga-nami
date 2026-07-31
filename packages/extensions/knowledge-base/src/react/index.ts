/**
 * Knowledge Base Admin React Component
 * 
 * A drop-in React component for managing knowledge bases.
 * Works with any React framework (Next.js, Vite, CRA, etc.)
 * 
 * Usage:
 * ```tsx
 * import { KnowledgeBaseAdmin } from '@platform/knowledge-base/react';
 * 
 * function AdminPage() {
 *   return (
 *     <KnowledgeBaseAdmin 
 *       apiEndpoint="/api/kb"
 *       primaryColor="#BB0000"
 *       title="My Knowledge Base"
 *     />
 *   );
 * }
 * ```
 */

export { KnowledgeBaseAdmin, type KnowledgeBaseAdminProps } from './KnowledgeBaseAdmin.js';
