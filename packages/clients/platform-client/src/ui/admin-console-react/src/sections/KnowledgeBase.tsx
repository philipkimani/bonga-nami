import { useState, useEffect, useRef } from 'react'
import {
  BarChart3, Blocks, Brain, FileText, Search,
  Settings, Target, TriangleAlert, Zap,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

type Tab = 'dashboard' | 'documents' | 'context' | 'settings'
type ModalType = 'upload' | 'url' | 'text' | null

interface KBStats {
  totalDocuments: number
  totalChunks: number
  totalQueries: number
  avgResponseTime: string
}

interface RAGStatus {
  enabled: boolean
  embeddingModel: string | null
  loading: boolean
}

interface Document {
  id: string
  name: string
  type: string
  size: string
  addedAt: string
  content?: string
}

export default function KnowledgeBaseSection() {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard')
  const [documents, setDocuments] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState<ModalType>(null)
  const [stats, setStats] = useState<KBStats>({
    totalDocuments: 0,
    totalChunks: 0,
    totalQueries: 0,
    avgResponseTime: '0ms',
  })
  const [ragStatus, setRagStatus] = useState<RAGStatus>({
    enabled: false,
    embeddingModel: null,
    loading: false,
  })

  useEffect(() => {
    loadDocuments()
    loadStats()
  }, [])

  async function loadDocuments() {
    try {
      const res = await fetch('/api/knowledge-base/documents')
      if (res.ok) {
        const data = await res.json()
        setDocuments(data.documents || [])
      }
    } catch (e) {
      console.error('Failed to load documents:', e)
    } finally {
      setLoading(false)
    }
  }

  async function loadStats() {
    try {
      const res = await fetch('/api/knowledge-base/status')
      if (res.ok) {
        const data = await res.json()
        setStats({
          totalDocuments: data.documentCount || documents.length,
          totalChunks: data.chunksCount || 0,
          totalQueries: data.queriesCount || 0,
          avgResponseTime: data.avgResponseTime || '0ms',
        })
        if (data.rag) {
          setRagStatus(prev => ({
            ...prev,
            enabled: data.rag.enabled || false,
            embeddingModel: data.rag.embeddingModel || null,
          }))
        }
      }
    } catch (e) {
      console.log('Stats not available yet')
    }
  }

  async function toggleRAG(enabled: boolean) {
    setRagStatus(prev => ({ ...prev, loading: true }))
    try {
      const res = await fetch('/api/knowledge-base/rag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      })
      if (res.ok) {
        setRagStatus(prev => ({ ...prev, enabled, loading: false }))
      } else {
        const data = await res.json().catch(() => null)
        const msg = data?.message || 'Failed to toggle RAG'
        alert(msg)
        setRagStatus(prev => ({ ...prev, loading: false }))
      }
    } catch (e) {
      alert('Failed to toggle RAG: network error')
      setRagStatus(prev => ({ ...prev, loading: false }))
    }
  }

  const tabs: { id: Tab; label: string; Icon: LucideIcon }[] = [
    { id: 'dashboard', label: 'Dashboard', Icon: BarChart3 },
    { id: 'documents', label: 'Documents', Icon: FileText },
    { id: 'context', label: 'Context Rules', Icon: Target },
    { id: 'settings', label: 'Settings', Icon: Settings },
  ]

  // Called when document upload/add succeeds from the modal
  const handleAddDocument = (doc: { id: string; name: string; type: string; size: string; content?: string }) => {
    const newDoc: Document = {
      ...doc,
      addedAt: new Date().toLocaleString(),
    }
    setDocuments(prev => [newDoc, ...prev])
    setStats(prev => ({ ...prev, totalDocuments: prev.totalDocuments + 1 }))
    setModalOpen(null)
  }

  const handleDeleteDocument = async (id: string) => {
    // Optimistically update UI
    setDocuments(prev => prev.filter(d => d.id !== id))
    setStats(prev => ({ ...prev, totalDocuments: Math.max(0, prev.totalDocuments - 1) }))

    // Call backend API to delete from ElevenLabs
    try {
      const res = await fetch(`/api/knowledge-base/documents/${id}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        // Revert on error
        console.error('Failed to delete document')
        loadDocuments() // Refresh from server
      }
    } catch (err) {
      console.error('Failed to delete document:', err)
      loadDocuments() // Refresh from server on error
    }
  }

  const handleReindex = () => {
    alert('Re-indexing all documents... This would trigger the RAG pipeline in production.')
  }

  return (
    <div className="space-y-6">
      {/* Modals */}
      {modalOpen && (
        <DocumentModal
          type={modalOpen}
          onClose={() => setModalOpen(null)}
          onSubmit={handleAddDocument}
        />
      )}
      {/* Sidebar + Content Layout */}
      <div className="flex gap-6">
        {/* Left Sidebar Navigation */}
        <div className="w-64 flex-shrink-0">
          <div className="bg-canvas-2 rounded-xl border overflow-hidden">
            <div className="p-4 bg-canvas-deep text-paper">
              <h3 className="font-semibold">Knowledge Base</h3>
              <p className="text-sm text-paper/70 mt-1">AI Training Data</p>
            </div>
            <nav className="p-2">
              {tabs.map(({ id, label, Icon }) => (
                <button
                  key={id}
                  onClick={() => setActiveTab(id)}
                  aria-current={activeTab === id ? 'page' : undefined}
                  className={`
                    w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors
                    focus:outline-none focus-visible:ring-2 focus-visible:ring-flare
                    ${activeTab === id
                      ? 'bg-flare/15 text-flare font-medium'
                      : 'text-muted hover:bg-canvas-deep'
                    }
                  `}
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{label}</span>
                </button>
              ))}
            </nav>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1">
          <div className="bg-canvas-2 rounded-xl border">
            {activeTab === 'dashboard' && (
              <DashboardTab 
                stats={stats} 
                documents={documents} 
                ragStatus={ragStatus}
                onToggleRAG={toggleRAG}
                onRefresh={() => { loadDocuments(); loadStats(); }}
                onUpload={() => setModalOpen('upload')}
                onAddUrl={() => setModalOpen('url')}
                onAddText={() => setModalOpen('text')}
                onReindex={handleReindex}
                onViewAll={() => setActiveTab('documents')}
              />
            )}
            {activeTab === 'documents' && (
              <DocumentsTab 
                documents={documents} 
                loading={loading} 
                onRefresh={loadDocuments}
                onUpload={() => setModalOpen('upload')}
                onAddUrl={() => setModalOpen('url')}
                onDelete={handleDeleteDocument}
              />
            )}
            {activeTab === 'context' && <ContextTab />}
            {activeTab === 'settings' && <SettingsTab />}
          </div>
        </div>
      </div>
    </div>
  )
}

function DashboardTab({ 
  stats, 
  documents, 
  ragStatus,
  onToggleRAG,
  onRefresh,
  onUpload,
  onAddUrl,
  onAddText,
  onReindex,
  onViewAll
}: { 
  stats: KBStats
  documents: Document[]
  ragStatus: RAGStatus
  onToggleRAG: (enabled: boolean) => void
  onRefresh: () => void
  onUpload: () => void
  onAddUrl: () => void
  onAddText: () => void
  onReindex: () => void
  onViewAll: () => void
}) {
  return (
    <div className="p-6">
      {/* RAG Status Banner */}
      <div className={`mb-6 p-4 rounded-xl border-2 ${ragStatus.enabled ? 'bg-mint/15 border-mint' : 'bg-sun/15 border-sun'}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {ragStatus.enabled
              ? <Brain className="h-6 w-6 text-mint" aria-hidden="true" />
              : <TriangleAlert className="h-6 w-6 text-sun" aria-hidden="true" />}
            <div>
              <h3 className="font-semibold text-paper">
                RAG (Retrieval-Augmented Generation)
              </h3>
              <p className="text-sm text-muted">
                {ragStatus.enabled 
                  ? 'AI can search your documents during conversations' 
                  : 'Enable RAG so AI can use your documents to answer questions'}
              </p>
            </div>
          </div>
          <button
            onClick={() => onToggleRAG(!ragStatus.enabled)}
            disabled={ragStatus.loading}
            className={`
              relative inline-flex h-8 w-14 items-center rounded-full transition-colors
              ${ragStatus.loading ? 'opacity-50 cursor-wait' : 'cursor-pointer'}
              ${ragStatus.enabled ? 'bg-mint' : 'bg-canvas-deep'}
            `}
          >
            <span
              className={`
                inline-block h-6 w-6 transform rounded-full bg-canvas-2  transition-transform
                ${ragStatus.enabled ? 'translate-x-7' : 'translate-x-1'}
              `}
            />
          </button>
        </div>
        {ragStatus.enabled && ragStatus.embeddingModel && (
          <p className="mt-2 text-xs text-muted">
            Embedding model: {ragStatus.embeddingModel}
          </p>
        )}
      </div>

      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold text-paper">Dashboard</h2>
          <p className="text-muted">Overview of your Knowledge Base</p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`px-3 py-1.5 rounded-full text-sm font-medium flex items-center gap-2 ${ragStatus.enabled ? 'bg-mint/15 text-mint' : 'bg-sun/15 text-sun'}`}>
            <span className={`w-2 h-2 rounded-full ${ragStatus.enabled ? 'bg-mint animate-pulse' : 'bg-sun'}`}></span>
            {ragStatus.enabled ? 'RAG Active' : 'RAG Disabled'}
          </span>
          <button 
            onClick={onRefresh}
            className="px-4 py-2 border rounded-lg text-muted hover:bg-canvas-deep transition"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-canvas-2 rounded-xl border p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted">Total Documents</p>
              <p className="text-3xl font-bold text-paper mt-1">{stats.totalDocuments}</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-canvas-deep flex items-center justify-center">
              <FileText className="h-5 w-5 text-muted" aria-hidden="true" />
            </div>
          </div>
          <p className="text-sm mt-3 text-muted">PDFs, text files, URLs</p>
        </div>

        <div className="bg-canvas-2 rounded-xl border p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted">Text Chunks</p>
              <p className="text-3xl font-bold text-paper mt-1">{stats.totalChunks}</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-canvas-deep flex items-center justify-center">
              <Blocks className="h-5 w-5 text-muted" aria-hidden="true" />
            </div>
          </div>
          <p className="text-sm mt-3 text-flare">Indexed for retrieval</p>
        </div>

        <div className="bg-canvas-2 rounded-xl border p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted">Queries Today</p>
              <p className="text-3xl font-bold text-paper mt-1">{stats.totalQueries}</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-canvas-deep flex items-center justify-center">
              <Search className="h-5 w-5 text-muted" aria-hidden="true" />
            </div>
          </div>
          <p className="text-sm mt-3 text-mint">Knowledge lookups</p>
        </div>

        <div className="bg-canvas-2 rounded-xl border p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted">Avg Response</p>
              <p className="text-3xl font-bold text-paper mt-1">{stats.avgResponseTime}</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-canvas-deep flex items-center justify-center">
              <Zap className="h-5 w-5 text-muted" aria-hidden="true" />
            </div>
          </div>
          <p className="text-sm mt-3 text-sun">Retrieval speed</p>
        </div>
      </div>

      {/* Quick Actions & Recent Documents */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Quick Actions */}
        <div className="bg-canvas-2 rounded-xl border p-6">
          <h3 className="text-lg font-semibold text-paper mb-4">Quick Actions</h3>
          <div className="space-y-3">
            <button 
              onClick={onUpload}
              className="w-full flex items-center gap-3 p-3 bg-canvas-deep text-muted rounded-lg hover:bg-canvas-deep transition"
            >
              <span className="font-medium">Upload Document</span>
            </button>
            <button 
              onClick={onAddUrl}
              className="w-full flex items-center gap-3 p-3 bg-flare/15 text-flare rounded-lg hover:bg-flare/15 transition"
            >
              <span className="font-medium">Add URL</span>
            </button>
            <button 
              onClick={onAddText}
              className="w-full flex items-center gap-3 p-3 bg-mint/15 text-mint rounded-lg hover:bg-mint/15 transition"
            >
              <span className="font-medium">Add Text Content</span>
            </button>
            <button 
              onClick={onReindex}
              className="w-full flex items-center gap-3 p-3 bg-canvas-deep text-muted rounded-lg hover:bg-canvas-deep transition"
            >
              <span className="font-medium">Re-index All</span>
            </button>
          </div>
        </div>

        {/* Recent Documents */}
        <div className="lg:col-span-2 bg-canvas-2 rounded-xl border p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-paper">Recent Documents</h3>
            <button 
              onClick={onViewAll}
              className="text-muted text-sm font-medium hover:underline"
            >
              View All →
            </button>
          </div>
          {documents.length === 0 ? (
            <div className="text-center py-8 text-muted">
              <p className="mt-2">No documents yet</p>
              <p className="text-sm">Upload documents to train your AI</p>
            </div>
          ) : (
            <div className="space-y-3">
              {documents.slice(0, 5).map((doc, i) => (
                <div key={doc.id || i} className="flex items-center justify-between p-3 bg-canvas-deep rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-canvas-deep rounded-lg flex items-center justify-center">
                      <FileText className="h-4 w-4 text-muted" aria-hidden="true" />
                    </div>
                    <div>
                      <p className="font-medium text-paper">{doc.name}</p>
                      <p className="text-xs text-muted">{doc.size || 'Unknown size'}</p>
                    </div>
                  </div>
                  <span className="text-xs text-muted">{doc.addedAt || 'Recently added'}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function DocumentsTab({ 
  documents, 
  loading, 
  onRefresh,
  onUpload,
  onAddUrl,
  onDelete
}: { 
  documents: Document[]
  loading: boolean
  onRefresh: () => void
  onUpload: () => void
  onAddUrl: () => void
  onDelete: (id: string) => void
}) {
  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-paper"> Documents</h2>
          <p className="text-muted">Upload and manage training documents</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={onRefresh}
            className="px-4 py-2 border rounded-lg text-muted hover:bg-canvas-deep transition"
          >
            Refresh
          </button>
          <button 
            onClick={onUpload}
            className="px-4 py-2 bg-canvas-deep text-paper rounded-lg hover:opacity-90 transition shadow-blue-500/25"
          >
            + Add Document
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted">Loading documents...</div>
      ) : documents.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed rounded-xl">
          <p className="mt-4 text-muted font-medium">No documents yet</p>
          <p className="text-sm text-muted mt-1">Upload PDFs, text files, or add URLs to build your knowledge base</p>
          <div className="flex gap-3 justify-center mt-4">
            <button 
              onClick={onUpload}
              className="px-4 py-2 bg-canvas-deep text-paper rounded-lg hover:opacity-90 transition"
            >
              Upload File
            </button>
            <button 
              onClick={onAddUrl}
              className="px-4 py-2 border border-line text-muted rounded-lg hover:bg-canvas-deep transition"
            >
              Add URL
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {documents.map((doc) => (
            <div key={doc.id} className="flex items-center justify-between p-4 bg-canvas-deep rounded-xl hover:bg-canvas-deep transition">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-canvas-deep rounded-lg flex items-center justify-center">
                  <FileText className="h-5 w-5 text-muted" aria-hidden="true" />
                </div>
                <div>
                  <p className="font-medium text-paper">{doc.name}</p>
                  <p className="text-sm text-muted">{doc.size || 'Unknown size'} • {doc.type || 'Document'}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button className="px-3 py-1.5 text-muted hover:bg-canvas-deep rounded-lg transition text-sm">
                  View
                </button>
                <button 
                  onClick={() => onDelete(doc.id)}
                  className="px-3 py-1.5 text-flare hover:bg-flare/15 rounded-lg transition text-sm"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ContextTab() {
  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-paper"> Context Rules</h2>
          <p className="text-muted">Define how the AI should respond and behave</p>
        </div>
        <button className="px-4 py-2 bg-canvas-deep text-paper rounded-lg hover:opacity-90 transition shadow-blue-500/25">
          + Add Rule
        </button>
      </div>
      
      <div className="space-y-6">
        <div className="p-6 bg-canvas-deep rounded-xl">
          <label className="block text-sm font-medium text-muted mb-2">System Prompt</label>
          <textarea
            className="w-full p-4 border rounded-lg resize-none focus:ring-2 focus:ring-flare focus:border-transparent bg-canvas-2"
            rows={5}
            placeholder="Define the AI's personality, role, and behavior guidelines..."
          />
          <p className="text-xs text-muted mt-2">This sets the overall tone and behavior of your AI assistant</p>
        </div>
        
        <div className="p-6 bg-canvas-deep rounded-xl">
          <label className="block text-sm font-medium text-muted mb-2">Business Context</label>
          <textarea
            className="w-full p-4 border rounded-lg resize-none focus:ring-2 focus:ring-flare focus:border-transparent bg-canvas-2"
            rows={5}
            placeholder="Describe your business, products, services, and key information..."
          />
          <p className="text-xs text-muted mt-2">Provide background information about your organization</p>
        </div>

        <div className="p-6 bg-canvas-deep rounded-xl">
          <label className="block text-sm font-medium text-muted mb-2">Response Guidelines</label>
          <textarea
            className="w-full p-4 border rounded-lg resize-none focus:ring-2 focus:ring-flare focus:border-transparent bg-canvas-2"
            rows={4}
            placeholder="Specify how the AI should format responses, handle questions, etc..."
          />
        </div>

        <button className="px-6 py-3 bg-canvas-deep text-paper rounded-lg hover:opacity-90 transition shadow-blue-500/25">
          Save Context Rules
        </button>
      </div>
    </div>
  )
}

function SettingsTab() {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-paper"> Settings</h2>
        <p className="text-muted">Configure your Knowledge Base</p>
      </div>

      <div className="max-w-2xl space-y-6">
        <div className="p-6 bg-canvas-deep rounded-xl">
          <h3 className="font-semibold text-paper mb-4">ElevenLabs Integration</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-muted mb-1">Agent ID</label>
              <input
                type="text"
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-flare focus:border-transparent"
                placeholder="agent_xxxxx"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-muted mb-1">API Key</label>
              <input
                type="password"
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-flare focus:border-transparent"
                placeholder="••••••••••••••••"
              />
            </div>
          </div>
        </div>

        <div className="p-6 bg-canvas-deep rounded-xl">
          <h3 className="font-semibold text-paper mb-4">Retrieval Settings</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-muted mb-1">Chunk Size</label>
              <select className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-flare">
                <option>512 tokens (default)</option>
                <option>256 tokens</option>
                <option>1024 tokens</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-muted mb-1">Top K Results</label>
              <input
                type="number"
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-flare"
                defaultValue={5}
              />
            </div>
          </div>
        </div>

        <button className="px-6 py-3 bg-canvas-deep text-paper rounded-lg hover:opacity-90 transition shadow-blue-500/25">
          Save Settings
        </button>
      </div>
    </div>
  )
}

// Document Modal Component
function DocumentModal({ 
  type, 
  onClose, 
  onSubmit 
}: { 
  type: 'upload' | 'url' | 'text'
  onClose: () => void
  onSubmit: (doc: { id: string; name: string; type: string; size: string; content?: string }) => void
}) {
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [content, setContent] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleSubmit = async () => {
    setUploading(true)
    setError(null)

    try {
      if (type === 'upload' && file) {
        // Actually upload the file to the backend API
        const formData = new FormData()
        formData.append('file', file)
        formData.append('name', file.name)

        const res = await fetch('/api/knowledge-base/documents/upload', {
          method: 'POST',
          body: formData,
        })

        if (!res.ok) {
          const data = await res.json()
          throw new Error(data.error || data.message || 'Upload failed')
        }

        const data = await res.json()
        onSubmit({
          id: data.document.id,
          name: data.document.name,
          type: data.document.type || 'file',
          size: formatFileSize(file.size),
        })
      } else if (type === 'url' && url) {
        // Add URL via API
        const res = await fetch('/api/knowledge-base/documents/url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url, name: name || url }),
        })

        if (!res.ok) {
          const data = await res.json()
          throw new Error(data.error || data.message || 'Failed to add URL')
        }

        const data = await res.json()
        onSubmit({
          id: data.document.id,
          name: data.document.name,
          type: 'url',
          size: 'Web content',
          content: url,
        })
      } else if (type === 'text' && name && content) {
        // Add text content via API
        const res = await fetch('/api/knowledge-base/documents/text', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, text: content }),
        })

        if (!res.ok) {
          const data = await res.json()
          throw new Error(data.error || data.message || 'Failed to add text')
        }

        const data = await res.json()
        onSubmit({
          id: data.document.id,
          name: data.document.name,
          type: 'text',
          size: `${content.length} chars`,
          content: content,
        })
      }
    } catch (err) {
      console.error('Upload error:', err)
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  const titles: Record<string, string> = {
    upload: 'Upload Document',
    url: 'Add URL',
    text: 'Add Text Content',
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-canvas-2 rounded-2xl w-full max-w-lg mx-4 overflow-hidden">
        {/* Header */}
        <div className="p-6 bg-canvas-deep text-paper">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold">{titles[type]}</h2>
            <button onClick={onClose} className="text-paper/70 hover:text-paper text-2xl">
              ×
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {type === 'upload' && (
            <div className="space-y-4">
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed rounded-xl p-8 text-center cursor-pointer hover:border-line hover:bg-canvas-deep transition"
              >
                {file ? (
                  <div>
                    <p className="mt-2 font-medium text-paper">{file.name}</p>
                    <p className="text-sm text-muted">{formatFileSize(file.size)}</p>
                  </div>
                ) : (
                  <div>
                    <p className="mt-2 font-medium text-muted">Click to select a file</p>
                    <p className="text-sm text-muted">PDF, TXT, DOCX, or MD</p>
                  </div>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept=".pdf,.txt,.docx,.md,.doc"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
            </div>
          )}

          {type === 'url' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-muted mb-2">URL</label>
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://example.com/document"
                  className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-flare focus:border-transparent"
                />
              </div>
              <p className="text-sm text-muted">
                The content from this URL will be fetched and added to your knowledge base.
              </p>
            </div>
          )}

          {type === 'text' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-muted mb-2">Document Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Product FAQ"
                  className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-flare focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted mb-2">Content</label>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Paste or type your content here..."
                  rows={8}
                  className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-flare focus:border-transparent resize-none"
                />
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="mt-4 p-3 bg-flare/15 border border-flare rounded-lg text-flare text-sm">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 bg-canvas-deep flex gap-3 justify-end">
          <button
            onClick={onClose}
            disabled={uploading}
            className="px-6 py-2.5 border rounded-lg text-muted hover:bg-canvas-deep transition disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={uploading || (type === 'upload' && !file) || (type === 'url' && !url) || (type === 'text' && (!name || !content))}
            className="px-6 py-2.5 bg-canvas-deep text-paper rounded-lg hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {uploading ? (
              <>
                <span className="animate-spin">⏳</span>
                Uploading...
              </>
            ) : (
              'Add Document'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
