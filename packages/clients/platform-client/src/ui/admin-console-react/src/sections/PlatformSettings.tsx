import { useState, useEffect } from 'react'
import UserManagement from '../components/UserManagement'

type ConversationMode = 'voice_only' | 'voice_and_text' | 'text_only'
type TurnEagerness = 'eager' | 'normal' | 'patient'
type FirstMessageMode = 'none' | 'greeting' | 'prompt'

interface PlatformConfig {
  channels: {
    voiceCalls: boolean  // Twilio Voice
    sms: boolean         // Twilio SMS
    whatsApp: boolean    // WhatsApp Business
  }
  conversationMode: ConversationMode
  conversationFlow: {
    turnTimeout: number
    allowInterruptions: boolean
    turnEagerness: TurnEagerness
    inactivityTimeout: number
    maxIdlePrompts: number
    maxDuration: number
    silenceThreshold: number
    // Token optimization settings
    firstMessageMode: FirstMessageMode  // What happens when chat opens
    waitForUserFirst: boolean           // Don't type until user speaks/types
  }
  backendApiUrl: string
  backendApiKey: string
  elevenLabs: {
    apiKey: string
    agentId: string
    connected: boolean
  }
  twilio: {
    accountSid: string
    authToken: string
    phoneNumber: string
    configured: boolean
  }
  widget?: {
    primaryColor?: string
    secondaryColor?: string
    title?: string
    subtitle?: string
    position?: string
    widgetWidth?: number
    widgetHeight?: number
    buttonSize?: number
    borderRadius?: number
    showLanguageSelector?: boolean
    poweredByText?: string
    poweredByLink?: string
    showPoweredBy?: boolean
    allowedDomains?: string[]
  }
  escalation?: {
    messageThreshold?: number
    keywords?: string[]
    alertPhone?: string
    webhookUrl?: string
    enableCallTransfer?: boolean
    transferPhone?: string
    notificationsEnabled?: boolean
  }
}

const CONVERSATION_MODES = [
  {
    id: 'text_only' as ConversationMode,
    name: 'Text Only',
    icon: '💬',
    description: 'Chat mode, no audio required',
    costNote: '✨ Recommended: Lowest cost, 25x concurrency',
    color: 'from-green-500 to-emerald-500'
  },
  {
    id: 'voice_and_text' as ConversationMode,
    name: 'Voice + Text',
    icon: '🎭',
    description: 'Users can switch between voice and text',
    costNote: 'Balanced (multimodal)',
    color: 'from-blue-500 to-cyan-500'
  },
  {
    id: 'voice_only' as ConversationMode,
    name: 'Voice Only',
    icon: '🎙️',
    description: 'Speech input and output only',
    costNote: 'Higher cost (voice processing)',
    color: 'from-purple-500 to-indigo-500'
  },
]

export default function PlatformSettingsSection() {
  const [config, setConfig] = useState<PlatformConfig>({
    channels: {
      voiceCalls: false,
      sms: false,
      whatsApp: false,
    },
    conversationMode: 'text_only',
    conversationFlow: {
      turnTimeout: 10,
      allowInterruptions: true,
      turnEagerness: 'normal',
      inactivityTimeout: 120,
      maxIdlePrompts: 0,
      maxDuration: 600,
      silenceThreshold: 500,
      // Token optimization - silent by default
      firstMessageMode: 'none',
      waitForUserFirst: true,
    },
    backendApiUrl: '',
    backendApiKey: '',
    elevenLabs: {
      apiKey: '',
      agentId: '',
      connected: false,
    },
    twilio: {
      accountSid: '',
      authToken: '',
      phoneNumber: '',
      configured: false,
    }
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)

  useEffect(() => {
    loadConfig()
  }, [])

  async function loadConfig() {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/config/platform')
      if (res.ok) {
        const data = await res.json()
        if (data.data) {
          setConfig(data.data)
        }
      }
    } catch (e) {
      console.error('Failed to load config:', e)
    } finally {
      setLoading(false)
    }
  }

  async function saveConfig() {
    setSaving(true)
    setSaveMessage(null)
    try {
      const res = await fetch('/api/admin/config/platform', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      })
      if (res.ok) {
        setSaveMessage('Configuration saved successfully!')
        setTimeout(() => setSaveMessage(null), 3000)
      }
    } catch (e) {
      console.error('Failed to save config:', e)
      setSaveMessage('Failed to save configuration')
    } finally {
      setSaving(false)
    }
  }

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center text-gray-500">
          <div className="animate-spin text-4xl mb-4">⚙️</div>
          <p>Loading configuration...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">⚙️ Platform Settings</h1>
          <p className="text-gray-500 mt-1">Configure your AI assistant deployment</p>
        </div>
        <button
          onClick={saveConfig}
          disabled={saving}
          className="px-6 py-3 bg-gradient-to-r from-gray-700 to-gray-900 text-white rounded-lg hover:opacity-90 transition shadow-lg disabled:opacity-50 flex items-center gap-2"
        >
          {saving ? (
            <>
              <span className="animate-spin">⏳</span>
              Saving...
            </>
          ) : (
            <>
              💾 Save Configuration
            </>
          )}
        </button>
      </div>

      {saveMessage && (
        <div className={`p-4 rounded-lg ${saveMessage.includes('success') ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
          {saveMessage}
        </div>
      )}

      {/* Conversation Mode */}
      <div className="bg-white rounded-xl shadow-sm border p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">🎙️ Conversation Mode</h2>
        <p className="text-sm text-gray-500 mb-6">
          Choose how users interact with your AI. Text-only mode has the lowest cost and 25x higher concurrency.
        </p>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {CONVERSATION_MODES.map((mode) => (
            <button
              key={mode.id}
              onClick={() => setConfig(prev => ({ ...prev, conversationMode: mode.id as ConversationMode }))}
              className={`
                relative p-4 rounded-xl border-2 transition-all text-left
                ${config.conversationMode === mode.id 
                  ? 'border-gray-900 bg-gray-50 shadow-lg scale-[1.02]' 
                  : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                }
              `}
            >
              {config.conversationMode === mode.id && (
                <div className="absolute top-2 right-2">
                  <span className="text-green-600 text-lg">✓</span>
                </div>
              )}
              <div className="text-2xl mb-2">
                {mode.id === 'voice_only' ? '🔊' : mode.id === 'text_only' ? '⌨️' : '🎙️'}
              </div>
              <h3 className="font-semibold text-gray-900">{mode.name}</h3>
              <p className="text-xs text-gray-500 mt-1">{mode.costNote}</p>
            </button>
          ))}
        </div>

        {/* Conversation Flow Settings */}
        <div className="border-t pt-6">
          <h3 className="font-medium text-gray-900 mb-4">⚙️ Conversation Flow</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Turn Timeout */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Turn Timeout: {config.conversationFlow.turnTimeout}s
              </label>
              <input
                type="range"
                min="1"
                max="30"
                value={config.conversationFlow.turnTimeout}
                onChange={(e) => setConfig(prev => ({
                  ...prev,
                  conversationFlow: { ...prev.conversationFlow, turnTimeout: parseInt(e.target.value) }
                }))}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
              />
              <p className="text-xs text-gray-500 mt-1">How long to wait for user response</p>
            </div>

            {/* Allow Interruptions */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Allow Interruptions
              </label>
              <button
                onClick={() => setConfig(prev => ({
                  ...prev,
                  conversationFlow: { ...prev.conversationFlow, allowInterruptions: !prev.conversationFlow.allowInterruptions }
                }))}
                className={`
                  w-full p-3 rounded-lg border-2 transition-all text-left flex items-center justify-between
                  ${config.conversationFlow.allowInterruptions 
                    ? 'border-green-500 bg-green-50' 
                    : 'border-gray-200'
                  }
                `}
              >
                <span>{config.conversationFlow.allowInterruptions ? 'Enabled' : 'Disabled'}</span>
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                  config.conversationFlow.allowInterruptions ? 'bg-green-500 border-green-500' : 'border-gray-300'
                }`}>
                  {config.conversationFlow.allowInterruptions && <span className="text-white text-xs">✓</span>}
                </div>
              </button>
              <p className="text-xs text-gray-500 mt-1">Let users interrupt AI mid-sentence</p>
            </div>

            {/* Turn Eagerness */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Response Speed
              </label>
              <select
                value={config.conversationFlow.turnEagerness}
                onChange={(e) => setConfig(prev => ({
                  ...prev,
                  conversationFlow: { ...prev.conversationFlow, turnEagerness: e.target.value as TurnEagerness }
                }))}
                className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
              >
                <option value="eager">Eager (fast response)</option>
                <option value="normal">Normal (balanced)</option>
                <option value="patient">Patient (waits longer)</option>
              </select>
              <p className="text-xs text-gray-500 mt-1">How quickly AI responds after user stops</p>
            </div>
          </div>

          {/* Resource Optimization Section */}
          <div className="mt-6 pt-6 border-t">
            <h3 className="font-medium text-gray-900 mb-4">💰 Token Optimization</h3>
            <p className="text-sm text-gray-500 mb-4">
              Critical settings to minimize token usage. Default configuration saves maximum tokens.
            </p>
            
            {/* First Message Behavior - Most Important */}
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
              <h4 className="font-medium text-amber-900 mb-3">🚨 Startup Behavior (High Impact)</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* First Message Mode */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    When Chat Opens
                  </label>
                  <select
                    value={config.conversationFlow.firstMessageMode}
                    onChange={(e) => setConfig(prev => ({
                      ...prev,
                      conversationFlow: { ...prev.conversationFlow, firstMessageMode: e.target.value as FirstMessageMode }
                    }))}
                    className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  >
                    <option value="none">🔇 Silent (wait for user) — Saves tokens</option>
                    <option value="greeting">👋 Show greeting text (no AI call)</option>
                    <option value="prompt">🗣️ AI speaks first (uses tokens)</option>
                  </select>
                  <p className="text-xs text-gray-500 mt-1">Silent mode prevents token usage until user engages</p>
                </div>

                {/* Wait for User First */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Wait for User Input
                  </label>
                  <button
                    onClick={() => setConfig(prev => ({
                      ...prev,
                      conversationFlow: { ...prev.conversationFlow, waitForUserFirst: !prev.conversationFlow.waitForUserFirst }
                    }))}
                    className={`
                      w-full p-3 rounded-lg border-2 transition-all text-left flex items-center justify-between
                      ${config.conversationFlow.waitForUserFirst 
                        ? 'border-green-500 bg-green-50' 
                        : 'border-red-300 bg-red-50'
                      }
                    `}
                  >
                    <span className="text-sm">
                      {config.conversationFlow.waitForUserFirst 
                        ? '✅ Yes - AI waits for user (recommended)' 
                        : '⚠️ No - AI may type unprompted (costs tokens)'
                      }
                    </span>
                  </button>
                  <p className="text-xs text-gray-500 mt-1">Prevents AI from consuming tokens when user is idle</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Inactivity Timeout */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Inactivity Timeout: {Math.floor(config.conversationFlow.inactivityTimeout / 60)}m {config.conversationFlow.inactivityTimeout % 60}s
                </label>
                <input
                  type="range"
                  min="30"
                  max="1200"
                  step="30"
                  value={config.conversationFlow.inactivityTimeout}
                  onChange={(e) => setConfig(prev => ({
                    ...prev,
                    conversationFlow: { ...prev.conversationFlow, inactivityTimeout: parseInt(e.target.value) }
                  }))}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                />
                <p className="text-xs text-gray-500 mt-1">Terminate conversation after this much idle time (30s – 20 min)</p>
              </div>

              {/* Max Idle Prompts */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Idle Follow-up Prompts: {config.conversationFlow.maxIdlePrompts === 0 ? 'None (saves tokens)' : config.conversationFlow.maxIdlePrompts}
                </label>
                <input
                  type="range"
                  min="0"
                  max="3"
                  value={config.conversationFlow.maxIdlePrompts}
                  onChange={(e) => setConfig(prev => ({
                    ...prev,
                    conversationFlow: { ...prev.conversationFlow, maxIdlePrompts: parseInt(e.target.value) }
                  }))}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                />
                <p className="text-xs text-gray-500 mt-1">How many times AI prompts silent users (0 = none, recommended)</p>
              </div>

              {/* Max Duration */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Max Conversation: {config.conversationFlow.maxDuration === 0 ? 'Unlimited' : `${Math.floor(config.conversationFlow.maxDuration / 60)}m`}
                </label>
                <input
                  type="range"
                  min="0"
                  max="1800"
                  step="60"
                  value={config.conversationFlow.maxDuration}
                  onChange={(e) => setConfig(prev => ({
                    ...prev,
                    conversationFlow: { ...prev.conversationFlow, maxDuration: parseInt(e.target.value) }
                  }))}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                />
                <p className="text-xs text-gray-500 mt-1">Hard limit on conversation length (0 = unlimited, default: 10 min)</p>
              </div>

              {/* Silence Threshold (only for voice modes) */}
              {config.conversationMode !== 'text_only' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Silence Detection: {config.conversationFlow.silenceThreshold}ms
                  </label>
                  <input
                    type="range"
                    min="200"
                    max="1500"
                    step="100"
                    value={config.conversationFlow.silenceThreshold}
                    onChange={(e) => setConfig(prev => ({
                      ...prev,
                      conversationFlow: { ...prev.conversationFlow, silenceThreshold: parseInt(e.target.value) }
                    }))}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                  />
                  <p className="text-xs text-gray-500 mt-1">How long to wait before detecting speech end (voice mode)</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Channels */}
      <div className="bg-white rounded-xl shadow-sm border p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">📞 Twilio Channels</h2>
        <p className="text-sm text-gray-500 mb-6">
          Enable voice and SMS via Twilio. WhatsApp is handled directly by ElevenLabs native integration.
        </p>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Voice Calls */}
          <div 
            onClick={() => setConfig(prev => ({ 
              ...prev, 
              channels: { ...prev.channels, voiceCalls: !prev.channels.voiceCalls }
            }))}
            className={`
              p-4 rounded-xl border-2 cursor-pointer transition-all
              ${config.channels.voiceCalls 
                ? 'border-green-500 bg-green-50' 
                : 'border-gray-200 hover:border-gray-300'
              }
            `}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-2xl">📞</span>
                <div>
                  <h3 className="font-medium text-gray-900">Voice Calls</h3>
                  <p className="text-xs text-gray-500">Twilio Voice</p>
                </div>
              </div>
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                config.channels.voiceCalls ? 'bg-green-500 border-green-500' : 'border-gray-300'
              }`}>
                {config.channels.voiceCalls && <span className="text-white text-xs">✓</span>}
              </div>
            </div>
          </div>

          {/* SMS */}
          <div 
            onClick={() => setConfig(prev => ({ 
              ...prev, 
              channels: { ...prev.channels, sms: !prev.channels.sms }
            }))}
            className={`
              p-4 rounded-xl border-2 cursor-pointer transition-all
              ${config.channels.sms 
                ? 'border-green-500 bg-green-50' 
                : 'border-gray-200 hover:border-gray-300'
              }
            `}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-2xl">💬</span>
                <div>
                  <h3 className="font-medium text-gray-900">SMS</h3>
                  <p className="text-xs text-gray-500">Twilio Messaging</p>
                </div>
              </div>
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                config.channels.sms ? 'bg-green-500 border-green-500' : 'border-gray-300'
              }`}>
                {config.channels.sms && <span className="text-white text-xs">✓</span>}
              </div>
            </div>
          </div>

          {/* WhatsApp - Native ElevenLabs */}
          <div className="p-4 rounded-xl border-2 border-purple-200 bg-purple-50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-2xl">📱</span>
                <div>
                  <h3 className="font-medium text-gray-900">WhatsApp</h3>
                  <p className="text-xs text-purple-600">ElevenLabs Native</p>
                </div>
              </div>
              <a 
                href="https://elevenlabs.io/app/conversational-ai" 
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-purple-600 hover:underline"
              >
                Configure →
              </a>
            </div>
          </div>
        </div>

        {/* Twilio Credentials - only show if voice or SMS enabled */}
        {(config.channels.voiceCalls || config.channels.sms) && (
          <div className="mt-6 pt-6 border-t">
            <h3 className="font-medium text-gray-900 mb-4">🔑 Twilio Credentials</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Account SID
                </label>
                <input
                  type="text"
                  value={config.twilio?.accountSid || ''}
                  onChange={(e) => setConfig(prev => ({ 
                    ...prev, 
                    twilio: { ...prev.twilio, accountSid: e.target.value, configured: false }
                  }))}
                  placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent font-mono text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Auth Token
                </label>
                <input
                  type="password"
                  value={config.twilio?.authToken || ''}
                  onChange={(e) => setConfig(prev => ({ 
                    ...prev, 
                    twilio: { ...prev.twilio, authToken: e.target.value, configured: false }
                  }))}
                  placeholder="••••••••••••••••••••••••••••••••"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent font-mono text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Phone Number
                </label>
                <input
                  type="tel"
                  value={config.twilio?.phoneNumber || ''}
                  onChange={(e) => setConfig(prev => ({ 
                    ...prev, 
                    twilio: { ...prev.twilio, phoneNumber: e.target.value, configured: false }
                  }))}
                  placeholder="+254xxxxxxxxx"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                />
                <p className="text-xs text-gray-400 mt-1">Kenya format: +254...</p>
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-3">
              Get these from <a href="https://console.twilio.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Twilio Console</a> → Account Info
            </p>
          </div>
        )}
      </div>

      {/* Backend API Configuration */}
      <div className="bg-white rounded-xl shadow-sm border p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">🔗 Backend API</h2>
        <p className="text-sm text-gray-500 mb-6">
          Your backend API URL where tools will fetch data from (products, orders, bookings, etc.)
        </p>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Client API Base URL
            </label>
            <input
              type="url"
              value={config.backendApiUrl}
              onChange={(e) => setConfig(prev => ({ ...prev, backendApiUrl: e.target.value }))}
              placeholder="https://your-store.com/api"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
            />
            <p className="text-xs text-gray-400 mt-2">
              Example: https://api.mystore.com or http://localhost:3000/api
            </p>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              API Key (optional)
            </label>
            <input
              type="password"
              value={config.backendApiKey || ''}
              onChange={(e) => setConfig(prev => ({ ...prev, backendApiKey: e.target.value }))}
              placeholder="Enter your backend API key"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
            />
            <p className="text-xs text-gray-400 mt-2">
              If your backend requires authentication, enter the API key here. It will be sent as <code className="bg-gray-100 px-1 rounded">x-api-key</code> header.
            </p>
          </div>
        </div>
      </div>

      {/* ElevenLabs Connection */}
      <div className="bg-white rounded-xl shadow-sm border p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">🎙️ ElevenLabs Connection</h2>
        <p className="text-sm text-gray-500 mb-6">
          Enter your ElevenLabs credentials and configure tools using the webhook URLs below.
        </p>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              API Key
            </label>
            <input
              type="password"
              value={config.elevenLabs.apiKey || ''}
              onChange={(e) => setConfig(prev => ({ 
                ...prev, 
                elevenLabs: { ...prev.elevenLabs, apiKey: e.target.value }
              }))}
              placeholder="xi_xxxxxxxxxxxxxxxxxxxxxxxx"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
            />
            <p className="text-xs text-gray-400 mt-1">
              From ElevenLabs → Profile → API Keys
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Agent ID
            </label>
            <input
              type="text"
              value={config.elevenLabs.agentId || ''}
              onChange={(e) => setConfig(prev => ({ 
                ...prev, 
                elevenLabs: { ...prev.elevenLabs, agentId: e.target.value }
              }))}
              placeholder="agent_xxxxxxxxxxxxxxxx"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
            />
            <p className="text-xs text-gray-400 mt-1">
              From ElevenLabs → Conversational AI → Your Agent
            </p>
          </div>
        </div>

        {/* Phone Number for Voice + WhatsApp */}
        <div className="bg-indigo-50 rounded-xl border border-indigo-200 p-4 mb-6">
          <h3 className="font-medium text-indigo-900 mb-3">📞 Phone & WhatsApp Integration</h3>
          <p className="text-sm text-indigo-700 mb-4">
            Import your Twilio phone number or WhatsApp Business number into ElevenLabs to enable 
            voice calls and WhatsApp conversations managed by the AI agent.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-indigo-900 mb-2">
                ElevenLabs Phone Number ID
              </label>
              <input
                type="text"
                value={(config as any).elevenLabsPhoneNumberId || ''}
                onChange={(e) => setConfig(prev => ({ 
                  ...prev, 
                  elevenLabsPhoneNumberId: e.target.value 
                } as any))}
                placeholder="phnum_xxxxxxxxxxxxxxxx"
                className="w-full px-4 py-3 border border-indigo-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white"
              />
              <p className="text-xs text-indigo-600 mt-1">
                Found after importing your Twilio/WhatsApp number into ElevenLabs
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-indigo-900 mb-2">
                Personalization Webhook URL
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={`${baseUrl}/webhooks/elevenlabs/personalization`}
                  readOnly
                  className="w-full px-4 py-3 border border-indigo-200 rounded-lg bg-indigo-50 text-indigo-800 font-mono text-sm"
                />
                <button
                  onClick={() => navigator.clipboard.writeText(`${baseUrl}/webhooks/elevenlabs/personalization`)}
                  className="px-3 py-3 bg-white border border-indigo-200 rounded-lg hover:bg-indigo-100 transition text-sm"
                  title="Copy to clipboard"
                >
                  📋
                </button>
              </div>
              <p className="text-xs text-indigo-600 mt-1">
                Set this as your agent's "Data collection webhook" in ElevenLabs
              </p>
            </div>
          </div>
        </div>

        {/* Connection Status */}
        <div className={`p-4 rounded-lg mb-6 ${
          config.elevenLabs.apiKey && config.elevenLabs.agentId 
            ? 'bg-green-50 border border-green-200' 
            : 'bg-yellow-50 border border-yellow-200'
        }`}>
          <div className="flex items-center gap-2">
            {config.elevenLabs.apiKey && config.elevenLabs.agentId ? (
              <>
                <span className="text-green-600">✓</span>
                <span className="text-green-800 font-medium">Connected</span>
                <span className="text-green-600 text-sm">— ElevenLabs credentials configured</span>
              </>
            ) : (
              <>
                <span className="text-yellow-600">○</span>
                <span className="text-yellow-800 font-medium">
                  {!config.elevenLabs.apiKey && !config.elevenLabs.agentId 
                    ? 'Enter API Key and Agent ID above'
                    : !config.elevenLabs.apiKey 
                      ? 'Enter API Key above'
                      : 'Enter Agent ID above'
                  }
                </span>
              </>
            )}
          </div>
        </div>

        {/* Webhook Reference */}
        <div className="border-t pt-6">
          <h3 className="font-medium text-gray-900 mb-4">📋 Webhook Endpoints</h3>
          <p className="text-sm text-gray-500 mb-4">
            Use these URLs when configuring tools in your ElevenLabs agent:
          </p>
          
          <div className="space-y-3">
            <WebhookRow 
              name="Code Execution" 
              path="/webhooks/execute" 
              baseUrl={baseUrl}
              description="Primary tool execution endpoint"
            />
            <WebhookRow 
              name="Personalization" 
              path="/webhooks/elevenlabs/personalization" 
              baseUrl={baseUrl}
              description="Dynamic variables & customer context for all channels"
            />
            {config.channels.voiceCalls && (
              <>
                <WebhookRow 
                  name="Voice Inbound" 
                  path="/webhooks/admin-assistant/calls/inbound" 
                  baseUrl={baseUrl}
                  description="Twilio inbound voice call webhook"
                />
                <WebhookRow 
                  name="Call Status" 
                  path="/webhooks/admin-assistant/calls/status" 
                  baseUrl={baseUrl}
                  description="Twilio call status callback"
                />
              </>
            )}
            {config.channels.sms && (
              <WebhookRow 
                name="SMS Inbound" 
                path="/webhooks/admin-assistant/sms/inbound" 
                baseUrl={baseUrl}
                description="Twilio SMS webhook"
              />
            )}
            {config.channels.voiceCalls && (
              <WebhookRow 
                name="Voice Escalation" 
                path="/webhooks/admin-assistant/calls/escalate" 
                baseUrl={baseUrl}
                description="ElevenLabs server tool for voice escalation"
              />
            )}
            <WebhookRow 
              name="WhatsApp Escalation" 
              path="/api/admin-assistant/whatsapp/escalate" 
              baseUrl={baseUrl}
              description="ElevenLabs server tool for WhatsApp escalation (configured in ElevenLabs)"
            />
          </div>
        </div>

        <div className="mt-6 flex gap-3">
          <a
            href="https://elevenlabs.io/app/conversational-ai"
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg hover:opacity-90 transition text-sm"
          >
            Open ElevenLabs Dashboard →
          </a>
          <a
            href="https://console.twilio.com"
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition text-sm"
          >
            Open Twilio Console →
          </a>
        </div>
      </div>

      {/* Escalation Settings */}
      <div className="bg-white rounded-xl shadow-sm border p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">🚨 Escalation Settings</h2>
        <p className="text-sm text-gray-500 mb-6">
          Configure when conversations are escalated to a human agent and how notifications are sent.
        </p>

        {/* Threshold & Keywords */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Message Threshold
            </label>
            <input
              type="number"
              min="0"
              max="100"
              value={(config as any).escalation?.messageThreshold ?? 10}
              onChange={(e) => setConfig(prev => ({
                ...prev,
                escalation: { ...(prev as any).escalation, messageThreshold: parseInt(e.target.value) || 0 }
              } as any))}
              onBlur={() => saveConfig()}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
            />
            <p className="text-xs text-gray-400 mt-1">
              Auto-escalate after this many AI messages in one session. Set to 0 to disable.
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Escalation Keywords
            </label>
            <input
              type="text"
              value={((config as any).escalation?.keywords || []).join(', ')}
              onChange={(e) => {
                const keywords = e.target.value
                  .split(',')
                  .map((k: string) => k.trim())
                  .filter((k: string) => k.length > 0);
                setConfig(prev => ({
                  ...prev,
                  escalation: { ...(prev as any).escalation, keywords }
                } as any));
              }}
              onBlur={() => saveConfig()}
              placeholder="speak to human, talk to agent, manager, complaint"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
            />
            <p className="text-xs text-gray-400 mt-1">
              Comma-separated phrases that trigger immediate escalation in SMS.
            </p>
          </div>
        </div>

        {/* Notification Settings */}
        <div className="bg-amber-50 rounded-xl border border-amber-200 p-4 mb-6">
          <h3 className="font-medium text-amber-900 mb-3">🔔 Notifications</h3>
          <div className="flex items-center gap-3 mb-4">
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={(config as any).escalation?.notificationsEnabled ?? true}
                onChange={(e) => {
                  setConfig(prev => ({
                    ...prev,
                    escalation: { ...(prev as any).escalation, notificationsEnabled: e.target.checked }
                  } as any));
                  setTimeout(() => saveConfig(), 100);
                }}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-amber-500 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
            </label>
            <span className="text-sm text-amber-800">Send notifications on escalation</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-amber-900 mb-2">
                SMS Alert Phone
              </label>
              <input
                type="tel"
                value={(config as any).escalation?.alertPhone || ''}
                onChange={(e) => setConfig(prev => ({
                  ...prev,
                  escalation: { ...(prev as any).escalation, alertPhone: e.target.value }
                } as any))}
                onBlur={() => saveConfig()}
                placeholder="+254712345678"
                className="w-full px-4 py-3 border border-amber-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent bg-white"
              />
              <p className="text-xs text-amber-600 mt-1">
                Receive SMS when escalation triggers
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-amber-900 mb-2">
                Webhook URL (Slack/Teams)
              </label>
              <input
                type="url"
                value={(config as any).escalation?.webhookUrl || ''}
                onChange={(e) => setConfig(prev => ({
                  ...prev,
                  escalation: { ...(prev as any).escalation, webhookUrl: e.target.value }
                } as any))}
                onBlur={() => saveConfig()}
                placeholder="https://hooks.slack.com/services/..."
                className="w-full px-4 py-3 border border-amber-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent bg-white"
              />
              <p className="text-xs text-amber-600 mt-1">
                POST notification to Slack, Teams, or PagerDuty
              </p>
            </div>
          </div>
        </div>

        {/* Call Transfer */}
        <div className="bg-blue-50 rounded-xl border border-blue-200 p-4">
          <h3 className="font-medium text-blue-900 mb-3">📞 Live Call Transfer</h3>
          <p className="text-sm text-blue-700 mb-3">
            When a voice call is escalated, automatically transfer the caller to a human agent via Twilio Conference bridge.
          </p>
          <div className="flex items-center gap-3 mb-4">
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={(config as any).escalation?.enableCallTransfer ?? false}
                onChange={(e) => {
                  setConfig(prev => ({
                    ...prev,
                    escalation: { ...(prev as any).escalation, enableCallTransfer: e.target.checked }
                  } as any));
                  setTimeout(() => saveConfig(), 100);
                }}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-500 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-500"></div>
            </label>
            <span className="text-sm text-blue-800">Enable Twilio Conference transfer</span>
          </div>
          {(config as any).escalation?.enableCallTransfer && (
            <div>
              <label className="block text-sm font-medium text-blue-900 mb-2">
                Transfer Phone Number
              </label>
              <input
                type="tel"
                value={(config as any).escalation?.transferPhone || ''}
                onChange={(e) => setConfig(prev => ({
                  ...prev,
                  escalation: { ...(prev as any).escalation, transferPhone: e.target.value }
                } as any))}
                onBlur={() => saveConfig()}
                placeholder="+254712345678"
                className="w-full px-4 py-3 border border-blue-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
              />
              <p className="text-xs text-blue-600 mt-1">
                Agent/supervisor phone number. Caller is placed in a Twilio Conference room and this number is dialed in.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Widget Appearance */}
      <div className="bg-white rounded-xl shadow-sm border p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">🎨 Widget Appearance</h2>
        <p className="text-sm text-gray-500 mb-6">
          Customize how the chat widget looks on your website. Changes apply to all new sessions.
        </p>

        {/* Color Pickers */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Primary Color</label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={config.widget?.primaryColor || '#6366f1'}
                onChange={e => setConfig(prev => ({ ...prev, widget: { ...prev.widget, primaryColor: e.target.value } }))}
                className="w-10 h-10 rounded-lg border border-gray-300 cursor-pointer"
              />
              <input
                type="text"
                value={config.widget?.primaryColor || '#6366f1'}
                onChange={e => setConfig(prev => ({ ...prev, widget: { ...prev.widget, primaryColor: e.target.value } }))}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
                placeholder="#6366f1"
              />
            </div>
            <p className="text-xs text-gray-400 mt-1">Used for buttons, links, and user messages</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Secondary Color</label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={config.widget?.secondaryColor || '#8b5cf6'}
                onChange={e => setConfig(prev => ({ ...prev, widget: { ...prev.widget, secondaryColor: e.target.value } }))}
                className="w-10 h-10 rounded-lg border border-gray-300 cursor-pointer"
              />
              <input
                type="text"
                value={config.widget?.secondaryColor || '#8b5cf6'}
                onChange={e => setConfig(prev => ({ ...prev, widget: { ...prev.widget, secondaryColor: e.target.value } }))}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
                placeholder="#8b5cf6"
              />
            </div>
            <p className="text-xs text-gray-400 mt-1">Used for hover states and accents</p>
          </div>
        </div>

        {/* Text Fields */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Widget Title</label>
            <input
              type="text"
              value={config.widget?.title || 'AI Assistant'}
              onChange={e => setConfig(prev => ({ ...prev, widget: { ...prev.widget, title: e.target.value } }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              placeholder="AI Assistant"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Widget Subtitle</label>
            <input
              type="text"
              value={config.widget?.subtitle || 'How can I help you today?'}
              onChange={e => setConfig(prev => ({ ...prev, widget: { ...prev.widget, subtitle: e.target.value } }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              placeholder="How can I help you?"
            />
          </div>
        </div>

        {/* Size Controls */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Width (px)</label>
            <input
              type="number"
              min={300}
              max={600}
              value={config.widget?.widgetWidth ?? 400}
              onChange={e => setConfig(prev => ({ ...prev, widget: { ...prev.widget, widgetWidth: parseInt(e.target.value) || 400 } }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
            <p className="text-xs text-gray-400 mt-1">300–600px</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Height (px)</label>
            <input
              type="number"
              min={400}
              max={800}
              value={config.widget?.widgetHeight ?? 600}
              onChange={e => setConfig(prev => ({ ...prev, widget: { ...prev.widget, widgetHeight: parseInt(e.target.value) || 600 } }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
            <p className="text-xs text-gray-400 mt-1">400–800px</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Button Size (px)</label>
            <input
              type="number"
              min={40}
              max={80}
              value={config.widget?.buttonSize ?? 56}
              onChange={e => setConfig(prev => ({ ...prev, widget: { ...prev.widget, buttonSize: parseInt(e.target.value) || 56 } }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
            <p className="text-xs text-gray-400 mt-1">40–80px</p>
          </div>
        </div>

        {/* Border Radius */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Border Radius: {config.widget?.borderRadius ?? 16}px
          </label>
          <input
            type="range"
            min={0}
            max={24}
            value={config.widget?.borderRadius ?? 16}
            onChange={e => setConfig(prev => ({ ...prev, widget: { ...prev.widget, borderRadius: parseInt(e.target.value) } }))}
            className="w-full accent-indigo-600"
          />
          <div className="flex justify-between text-xs text-gray-400">
            <span>Sharp (0)</span>
            <span>Rounded (24)</span>
          </div>
        </div>

        {/* Position */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">Widget Position</label>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {(['bottom-right', 'bottom-left', 'top-right', 'top-left'] as const).map(pos => (
              <button
                key={pos}
                type="button"
                onClick={() => setConfig(prev => ({ ...prev, widget: { ...prev.widget, position: pos } }))}
                className={`px-4 py-2 rounded-lg border text-sm capitalize transition ${
                  (config.widget?.position || 'bottom-right') === pos
                    ? 'border-indigo-500 bg-indigo-50 text-indigo-700 font-medium'
                    : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                {pos.replace('-', ' ')}
              </button>
            ))}
          </div>
        </div>

        {/* Toggles */}
        <div className="space-y-4 mb-6">
          <label className="flex items-center justify-between">
            <div>
              <span className="text-sm font-medium text-gray-700">Show Language Selector</span>
              <p className="text-xs text-gray-400">Let users switch language in the chat header</p>
            </div>
            <input
              type="checkbox"
              checked={config.widget?.showLanguageSelector !== false}
              onChange={e => setConfig(prev => ({ ...prev, widget: { ...prev.widget, showLanguageSelector: e.target.checked } }))}
              className="w-5 h-5 accent-indigo-600 rounded"
            />
          </label>
        </div>


      </div>

      {/* Widget Embed Code */}
      {config.elevenLabs.agentId && (
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-2">🔗 Widget Embed Code</h2>
          <p className="text-sm text-gray-500 mb-6">
            Copy this code and paste it into your website's HTML before the closing &lt;/body&gt; tag.
          </p>

          {/* Security: Allowed Domains */}
          <div className="mb-6 p-4 bg-amber-50 rounded-lg border border-amber-200">
            <h3 className="font-medium text-amber-900 mb-2">🔒 Widget Security (Enterprise)</h3>
            <p className="text-sm text-amber-700 mb-3">
              Restrict which domains can embed your widget. Leave empty to allow all domains (development mode).
            </p>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Allowed Domains
            </label>
            <input
              type="text"
              value={(config.widget?.allowedDomains || []).join(', ')}
              onChange={e => {
                const domains = e.target.value
                  .split(',')
                  .map(d => d.trim())
                  .filter(d => d.length > 0);
                setConfig(prev => ({
                  ...prev,
                  widget: {
                    ...prev.widget,
                    allowedDomains: domains,
                  }
                }));
              }}
              onBlur={() => saveConfig()}
              placeholder="example.com, *.mybank.co.ke, app.company.com"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
            />
            <p className="text-xs text-gray-500 mt-1">
              Comma-separated. Use *.domain.com for wildcard subdomains. Banks/telcos: Always configure this!
            </p>
          </div>
          
          <div className="bg-gray-900 rounded-lg p-4 overflow-x-auto">
            <pre className="text-sm text-green-400 font-mono whitespace-pre-wrap">
{`<!-- Bonga Nami Chat Widget -->
<script>
  window.BONGA_NAMI_CONFIG = {
    agentId: "${config.elevenLabs.agentId}",
    mode: "${config.conversationMode}",
    primaryColor: "${config.widget?.primaryColor || '#6366f1'}",
    secondaryColor: "${config.widget?.secondaryColor || '#8b5cf6'}",
    position: "${config.widget?.position || 'bottom-right'}",
    widgetWidth: ${config.widget?.widgetWidth ?? 400},
    widgetHeight: ${config.widget?.widgetHeight ?? 600},
    buttonSize: ${config.widget?.buttonSize ?? 56},
    borderRadius: ${config.widget?.borderRadius ?? 16}
  };
</script>
<script src="${baseUrl}/widget/embed.js" async></script>`}
            </pre>
          </div>

          <div className="mt-4 flex gap-3">
            <button
              onClick={() => {
                const code = `<!-- Bonga Nami Chat Widget -->
<script>
  window.BONGA_NAMI_CONFIG = {
    agentId: "${config.elevenLabs.agentId}",
    mode: "${config.conversationMode}",
    primaryColor: "${config.widget?.primaryColor || '#6366f1'}",
    secondaryColor: "${config.widget?.secondaryColor || '#8b5cf6'}",
    position: "${config.widget?.position || 'bottom-right'}",
    widgetWidth: ${config.widget?.widgetWidth ?? 400},
    widgetHeight: ${config.widget?.widgetHeight ?? 600},
    buttonSize: ${config.widget?.buttonSize ?? 56},
    borderRadius: ${config.widget?.borderRadius ?? 16}
  };
</script>
<script src="${baseUrl}/widget/embed.js" async></script>`;
                navigator.clipboard.writeText(code);
                setSaveMessage('Widget code copied to clipboard!');
                setTimeout(() => setSaveMessage(null), 3000);
              }}
              className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition text-sm"
            >
              📋 Copy Embed Code
            </button>
            <a
              href={`${baseUrl}/widget/demo.html`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition text-sm"
            >
              👀 Preview Widget
            </a>
          </div>

          <div className="mt-6 pt-6 border-t">
            <h3 className="font-medium text-gray-900 mb-3">✅ Deployment Checklist</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <ChecklistItem 
                done={!!config.backendApiUrl} 
                label="Backend API URL configured"
              />
              <ChecklistItem 
                done={!!config.elevenLabs.apiKey && !!config.elevenLabs.agentId} 
                label="ElevenLabs connected"
              />
              <ChecklistItem 
                done={config.conversationMode === 'text_only'} 
                label="Text-only mode (cost optimized)"
              />
              <ChecklistItem 
                done={config.conversationFlow.maxIdlePrompts === 0} 
                label="Idle prompts disabled"
              />
              <ChecklistItem 
                done={config.conversationFlow.maxDuration > 0} 
                label="Max duration set"
              />
              <ChecklistItem 
                done={config.conversationFlow.inactivityTimeout <= 120} 
                label="Inactivity timeout ≤ 2 min"
              />
            </div>
          </div>
        </div>
      )}

      {/* User Management - Only visible to Super Admins */}
      <UserManagement />

      {/* Footer */}
      <div className="text-center text-sm text-gray-400 py-4">
        © 2026 Philip K. Kimani
      </div>
    </div>
  )
}

function WebhookRow({ name, path, baseUrl, description }: { name: string; path: string; baseUrl: string; description: string }) {
  const [copied, setCopied] = useState(false)
  const fullUrl = `${baseUrl}${path}`

  function copyToClipboard() {
    navigator.clipboard.writeText(fullUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium text-gray-900 text-sm">{name}</span>
          <span className="text-xs text-gray-400">— {description}</span>
        </div>
        <code className="text-xs text-gray-600 font-mono">{fullUrl}</code>
      </div>
      <button
        onClick={copyToClipboard}
        className="px-3 py-1.5 text-xs bg-white border border-gray-300 rounded hover:bg-gray-100 transition"
      >
        {copied ? '✓ Copied' : '📋 Copy'}
      </button>
    </div>
  )
}

function ChecklistItem({ done, label }: { done: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 py-1">
      <span className={`text-lg ${done ? 'text-green-500' : 'text-gray-300'}`}>
        {done ? '✓' : '○'}
      </span>
      <span className={`text-sm ${done ? 'text-gray-900' : 'text-gray-500'}`}>{label}</span>
    </div>
  )
}
