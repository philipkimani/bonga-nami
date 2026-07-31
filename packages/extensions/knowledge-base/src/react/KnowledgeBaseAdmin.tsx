/**
 * Knowledge Base Admin Component
 * 
 * A fully-featured admin panel for managing knowledge base documents.
 * Supports file upload, URL import, and text entry.
 */

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import type { KBDocument } from '../types.js';

export interface KnowledgeBaseAdminProps {
  /** API endpoint for KB operations (e.g., '/api/kb' or '/api/chatbot-admin/documents') */
  apiEndpoint: string;
  /** Primary brand color */
  primaryColor?: string;
  /** Admin panel title */
  title?: string;
  /** Admin panel subtitle */
  subtitle?: string;
  /** Custom fetch function (for auth headers, etc.) */
  customFetch?: typeof fetch;
  /** Callback when documents change */
  onDocumentsChange?: (documents: KBDocument[]) => void;
  /** CSS class for the container */
  className?: string;
}

type UploadMode = 'file' | 'url' | 'text';

interface Message {
  type: 'success' | 'error' | 'info';
  text: string;
}

interface ApiResponse {
  success?: boolean;
  error?: string;
  documents?: KBDocument[];
}

export function KnowledgeBaseAdmin({
  apiEndpoint,
  primaryColor = '#BB0000',
  title = 'Knowledge Base',
  subtitle = 'Manage your AI assistant\'s knowledge',
  customFetch,
  onDocumentsChange,
  className = '',
}: KnowledgeBaseAdminProps): React.ReactElement {
  const fetchFn = customFetch || fetch;
  
  // State
  const [documents, setDocuments] = useState<KBDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  const [uploadMode, setUploadMode] = useState<UploadMode>('file');
  const [attachToAgent, setAttachToAgent] = useState(true);
  
  // Form inputs
  const [urlInput, setUrlInput] = useState('');
  const [urlName, setUrlName] = useState('');
  const [textInput, setTextInput] = useState('');
  const [textName, setTextName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch documents
  const fetchDocuments = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchQuery) params.set('search', searchQuery);
      
      const res = await fetchFn(`${apiEndpoint}?${params}`);
      const data = (await res.json()) as ApiResponse;
      const docs = data.documents || [];
      setDocuments(docs);
      onDocumentsChange?.(docs);
    } catch (error) {
      console.error('Failed to fetch documents:', error);
      setMessage({ type: 'error', text: 'Failed to load documents' });
    } finally {
      setLoading(false);
    }
  }, [apiEndpoint, searchQuery, fetchFn, onDocumentsChange]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  // Clear message after 5 seconds
  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  // File upload handler
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const target = e.target as HTMLInputElement;
    const file = target.files?.[0];
    if (!file) return;

    setUploading(true);
    setMessage(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('name', file.name);
      if (attachToAgent) formData.append('attach_to_agent', 'true');

      const res = await fetchFn(apiEndpoint, {
        method: 'POST',
        body: formData,
      });

      const data = (await res.json()) as ApiResponse;
      
      if (res.ok && data.success) {
        setMessage({ type: 'success', text: `"${file.name}" uploaded successfully!` });
        fetchDocuments();
      } else {
        setMessage({ type: 'error', text: data.error || 'Upload failed' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Upload failed. Please try again.' });
    } finally {
      setUploading(false);
      target.value = '';
    }
  };

  // URL submit handler
  const handleUrlSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlInput.trim()) return;

    setUploading(true);
    setMessage(null);

    try {
      const res = await fetchFn(apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'url',
          url: urlInput.trim(),
          name: urlName.trim() || urlInput.trim(),
          attach_to_agent: attachToAgent,
        }),
      });

      const data = (await res.json()) as ApiResponse;

      if (res.ok && data.success) {
        setMessage({ type: 'success', text: 'URL added successfully!' });
        setUrlInput('');
        setUrlName('');
        fetchDocuments();
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to add URL' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to add URL. Please try again.' });
    } finally {
      setUploading(false);
    }
  };

  // Text submit handler
  const handleTextSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!textInput.trim() || !textName.trim()) return;

    setUploading(true);
    setMessage(null);

    try {
      const res = await fetchFn(apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'text',
          text: textInput.trim(),
          name: textName.trim(),
          attach_to_agent: attachToAgent,
        }),
      });

      const data = (await res.json()) as ApiResponse;

      if (res.ok && data.success) {
        setMessage({ type: 'success', text: 'Text content added successfully!' });
        setTextInput('');
        setTextName('');
        fetchDocuments();
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to add text' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to add text. Please try again.' });
    } finally {
      setUploading(false);
    }
  };

  // Delete handler
  const handleDelete = async (documentId: string, documentName: string) => {
    if (typeof window !== 'undefined' && !window.confirm(`Are you sure you want to delete "${documentName}"?`)) return;

    try {
      const res = await fetchFn(apiEndpoint, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId }),
      });

      if (res.ok) {
        setMessage({ type: 'success', text: 'Document deleted' });
        fetchDocuments();
      } else {
        setMessage({ type: 'error', text: 'Delete failed' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Delete failed. Please try again.' });
    }
  };

  // Helpers
  const formatBytes = (bytes?: number) => {
    if (!bytes) return '-';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'file': return '📄';
      case 'url': return '🔗';
      case 'text': return '📝';
      default: return '📋';
    }
  };

  const getTypeBadgeStyle = (type: string): React.CSSProperties => {
    switch (type) {
      case 'file': return { backgroundColor: '#dbeafe', color: '#1e40af' };
      case 'url': return { backgroundColor: '#dcfce7', color: '#166534' };
      case 'text': return { backgroundColor: '#f3e8ff', color: '#7c3aed' };
      default: return { backgroundColor: '#f3f4f6', color: '#374151' };
    }
  };

  // Styles
  const styles: Record<string, React.CSSProperties> = {
    container: { maxWidth: '1024px', margin: '0 auto', padding: '2rem' },
    header: { marginBottom: '2rem' },
    title: { fontSize: '1.875rem', fontWeight: 'bold', marginBottom: '0.5rem' },
    subtitle: { color: '#6b7280' },
    card: { 
      backgroundColor: 'white', 
      borderRadius: '0.75rem', 
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)', 
      border: '1px solid #e5e7eb',
      padding: '1.5rem',
      marginBottom: '2rem',
    },
    sectionTitle: { fontSize: '1.25rem', fontWeight: 600, marginBottom: '1rem' },
    tabs: { 
      display: 'flex', 
      gap: '0.25rem', 
      backgroundColor: '#f3f4f6', 
      padding: '0.25rem', 
      borderRadius: '0.5rem',
      width: 'fit-content',
      marginBottom: '1.5rem',
    },
    input: {
      width: '100%',
      padding: '0.625rem 1rem',
      border: '1px solid #d1d5db',
      borderRadius: '0.5rem',
      fontSize: '0.875rem',
      outline: 'none',
    },
    textarea: {
      width: '100%',
      padding: '0.625rem 1rem',
      border: '1px solid #d1d5db',
      borderRadius: '0.5rem',
      fontSize: '0.875rem',
      outline: 'none',
      resize: 'vertical',
      minHeight: '150px',
    },
    checkbox: { marginRight: '0.5rem' },
    table: { width: '100%', borderCollapse: 'collapse' },
    th: { 
      textAlign: 'left', 
      padding: '0.75rem 0', 
      borderBottom: '1px solid #e5e7eb',
      color: '#6b7280',
      fontWeight: 500,
    },
    td: { 
      padding: '1rem 0', 
      borderBottom: '1px solid #e5e7eb',
    },
    deleteButton: {
      color: primaryColor,
      backgroundColor: 'transparent',
      border: 'none',
      cursor: 'pointer',
      padding: '0.25rem 0.75rem',
      borderRadius: '0.25rem',
    },
  };

  const getTabStyle = (active: boolean): React.CSSProperties => ({
    padding: '0.5rem 1rem',
    borderRadius: '0.375rem',
    fontSize: '0.875rem',
    fontWeight: 500,
    cursor: 'pointer',
    border: 'none',
    backgroundColor: active ? 'white' : 'transparent',
    boxShadow: active ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
    color: active ? '#111827' : '#6b7280',
  });

  const getButtonStyle = (disabled: boolean): React.CSSProperties => ({
    padding: '0.625rem 1.25rem',
    backgroundColor: disabled ? '#9ca3af' : primaryColor,
    color: 'white',
    border: 'none',
    borderRadius: '0.5rem',
    fontSize: '0.875rem',
    fontWeight: 500,
    cursor: disabled ? 'not-allowed' : 'pointer',
  });

  const getMessageStyle = (type: string): React.CSSProperties => ({
    padding: '1rem',
    borderRadius: '0.5rem',
    marginBottom: '1.5rem',
    backgroundColor: type === 'success' ? '#ecfdf5' : type === 'error' ? '#fef2f2' : '#eff6ff',
    color: type === 'success' ? '#065f46' : type === 'error' ? '#991b1b' : '#1e40af',
    border: `1px solid ${type === 'success' ? '#a7f3d0' : type === 'error' ? '#fecaca' : '#bfdbfe'}`,
  });

  const getBadgeStyle = (type: string): React.CSSProperties => ({
    ...getTypeBadgeStyle(type),
    padding: '0.25rem 0.5rem',
    borderRadius: '9999px',
    fontSize: '0.75rem',
    fontWeight: 500,
  });

  return (
    <div style={styles.container} className={className}>
      {/* Header */}
      <div style={styles.header}>
        <h1 style={styles.title}>{title}</h1>
        <p style={styles.subtitle}>{subtitle}</p>
      </div>

      {/* Message */}
      {message && (
        <div style={getMessageStyle(message.type)}>
          {message.text}
        </div>
      )}

      {/* Upload Section */}
      <div style={styles.card}>
        <h2 style={styles.sectionTitle}>Add Knowledge</h2>

        {/* Mode Tabs */}
        <div style={styles.tabs}>
          <button style={getTabStyle(uploadMode === 'file')} onClick={() => setUploadMode('file')}>
            📄 Upload File
          </button>
          <button style={getTabStyle(uploadMode === 'url')} onClick={() => setUploadMode('url')}>
            🔗 Add URL
          </button>
          <button style={getTabStyle(uploadMode === 'text')} onClick={() => setUploadMode('text')}>
            📝 Add Text
          </button>
        </div>

        {/* File Upload */}
        {uploadMode === 'file' && (
          <div>
            <p style={{ color: '#6b7280', marginBottom: '1rem' }}>
              Upload PDF, DOCX, TXT, or other document files.
            </p>
            <input
              type="file"
              accept=".pdf,.docx,.doc,.txt,.md,.csv,.json"
              onChange={handleFileUpload}
              disabled={uploading}
              style={{ marginBottom: '0.5rem' }}
            />
            <p style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
              Supported: PDF, DOCX, DOC, TXT, MD, CSV, JSON (max 20MB)
            </p>
          </div>
        )}

        {/* URL Input */}
        {uploadMode === 'url' && (
          <form onSubmit={handleUrlSubmit}>
            <p style={{ color: '#6b7280', marginBottom: '1rem' }}>
              Add a webpage URL. The content will be scraped and added to your knowledge base.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <input
                type="url"
                value={urlInput}
                onChange={(e) => setUrlInput((e.target as HTMLInputElement).value)}
                placeholder="https://example.com/page"
                style={styles.input}
                required
              />
              <input
                type="text"
                value={urlName}
                onChange={(e) => setUrlName((e.target as HTMLInputElement).value)}
                placeholder="Display name (optional)"
                style={styles.input}
              />
              <button type="submit" disabled={uploading || !urlInput.trim()} style={getButtonStyle(uploading || !urlInput.trim())}>
                {uploading ? 'Adding...' : 'Add URL'}
              </button>
            </div>
          </form>
        )}

        {/* Text Input */}
        {uploadMode === 'text' && (
          <form onSubmit={handleTextSubmit}>
            <p style={{ color: '#6b7280', marginBottom: '1rem' }}>
              Paste text content directly. Great for FAQs, policies, or custom information.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <input
                type="text"
                value={textName}
                onChange={(e) => setTextName((e.target as HTMLInputElement).value)}
                placeholder="Document name (required)"
                style={styles.input}
                required
              />
              <textarea
                value={textInput}
                onChange={(e) => setTextInput((e.target as HTMLTextAreaElement).value)}
                placeholder="Paste your text content here..."
                style={styles.textarea}
                required
              />
              <button 
                type="submit" 
                disabled={uploading || !textInput.trim() || !textName.trim()} 
                style={getButtonStyle(uploading || !textInput.trim() || !textName.trim())}
              >
                {uploading ? 'Adding...' : 'Add Text'}
              </button>
            </div>
          </form>
        )}

        {/* Auto-attach option */}
        <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #e5e7eb' }}>
          <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={attachToAgent}
              onChange={(e) => setAttachToAgent((e.target as HTMLInputElement).checked)}
              style={styles.checkbox}
            />
            <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>
              Automatically attach to AI agent after upload
            </span>
          </label>
        </div>
      </div>

      {/* Documents List */}
      <div style={styles.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h2 style={styles.sectionTitle}>Your Documents</h2>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery((e.target as HTMLInputElement).value)}
              onKeyDown={(e) => e.key === 'Enter' && fetchDocuments()}
              placeholder="Search..."
              style={{ ...styles.input, width: '200px' }}
            />
            <button onClick={fetchDocuments} style={{ ...getButtonStyle(false), padding: '0.5rem' }} title="Refresh">
              🔄
            </button>
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>
            Loading documents...
          </div>
        ) : documents.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>
            <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📚</div>
            <p>No documents in your knowledge base yet.</p>
            <p style={{ fontSize: '0.875rem', color: '#9ca3af' }}>Upload files, add URLs, or paste text to get started.</p>
          </div>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Name</th>
                <th style={styles.th}>Type</th>
                <th style={styles.th}>Size</th>
                <th style={styles.th}>Added</th>
                <th style={{ ...styles.th, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {documents.map((doc) => (
                <tr key={doc.id}>
                  <td style={styles.td}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span>{getTypeIcon(doc.type)}</span>
                      <div>
                        <p style={{ fontWeight: 500 }}>{doc.name}</p>
                        {doc.url && (
                          <a 
                            href={doc.url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            style={{ fontSize: '0.75rem', color: '#2563eb' }}
                          >
                            {doc.url.substring(0, 50)}...
                          </a>
                        )}
                      </div>
                    </div>
                  </td>
                  <td style={styles.td}>
                    <span style={getBadgeStyle(doc.type)}>{doc.type}</span>
                  </td>
                  <td style={styles.td}>{formatBytes(doc.size_bytes)}</td>
                  <td style={styles.td}>
                    {doc.created_at ? new Date(doc.created_at).toLocaleDateString() : '-'}
                  </td>
                  <td style={{ ...styles.td, textAlign: 'right' }}>
                    <button
                      onClick={() => handleDelete(doc.id, doc.name)}
                      style={styles.deleteButton}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
