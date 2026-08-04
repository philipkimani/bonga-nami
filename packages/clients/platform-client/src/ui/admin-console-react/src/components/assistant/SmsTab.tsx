import { useState, useEffect, useRef } from 'react'

interface Conversation {
  id: string
  contactId: string
  channel: string
  status: string
  startedAt: string
  aiHandledCount: number
  escalatedAt?: string
  escalationReason?: string
}

interface Message {
  id: string
  conversationId: string
  direction: string
  sender: 'customer' | 'ai' | 'human'
  content: string
  smsStatus: string
  createdAt: string
}

interface EscalationItem {
  conversationId: string
  phoneNumber: string
  reason: string
  timestamp: string
  lastMessage: string
}

export default function SmsTab() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [filter, setFilter] = useState<'all' | 'escalated'>('all')
  const [showBulkModal, setShowBulkModal] = useState(false)
  const [showNewModal, setShowNewModal] = useState(false)
  const [replyText, setReplyText] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [escalationQueue, setEscalationQueue] = useState<EscalationItem[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [bulkCampaignName, setBulkCampaignName] = useState('')
  const [bulkTemplate, setBulkTemplate] = useState('')
  const [bulkRecipients, setBulkRecipients] = useState('')
  const [newPhone, setNewPhone] = useState('')
  const [newMessage, setNewMessage] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const escalatedCount = conversations.filter(c => c.status === 'escalated').length

  // Load conversations + escalation queue
  useEffect(() => {
    loadConversations()
    loadEscalationQueue()
    const interval = setInterval(() => {
      loadConversations()
      loadEscalationQueue()
    }, 10000)
    return () => clearInterval(interval)
  }, [])

  // Load messages when conversation selected
  useEffect(() => {
    if (selectedConversation) {
      loadMessages(selectedConversation.id)
      const interval = setInterval(() => loadMessages(selectedConversation.id), 8000)
      return () => clearInterval(interval)
    }
  }, [selectedConversation?.id])

  // Auto-scroll messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function loadConversations() {
    try {
      const res = await fetch('/api/admin-assistant/sms/conversations')
      if (res.ok) {
        const data = await res.json()
        setConversations(data.conversations || [])
      }
    } catch (e) {
      console.error('Failed to load conversations:', e)
    } finally {
      setLoading(false)
    }
  }

  async function loadMessages(conversationId: string) {
    try {
      const res = await fetch(`/api/admin-assistant/sms/conversations/${conversationId}/messages`)
      if (res.ok) {
        const data = await res.json()
        setMessages(data.messages || [])
      }
    } catch (e) {
      console.error('Failed to load messages:', e)
    }
  }

  async function loadEscalationQueue() {
    try {
      const res = await fetch('/api/admin-assistant/sms/queue')
      if (res.ok) {
        const data = await res.json()
        setEscalationQueue(data.queue || [])
      }
    } catch (e) {
      console.error('Failed to load queue:', e)
    }
  }

  async function sendReply() {
    if (!replyText.trim() || !selectedConversation) return
    setSending(true)
    try {
      const isEscalated = selectedConversation.status === 'escalated'
      const endpoint = isEscalated
        ? `/api/admin-assistant/sms/queue/${selectedConversation.id}/reply`
        : '/api/admin-assistant/sms/send'
      
      const body = isEscalated
        ? { message: replyText }
        : { to: selectedConversation.contactId, message: replyText, conversationId: selectedConversation.id }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        setReplyText('')
        await loadMessages(selectedConversation.id)
        await loadConversations()
        await loadEscalationQueue()
      }
    } catch (e) {
      console.error('Failed to send:', e)
    } finally {
      setSending(false)
    }
  }

  async function sendNewMessage() {
    if (!newPhone.trim() || !newMessage.trim()) return
    setSending(true)
    try {
      const res = await fetch('/api/admin-assistant/sms/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: newPhone, message: newMessage }),
      })
      if (res.ok) {
        setNewPhone('')
        setNewMessage('')
        setShowNewModal(false)
        await loadConversations()
      }
    } catch (e) {
      console.error('Failed to send:', e)
    } finally {
      setSending(false)
    }
  }

  async function sendBulk(e: React.FormEvent) {
    e.preventDefault()
    if (!bulkTemplate.trim() || !bulkRecipients.trim()) return
    setSending(true)
    try {
      const recipients = bulkRecipients.split('\n').filter(l => l.trim()).map(line => {
        const [phone, name] = line.split(',').map(s => s.trim())
        return { phone, variables: name ? { name } : {} }
      })
      const res = await fetch('/api/admin-assistant/sms/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipients,
          messageTemplate: bulkTemplate,
          campaignName: bulkCampaignName || 'Unnamed Campaign',
        }),
      })
      if (res.ok) {
        const data = await res.json()
        alert(`Campaign sent! ${data.successful}/${recipients.length} delivered`)
        setShowBulkModal(false)
        setBulkCampaignName('')
        setBulkTemplate('')
        setBulkRecipients('')
      }
    } catch (e) {
      console.error('Bulk send failed:', e)
    } finally {
      setSending(false)
    }
  }

  const filteredConversations = conversations
    .filter(c => {
      if (filter === 'escalated') return c.status === 'escalated'
      return true
    })
    .filter(c => !searchTerm || c.contactId.includes(searchTerm))

  return (
    <div className="flex h-[700px]">
      {/* Conversations List */}
      <div className="w-80 border-r flex flex-col">
        <div className="p-4 border-b">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-paper">SMS Conversations</h3>
            <div className="flex gap-2">
              <button
                onClick={() => setShowNewModal(true)}
                className="text-sm text-flare-ink hover:underline"
              >
                + New
              </button>
              <button
                onClick={() => setShowBulkModal(true)}
                className="text-sm text-flare-ink hover:underline"
              >
                Bulk
              </button>
            </div>
          </div>
          <input
            type="search"
            placeholder="Search by phone..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg text-sm"
          />
        </div>

        {/* Tabs */}
        <div className="flex border-b">
          <button
            onClick={() => setFilter('all')}
            className={`flex-1 px-4 py-2 text-sm font-medium border-b-2 transition ${
              filter === 'all' ? 'border-flare text-flare-ink' : 'border-transparent text-muted'
            }`}
          >
            All ({conversations.length})
          </button>
          <button
            onClick={() => setFilter('escalated')}
            className={`flex-1 px-4 py-2 text-sm font-medium border-b-2 transition flex items-center justify-center gap-2 ${
              filter === 'escalated' ? 'border-flare text-flare-ink' : 'border-transparent text-muted'
            }`}
          >
            Escalated
            {escalatedCount > 0 && (
              <span className="px-1.5 py-0.5 bg-sun/20 text-sun-ink rounded text-xs">
                {escalatedCount}
              </span>
            )}
          </button>
        </div>

        {/* Conversation List */}
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="p-8 text-center text-muted">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-flare mx-auto" />
              <p className="mt-2 text-sm">Loading conversations...</p>
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="p-8 text-center text-muted">
              <p className="mt-2">No SMS conversations yet</p>
              <p className="text-sm mt-1">Messages will appear when customers text your Twilio number</p>
            </div>
          ) : (
            <div>
              {filteredConversations.map((conv) => (
                <button
                  key={conv.id}
                  onClick={() => setSelectedConversation(conv)}
                  className={`w-full p-4 border-b text-left hover:bg-canvas-deep transition ${
                    selectedConversation?.id === conv.id ? 'bg-flare/12' : ''
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-paper text-sm">{conv.contactId}</span>
                    <span className="text-xs text-muted">
                      {new Date(conv.startedAt).toLocaleTimeString()}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className={`px-2 py-0.5 rounded text-xs ${
                      conv.status === 'escalated' ? 'bg-sun/20 text-sun-ink' :
                      conv.status === 'active' ? 'bg-mint/15 text-mint-ink' :
                      'bg-canvas-deep text-muted'
                    }`}>
                      {conv.status}
                    </span>
                    <span className="text-xs text-muted">{conv.aiHandledCount} AI msgs</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Escalation Queue Summary */}
        {escalationQueue.length > 0 && (
          <div className="p-3 border-t bg-sun/20">
            <div className="flex items-center gap-2 text-sm text-sun-ink">
              <span className="font-medium">{escalationQueue.length} waiting for human</span>
            </div>
          </div>
        )}
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Chat Header */}
        <div className="p-4 border-b flex items-center justify-between bg-canvas-deep">
          {selectedConversation ? (
            <div>
              <h2 className="font-semibold text-paper">{selectedConversation.contactId}</h2>
              <div className="flex items-center gap-2 mt-0.5">
                <span className={`text-xs px-2 py-0.5 rounded ${
                  selectedConversation.status === 'escalated' ? 'bg-sun/20 text-sun-ink' : 'bg-mint/15 text-mint-ink'
                }`}>
                  {selectedConversation.status}
                </span>
                {selectedConversation.escalationReason && (
                  <span className="text-xs text-muted">
                    Reason: {selectedConversation.escalationReason}
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div>
              <h2 className="font-semibold text-paper">Select a conversation</h2>
              <p className="text-sm text-muted">Choose a conversation from the list</p>
            </div>
          )}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-auto p-4 bg-canvas-deep">
          {!selectedConversation ? (
            <div className="flex items-center justify-center h-full text-muted">
              <div className="text-center">
                <p className="mt-4">Select a conversation to view messages</p>
              </div>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex items-center justify-center h-full text-muted">
              <p>No messages in this conversation</p>
            </div>
          ) : (
            <div className="space-y-3">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.sender === 'customer' ? 'justify-start' : 'justify-end'}`}
                >
                  <div className={`max-w-[70%] rounded-2xl px-4 py-2 ${
                    msg.sender === 'customer' ? 'bg-canvas-deep text-paper' :
                    msg.sender === 'ai' ? 'bg-canvas-deep text-paper' :
                    'bg-mint text-paper'
                  }`}>
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                    <p className={`text-xs mt-1 ${
                      msg.sender === 'customer' ? 'text-muted' : 'text-paper/70'
                    }`}>
                      {new Date(msg.createdAt).toLocaleTimeString()} • {
                        msg.sender === 'customer' ? 'Customer' : msg.sender === 'ai' ? 'AI' : 'Agent'
                      }
                      {msg.smsStatus && msg.sender !== 'customer' && (
                        <> • {msg.smsStatus}</>
                      )}
                    </p>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Reply Input */}
        {selectedConversation && (
          <div className="p-4 border-t bg-canvas-2">
            <div className="flex gap-3">
              <input
                type="text"
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendReply()}
                placeholder={selectedConversation.status === 'escalated'
                  ? 'Reply to escalated conversation...'
                  : 'Type a reply...'}
                className="flex-1 px-4 py-2 border rounded-lg focus:ring-2 focus:ring-flare-ink"
                disabled={sending}
              />
              <button
                onClick={sendReply}
                disabled={sending || !replyText.trim()}
                className="px-6 py-2 bg-canvas-deep text-paper rounded-lg hover:opacity-90 disabled:opacity-50"
              >
                {sending ? 'Sending...' : 'Send'}
              </button>
            </div>
            <p className="text-xs text-muted mt-2">
              {selectedConversation.status === 'escalated'
                ? 'Escalated — your reply will be sent directly via SMS and remove from queue.'
                : 'Replying as human agent. AI will not respond while you\'re active.'}
            </p>
          </div>
        )}
      </div>

      {/* Bulk SMS Modal */}
      {showBulkModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-canvas-2 rounded-xl p-6 w-[500px]">
            <h3 className="text-lg font-semibold mb-4"> Bulk SMS Campaign</h3>
            <form onSubmit={sendBulk}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-muted mb-1">Campaign Name</label>
                <input
                  type="text"
                  value={bulkCampaignName}
                  onChange={(e) => setBulkCampaignName(e.target.value)}
                  placeholder="e.g., Flash Sale Alert"
                  className="w-full px-4 py-2 border rounded-lg"
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-muted mb-1">Message Template</label>
                <textarea
                  rows={3}
                  value={bulkTemplate}
                  onChange={(e) => setBulkTemplate(e.target.value)}
                  placeholder="Hello {{name}}, we have a special offer for you!"
                  className="w-full px-4 py-2 border rounded-lg"
                  required
                />
                <p className="text-xs text-muted mt-1">Use {'{{name}}'} for personalization</p>
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-muted mb-1">Recipients (one per line)</label>
                <textarea
                  rows={5}
                  value={bulkRecipients}
                  onChange={(e) => setBulkRecipients(e.target.value)}
                  placeholder={"+254712345678,John\n+254723456789,Jane"}
                  className="w-full px-4 py-2 border rounded-lg font-mono text-sm"
                  required
                />
                <p className="text-xs text-muted mt-1">Format: phone,name</p>
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowBulkModal(false)}
                  className="flex-1 px-4 py-2 border rounded-lg hover:bg-canvas-deep"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={sending}
                  className="flex-1 px-4 py-2 bg-canvas-deep text-paper rounded-lg hover:opacity-90 disabled:opacity-50"
                >
                  {sending ? 'Sending...' : 'Send Campaign'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* New SMS Modal */}
      {showNewModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-canvas-2 rounded-xl p-6 w-[450px]">
            <h3 className="text-lg font-semibold mb-4"> New SMS</h3>
            <div className="mb-4">
              <label className="block text-sm font-medium text-muted mb-1">Phone Number</label>
              <input
                type="tel"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                placeholder="+254712345678"
                className="w-full px-4 py-2 border rounded-lg"
              />
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-muted mb-1">Message</label>
              <textarea
                rows={3}
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="Type your message..."
                className="w-full px-4 py-2 border rounded-lg"
              />
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowNewModal(false)}
                className="flex-1 px-4 py-2 border rounded-lg hover:bg-canvas-deep"
              >
                Cancel
              </button>
              <button
                onClick={sendNewMessage}
                disabled={sending || !newPhone.trim() || !newMessage.trim()}
                className="flex-1 px-4 py-2 bg-canvas-deep text-paper rounded-lg hover:opacity-90 disabled:opacity-50"
              >
                {sending ? 'Sending...' : 'Send'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
