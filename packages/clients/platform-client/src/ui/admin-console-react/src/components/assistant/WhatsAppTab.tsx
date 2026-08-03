import { useState, useEffect, useRef } from 'react'
import { Check, CheckCheck, Megaphone, MessageSquare, Phone, Send, Smile, User } from 'lucide-react'

interface Chat {
  id: string
  contactPhone: string
  contactName?: string
  lastMessage: string
  lastMessageAt: string
  unreadCount: number
  status: 'active' | 'escalated' | 'completed'
  aiHandled: boolean
}

interface Message {
  id: string
  direction: 'inbound' | 'outbound'
  sender: 'customer' | 'ai' | 'human'
  messageType: string
  content: string
  status: string
  createdAt: string
}

interface WhatsAppStatus {
  status: string
  elevenlabs: {
    configured: boolean
    agentId: string | null
    phoneNumberId: string | null
  }
  whatsapp: {
    enabled: boolean
    mode: string
  }
  activeConversations: number
  escalationQueue: number
}

export default function WhatsAppTab() {
  const [chats, setChats] = useState<Chat[]>([])
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [filter, setFilter] = useState<'all' | 'waiting'>('all')
  const [showBroadcastModal, setShowBroadcastModal] = useState(false)
  const [showNewMessageModal, setShowNewMessageModal] = useState(false)
  const [replyText, setReplyText] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState<WhatsAppStatus | null>(null)
  const [broadcastRecipients, setBroadcastRecipients] = useState('')
  const [broadcastMessage, setBroadcastMessage] = useState('')
  const [newMessagePhone, setNewMessagePhone] = useState('')
  const [newMessageText, setNewMessageText] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const waitingCount = chats.filter(c => c.status === 'escalated').length

  useEffect(() => {
    loadConversations()
    loadStatus()
    const interval = setInterval(loadConversations, 15000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function loadStatus() {
    try {
      const res = await fetch('/api/admin-assistant/whatsapp/status')
      if (res.ok) {
        const data = await res.json()
        setConnectionStatus(data)
      }
    } catch (e) {
      console.log('WhatsApp status not available')
    }
  }

  async function loadConversations() {
    try {
      const res = await fetch('/api/admin-assistant/whatsapp/conversations')
      if (res.ok) {
        const data = await res.json()
        setChats(data.conversations || [])
      }
    } catch (e) {
      console.log('WhatsApp conversations not available')
    } finally {
      setLoading(false)
    }
  }

  async function loadMessages(conversationId: string) {
    try {
      const res = await fetch(`/api/admin-assistant/whatsapp/conversations/${conversationId}`)
      if (res.ok) {
        const data = await res.json()
        setMessages(data.conversation?.messages || [])
      }
    } catch (e) {
      console.log('Messages not available')
    }
  }

  function selectChat(chat: Chat) {
    setSelectedChat(chat)
    loadMessages(chat.id)
  }

  async function sendReply() {
    if (!replyText.trim() || !selectedChat) return
    setSending(true)
    
    try {
      const res = await fetch('/api/admin-assistant/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: selectedChat.contactPhone,
          message: replyText,
          conversationId: selectedChat.id,
        }),
      })
      
      if (res.ok) {
        setMessages(prev => [...prev, {
          id: Date.now().toString(),
          direction: 'outbound',
          sender: 'human',
          messageType: 'text',
          content: replyText,
          status: 'sent',
          createdAt: new Date().toISOString(),
        }])
        setReplyText('')
      } else {
        const data = await res.json()
        alert('Failed to send: ' + (data.error || 'Unknown error'))
      }
    } catch (e: any) {
      alert('Error: ' + e.message)
    } finally {
      setSending(false)
    }
  }

  async function sendNewMessage() {
    if (!newMessagePhone || !newMessageText) return
    setSending(true)
    
    try {
      const res = await fetch('/api/admin-assistant/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: newMessagePhone,
          message: newMessageText,
        }),
      })
      
      if (res.ok) {
        setShowNewMessageModal(false)
        setNewMessagePhone('')
        setNewMessageText('')
        loadConversations()
      } else {
        const data = await res.json()
        alert('Failed: ' + (data.error || 'Unknown error'))
      }
    } catch (e: any) {
      alert('Error: ' + e.message)
    } finally {
      setSending(false)
    }
  }

  async function sendBroadcast(e: React.FormEvent) {
    e.preventDefault()
    if (!broadcastRecipients || !broadcastMessage) return
    setSending(true)
    
    const phones = broadcastRecipients.split('\n').map(p => p.trim()).filter(Boolean)
    
    try {
      const res = await fetch('/api/admin-assistant/whatsapp/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipients: phones.map(phone => ({ phone })),
          message: broadcastMessage,
          campaignName: `Broadcast ${new Date().toLocaleDateString()}`,
        }),
      })
      
      const data = await res.json()
      if (res.ok) {
        alert(`Broadcast sent! ${data.successful}/${data.totalRecipients} successful`)
        setShowBroadcastModal(false)
        setBroadcastRecipients('')
        setBroadcastMessage('')
      } else {
        alert('Failed: ' + (data.error || 'Unknown error'))
      }
    } catch (e: any) {
      alert('Error: ' + e.message)
    } finally {
      setSending(false)
    }
  }

  async function initiateVoiceCall(phone: string) {
    try {
      const res = await fetch('/api/admin-assistant/whatsapp/voice-call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: phone }),
      })
      const data = await res.json()
      if (res.ok) {
        alert('WhatsApp voice call initiated! ID: ' + data.callId)
      } else {
        alert('Failed: ' + (data.error || 'Unknown error'))
      }
    } catch (e: any) {
      alert('Error: ' + e.message)
    }
  }

  return (
    <div className="flex h-[700px]">
      {/* Chats List */}
      <div className="w-80 border-r flex flex-col">
        <div className="p-4 bg-whatsapp text-paper">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold"> WhatsApp</h3>
            <div className="flex gap-2">
              <button
                onClick={() => setShowNewMessageModal(true)}
                className="text-sm bg-canvas-2 px-3 py-1 rounded hover:bg-canvas-deep transition"
                title="New message"
              >
                New
              </button>
              <button
                onClick={() => setShowBroadcastModal(true)}
                className="text-sm bg-canvas-2 px-3 py-1 rounded hover:bg-canvas-deep transition"
              >
                <Megaphone className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>

          {/* Connection Status */}
          <div className={`text-xs px-2 py-1 rounded mb-2 ${
            connectionStatus?.status === 'connected' 
              ? 'bg-mint/30 text-mint' 
              : 'bg-flare/30 text-flare'
          }`}>
            {connectionStatus?.status === 'connected' 
              ? '● Connected via ElevenLabs' 
              : '○ Not configured — set up in Settings'}
          </div>

          <input
            type="search"
            placeholder="Search chats..."
            className="w-full px-3 py-2 rounded-lg text-sm text-paper"
          />
        </div>

        {/* Tabs */}
        <div className="flex border-b">
          <button
            onClick={() => setFilter('all')}
            className={`flex-1 px-4 py-2 text-sm font-medium border-b-2 transition ${
              filter === 'all' ? 'border-mint text-mint' : 'border-transparent text-muted'
            }`}
          >
            All Chats ({chats.length})
          </button>
          <button
            onClick={() => setFilter('waiting')}
            className={`flex-1 px-4 py-2 text-sm font-medium border-b-2 transition flex items-center justify-center gap-2 ${
              filter === 'waiting' ? 'border-mint text-mint' : 'border-transparent text-muted'
            }`}
          >
            Escalated
            {waitingCount > 0 && (
              <span className="px-1.5 py-0.5 bg-sun/15 text-sun rounded text-xs">
                {waitingCount}
              </span>
            )}
          </button>
        </div>

        {/* Chat List */}
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="p-8 text-center text-muted">
              <div className="animate-spin text-3xl mb-2">⏳</div>
              <p>Loading conversations...</p>
            </div>
          ) : chats.length === 0 ? (
            <div className="p-8 text-center text-muted">
              <p className="mt-2">No WhatsApp chats yet</p>
              <p className="text-sm mt-1">Conversations appear when customers message your WhatsApp Business number</p>
              <button
                onClick={() => setShowNewMessageModal(true)}
                className="mt-3 px-4 py-2 bg-whatsapp text-paper rounded-lg text-sm hover:opacity-90"
              >
                Send First Message
              </button>
            </div>
          ) : (
            <div>
              {chats
                .filter(c => filter === 'all' || c.status === 'escalated')
                .map((chat) => (
                  <button
                    key={chat.id}
                    onClick={() => selectChat(chat)}
                    className={`w-full p-3 border-b text-left hover:bg-canvas-deep transition flex items-center gap-3 ${
                      selectedChat?.id === chat.id ? 'bg-mint/15' : ''
                    }`}
                  >
                    <div className="w-12 h-12 bg-canvas-deep rounded-full flex items-center justify-center flex-shrink-0">
                      <User className="h-5 w-5 text-muted" aria-hidden="true" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-paper truncate">
                          {chat.contactName || chat.contactPhone}
                        </span>
                        <span className="text-xs text-muted">
                          {chat.lastMessageAt ? new Date(chat.lastMessageAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm text-muted truncate flex-1">{chat.lastMessage}</p>
                        {chat.aiHandled && (
                          <span className="text-xs bg-canvas-deep text-muted px-1 rounded">AI</span>
                        )}
                      </div>
                    </div>
                    {chat.unreadCount > 0 && (
                      <span className="w-5 h-5 bg-whatsapp text-paper rounded-full text-xs flex items-center justify-center flex-shrink-0">
                        {chat.unreadCount}
                      </span>
                    )}
                    {chat.status === 'escalated' && (
                      <span className="w-5 h-5 bg-sun text-paper rounded-full text-xs flex items-center justify-center flex-shrink-0">
                        !
                      </span>
                    )}
                  </button>
                ))}
            </div>
          )}
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Chat Header */}
        <div className="p-4 bg-whatsapp text-paper flex items-center justify-between">
          {selectedChat ? (
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-canvas-2 rounded-full flex items-center justify-center">
                <User className="h-5 w-5 text-muted" aria-hidden="true" />
              </div>
              <div>
                <h2 className="font-semibold">{selectedChat.contactName || selectedChat.contactPhone}</h2>
                <p className="text-sm text-paper/70">
                  {selectedChat.contactPhone}
                  {selectedChat.aiHandled && ' • AI Handling'}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-canvas-2 rounded-full flex items-center justify-center">
                <MessageSquare className="h-5 w-5 text-muted" aria-hidden="true" />
              </div>
              <div>
                <h2 className="font-semibold">Select a chat</h2>
                <p className="text-sm text-paper/70">Choose a conversation from the list</p>
              </div>
            </div>
          )}
          {selectedChat && (
            <div className="flex gap-2">
              <button
                onClick={() => initiateVoiceCall(selectedChat.contactPhone)}
                className="p-2 bg-canvas-2 rounded-full hover:bg-canvas-deep"
                title="WhatsApp Voice Call"
              >
                <Phone className="h-4 w-4" aria-hidden="true" />
              </button>
              <button className="p-2 bg-canvas-2 rounded-full hover:bg-canvas-deep" title="More options">
                ⋮
              </button>
            </div>
          )}
        </div>

        {/* Messages */}
        <div 
          className="flex-1 overflow-auto p-4"
          style={{ 
            background: '#e5ddd5',
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23d4ccc5' fill-opacity='0.4'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")` 
          }}
        >
          {!selectedChat ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center bg-canvas-2 p-8 rounded-lg shadow">
                <p className="mt-4 text-muted">Select a chat to view messages</p>
              </div>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center bg-canvas-2 p-8 rounded-lg shadow">
                <p className="text-muted">No messages in this chat yet</p>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.direction === 'inbound' ? 'justify-start' : 'justify-end'}`}
                >
                  <div className={`max-w-[65%] rounded-lg px-3 py-2 shadow ${
                    msg.sender === 'customer' ? 'bg-canvas-2' :
                    msg.sender === 'ai' ? 'bg-canvas-deep' :
                    'bg-mint/15'
                  }`}>
                    {msg.sender !== 'customer' && (
                      <span className={`text-xs font-medium ${
                        msg.sender === 'ai' ? 'text-muted' : 'text-mint'
                      }`}>
                        {msg.sender === 'ai' ? 'AI' : 'Agent'}
                      </span>
                    )}
                    <p className="text-paper">{msg.content}</p>
                    <div className="flex items-center justify-end gap-1 mt-1">
                      <span className="text-xs text-muted">
                        {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      {msg.direction === 'outbound' && (
                        <span className="text-xs text-muted">
                          {msg.status === 'read' || msg.status === 'delivered' ? <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" /> : <Check className="h-3.5 w-3.5" aria-hidden="true" />}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Reply Input */}
        {selectedChat && (
          <div className="p-3 bg-canvas-deep border-t flex items-end gap-2">
            <button className="p-2 text-muted hover:bg-canvas-deep rounded-full" aria-label="Add emoji"><Smile className="h-5 w-5" aria-hidden="true" /></button>
            <input
              type="text"
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && sendReply()}
              placeholder="Type a message"
              className="flex-1 px-4 py-3 rounded-full border focus:ring-2 focus:ring-mint"
              disabled={sending}
            />
            <button
              onClick={sendReply}
              disabled={sending || !replyText.trim()}
              className="p-3 bg-whatsapp text-paper rounded-full hover:opacity-90 disabled:opacity-50"
            >
              <Send className={`h-5 w-5 ${sending ? 'animate-pulse' : ''}`} aria-hidden="true" />
            </button>
          </div>
        )}
      </div>

      {/* New Message Modal */}
      {showNewMessageModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-canvas-2 rounded-xl p-6 w-[450px]">
            <h3 className="text-lg font-semibold mb-4"> New WhatsApp Message</h3>
            <div className="mb-4">
              <label className="block text-sm font-medium text-muted mb-1">Phone Number</label>
              <input
                type="text"
                value={newMessagePhone}
                onChange={(e) => setNewMessagePhone(e.target.value)}
                placeholder="+254712345678"
                className="w-full px-4 py-2 border rounded-lg font-mono"
              />
              <p className="text-xs text-muted mt-1">E.164 format with country code</p>
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-muted mb-1">Message</label>
              <textarea
                value={newMessageText}
                onChange={(e) => setNewMessageText(e.target.value)}
                rows={3}
                placeholder="Hello! How can we help you today?"
                className="w-full px-4 py-2 border rounded-lg"
              />
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => { setShowNewMessageModal(false); setNewMessagePhone(''); setNewMessageText('') }}
                className="flex-1 px-4 py-2 border rounded-lg hover:bg-canvas-deep"
              >
                Cancel
              </button>
              <button
                onClick={sendNewMessage}
                disabled={sending || !newMessagePhone || !newMessageText}
                className="flex-1 px-4 py-2 bg-whatsapp text-paper rounded-lg hover:opacity-90 disabled:opacity-50"
              >
                {sending ? 'Sending...' : 'Send'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Broadcast Modal */}
      {showBroadcastModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-canvas-2 rounded-xl p-6 w-[500px]">
            <h3 className="text-lg font-semibold mb-4"> WhatsApp Broadcast</h3>
            <div className="bg-sun/15 border border-sun rounded-lg p-3 mb-4">
              <p className="text-sm text-sun">
                WhatsApp requires pre-approved templates for broadcast messages outside the 24-hour window. 
                Messages within active conversations can be free-form.
              </p>
            </div>
            <form onSubmit={sendBroadcast}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-muted mb-1">Message</label>
                <textarea
                  value={broadcastMessage}
                  onChange={(e) => setBroadcastMessage(e.target.value)}
                  rows={3}
                  placeholder="Your broadcast message..."
                  className="w-full px-4 py-2 border rounded-lg"
                  required
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-muted mb-1">Recipients (one per line)</label>
                <textarea
                  value={broadcastRecipients}
                  onChange={(e) => setBroadcastRecipients(e.target.value)}
                  rows={5}
                  placeholder={"+254712345678\n+254723456789"}
                  className="w-full px-4 py-2 border rounded-lg font-mono text-sm"
                  required
                />
                <p className="text-xs text-muted mt-1">
                  {broadcastRecipients.split('\n').filter(l => l.trim()).length} recipients
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => { setShowBroadcastModal(false); setBroadcastRecipients(''); setBroadcastMessage('') }}
                  className="flex-1 px-4 py-2 border rounded-lg hover:bg-canvas-deep"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={sending}
                  className="flex-1 px-4 py-2 bg-whatsapp text-paper rounded-lg hover:opacity-90 disabled:opacity-50"
                >
                  {sending ? 'Sending...' : 'Send Broadcast'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
