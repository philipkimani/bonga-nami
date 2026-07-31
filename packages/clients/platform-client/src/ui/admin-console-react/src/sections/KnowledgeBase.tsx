import { useState, useEffect, useRef } from 'react'

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

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: '📊' },
    { id: 'documents', label: 'Documents', icon: '📄' },
    { id: 'context', label: 'Context Rules', icon: '🎯' },
    { id: 'settings', label: 'Settings', icon: '⚙️' },
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
          <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
            <div className="p-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white">
              <h3 className="font-semibold">📚 Knowledge Base</h3>
              <p className="text-sm text-white/70 mt-1">AI Training Data</p>
            </div>
            <nav className="p-2">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`
                    w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-all
                    ${activeTab === tab.id
                      ? 'bg-blue-50 text-blue-700 font-medium'
                      : 'text-gray-600 hover:bg-gray-50'
                    }
                  `}
                >
                  <span className="text-lg">{tab.icon}</span>
                  <span>{tab.label}</span>
                </button>
              ))}
            </nav>
            <div className="p-4 border-t text-xs text-gray-400 text-center">
              <p>© 2026 Ruskins AI Consulting LTD</p>
            </div>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1">
          <div className="bg-white rounded-xl shadow-sm border">
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
      <div className={`mb-6 p-4 rounded-xl border-2 ${ragStatus.enabled ? 'bg-green-50 border-green-200' : 'bg-yellow-50 border-yellow-200'}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{ragStatus.enabled ? '🧠' : '⚠️'}</span>
            <div>
              <h3 className="font-semibold text-gray-900">
                RAG (Retrieval-Augmented Generation)
              </h3>
              <p className="text-sm text-gray-600">
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
              ${ragStatus.enabled ? 'bg-green-500' : 'bg-gray-300'}
            `}
          >
            <span
              className={`
                inline-block h-6 w-6 transform rounded-full bg-white shadow-lg transition-transform
                ${ragStatus.enabled ? 'translate-x-7' : 'translate-x-1'}
              `}
            />
          </button>
        </div>
        {ragStatus.enabled && ragStatus.embeddingModel && (
          <p className="mt-2 text-xs text-gray-500">
            Embedding model: {ragStatus.embeddingModel}
          </p>
        )}
      </div>

      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Dashboard</h2>
          <p className="text-gray-500">Overview of your Knowledge Base</p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`px-3 py-1.5 rounded-full text-sm font-medium flex items-center gap-2 ${ragStatus.enabled ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
            <span className={`w-2 h-2 rounded-full ${ragStatus.enabled ? 'bg-green-500 animate-pulse' : 'bg-yellow-500'}`}></span>
            {ragStatus.enabled ? 'RAG Active' : 'RAG Disabled'}
          </span>
          <button 
            onClick={onRefresh}
            className="px-4 py-2 border rounded-lg text-gray-600 hover:bg-gray-50 transition"
          >
            🔄 Refresh
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-xl border p-6 card-hover">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Total Documents</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">{stats.totalDocuments}</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-2xl">
              📄
            </div>
          </div>
          <p className="text-sm mt-3 text-blue-600">PDFs, text files, URLs</p>
        </div>

        <div className="bg-white rounded-xl border p-6 card-hover">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Text Chunks</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">{stats.totalChunks}</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center text-2xl">
              🧩
            </div>
          </div>
          <p className="text-sm mt-3 text-purple-600">Indexed for retrieval</p>
        </div>

        <div className="bg-white rounded-xl border p-6 card-hover">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Queries Today</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">{stats.totalQueries}</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center text-2xl">
              🔍
            </div>
          </div>
          <p className="text-sm mt-3 text-green-600">Knowledge lookups</p>
        </div>

        <div className="bg-white rounded-xl border p-6 card-hover">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Avg Response</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">{stats.avgResponseTime}</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center text-2xl">
              ⚡
            </div>
          </div>
          <p className="text-sm mt-3 text-orange-600">Retrieval speed</p>
        </div>
      </div>

      {/* Quick Actions & Recent Documents */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Quick Actions */}
        <div className="bg-white rounded-xl border p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h3>
          <div className="space-y-3">
            <button 
              onClick={onUpload}
              className="w-full flex items-center gap-3 p-3 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition"
            >
              <span className="text-xl">📤</span>
              <span className="font-medium">Upload Document</span>
            </button>
            <button 
              onClick={onAddUrl}
              className="w-full flex items-center gap-3 p-3 bg-purple-50 text-purple-700 rounded-lg hover:bg-purple-100 transition"
            >
              <span className="text-xl">🔗</span>
              <span className="font-medium">Add URL</span>
            </button>
            <button 
              onClick={onAddText}
              className="w-full flex items-center gap-3 p-3 bg-green-50 text-green-700 rounded-lg hover:bg-green-100 transition"
            >
              <span className="text-xl">📝</span>
              <span className="font-medium">Add Text Content</span>
            </button>
            <button 
              onClick={onReindex}
              className="w-full flex items-center gap-3 p-3 bg-gray-50 text-gray-700 rounded-lg hover:bg-gray-100 transition"
            >
              <span className="text-xl">🔄</span>
              <span className="font-medium">Re-index All</span>
            </button>
          </div>
        </div>

        {/* Recent Documents */}
        <div className="lg:col-span-2 bg-white rounded-xl border p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Recent Documents</h3>
            <button 
              onClick={onViewAll}
              className="text-blue-600 text-sm font-medium hover:underline"
            >
              View All →
            </button>
          </div>
          {documents.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <span className="text-4xl">📁</span>
              <p className="mt-2">No documents yet</p>
              <p className="text-sm">Upload documents to train your AI</p>
            </div>
          ) : (
            <div className="space-y-3">
              {documents.slice(0, 5).map((doc, i) => (
                <div key={doc.id || i} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center text-lg">
                      📄
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{doc.name}</p>
                      <p className="text-xs text-gray-500">{doc.size || 'Unknown size'}</p>
                    </div>
                  </div>
                  <span className="text-xs text-gray-400">{doc.addedAt || 'Recently added'}</span>
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
          <h2 className="text-2xl font-bold text-gray-900">📄 Documents</h2>
          <p className="text-gray-500">Upload and manage training documents</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={onRefresh}
            className="px-4 py-2 border rounded-lg text-gray-600 hover:bg-gray-50 transition"
          >
            🔄 Refresh
          </button>
          <button 
            onClick={onUpload}
            className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg hover:opacity-90 transition shadow-lg shadow-blue-500/25"
          >
            + Add Document
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading documents...</div>
      ) : documents.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed rounded-xl">
          <span className="text-5xl">📁</span>
          <p className="mt-4 text-gray-600 font-medium">No documents yet</p>
          <p className="text-sm text-gray-500 mt-1">Upload PDFs, text files, or add URLs to build your knowledge base</p>
          <div className="flex gap-3 justify-center mt-4">
            <button 
              onClick={onUpload}
              className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg hover:opacity-90 transition"
            >
              📤 Upload File
            </button>
            <button 
              onClick={onAddUrl}
              className="px-4 py-2 border border-blue-600 text-blue-600 rounded-lg hover:bg-blue-50 transition"
            >
              🔗 Add URL
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {documents.map((doc) => (
            <div key={doc.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center text-2xl">
                  📄
                </div>
                <div>
                  <p className="font-medium text-gray-900">{doc.name}</p>
                  <p className="text-sm text-gray-500">{doc.size || 'Unknown size'} • {doc.type || 'Document'}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button className="px-3 py-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition text-sm">
                  View
                </button>
                <button 
                  onClick={() => onDelete(doc.id)}
                  className="px-3 py-1.5 text-red-600 hover:bg-red-50 rounded-lg transition text-sm"
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
          <h2 className="text-2xl font-bold text-gray-900">🎯 Context Rules</h2>
          <p className="text-gray-500">Define how the AI should respond and behave</p>
        </div>
        <button className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg hover:opacity-90 transition shadow-lg shadow-blue-500/25">
          + Add Rule
        </button>
      </div>
      
      <div className="space-y-6">
        <div className="p-6 bg-gray-50 rounded-xl">
          <label className="block text-sm font-medium text-gray-700 mb-2">System Prompt</label>
          <textarea
            className="w-full p-4 border rounded-lg resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
            rows={5}
            placeholder="Define the AI's personality, role, and behavior guidelines..."
          />
          <p className="text-xs text-gray-500 mt-2">This sets the overall tone and behavior of your AI assistant</p>
        </div>
        
        <div className="p-6 bg-gray-50 rounded-xl">
          <label className="block text-sm font-medium text-gray-700 mb-2">Business Context</label>
          <textarea
            className="w-full p-4 border rounded-lg resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
            rows={5}
            placeholder="Describe your business, products, services, and key information..."
          />
          <p className="text-xs text-gray-500 mt-2">Provide background information about your organization</p>
        </div>

        <div className="p-6 bg-gray-50 rounded-xl">
          <label className="block text-sm font-medium text-gray-700 mb-2">Response Guidelines</label>
          <textarea
            className="w-full p-4 border rounded-lg resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
            rows={4}
            placeholder="Specify how the AI should format responses, handle questions, etc..."
          />
        </div>

        <button className="px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg hover:opacity-90 transition shadow-lg shadow-blue-500/25">
          💾 Save Context Rules
        </button>
      </div>
    </div>
  )
}

function SettingsTab() {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">⚙️ Settings</h2>
        <p className="text-gray-500">Configure your Knowledge Base</p>
      </div>

      <div className="max-w-2xl space-y-6">
        <div className="p-6 bg-gray-50 rounded-xl">
          <h3 className="font-semibold text-gray-900 mb-4">ElevenLabs Integration</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Agent ID</label>
              <input
                type="text"
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="agent_xxxxx"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">API Key</label>
              <input
                type="password"
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="••••••••••••••••"
              />
            </div>
          </div>
        </div>

        <div className="p-6 bg-gray-50 rounded-xl">
          <h3 className="font-semibold text-gray-900 mb-4">Retrieval Settings</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Chunk Size</label>
              <select className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500">
                <option>512 tokens (default)</option>
                <option>256 tokens</option>
                <option>1024 tokens</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Top K Results</label>
              <input
                type="number"
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                defaultValue={5}
              />
            </div>
          </div>
        </div>

        <button className="px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg hover:opacity-90 transition shadow-lg shadow-blue-500/25">
          💾 Save Settings
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
    upload: '📤 Upload Document',
    url: '🔗 Add URL',
    text: '📝 Add Text Content',
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        {/* Header */}
        <div className="p-6 bg-gradient-to-r from-blue-600 to-indigo-600 text-white">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold">{titles[type]}</h2>
            <button onClick={onClose} className="text-white/70 hover:text-white text-2xl">
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
                className="border-2 border-dashed rounded-xl p-8 text-center cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition"
              >
                {file ? (
                  <div>
                    <span className="text-4xl">📄</span>
                    <p className="mt-2 font-medium text-gray-900">{file.name}</p>
                    <p className="text-sm text-gray-500">{formatFileSize(file.size)}</p>
                  </div>
                ) : (
                  <div>
                    <span className="text-4xl">📤</span>
                    <p className="mt-2 font-medium text-gray-600">Click to select a file</p>
                    <p className="text-sm text-gray-400">PDF, TXT, DOCX, or MD</p>
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
                <label className="block text-sm font-medium text-gray-700 mb-2">URL</label>
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://example.com/document"
                  className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <p className="text-sm text-gray-500">
                The content from this URL will be fetched and added to your knowledge base.
              </p>
            </div>
          )}

          {type === 'text' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Document Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Product FAQ"
                  className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Content</label>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Paste or type your content here..."
                  rows={8}
                  className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                />
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              ❌ {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 bg-gray-50 flex gap-3 justify-end">
          <button
            onClick={onClose}
            disabled={uploading}
            className="px-6 py-2.5 border rounded-lg text-gray-600 hover:bg-gray-100 transition disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={uploading || (type === 'upload' && !file) || (type === 'url' && !url) || (type === 'text' && (!name || !content))}
            className="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
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
