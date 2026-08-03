import { useState } from 'react'
import { ArrowUpRight, Mic, Phone } from 'lucide-react'

export default function SettingsTab() {
  const [activeSubTab, setActiveSubTab] = useState<'twilio' | 'elevenlabs' | 'escalation'>('twilio')
  const [saving, setSaving] = useState(false)

  const subTabs = [
    { id: 'twilio' as const, label: 'Twilio', Icon: Phone },
    { id: 'elevenlabs' as const, label: 'ElevenLabs', Icon: Mic },
    { id: 'escalation' as const, label: 'Escalation', Icon: ArrowUpRight },
  ]

  async function saveSettings(section: string) {
    setSaving(true)
    await new Promise(resolve => setTimeout(resolve, 500))
    setSaving(false)
    alert(`${section} settings saved!`)
  }

  async function testTwilioConnection() {
    alert('Testing Twilio connection...')
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-paper"> Settings</h2>
        <p className="text-muted">Configure your Admin Assistant integrations</p>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-2 mb-6">
        {subTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveSubTab(tab.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              activeSubTab === tab.id
                ? 'bg-flare/15 text-flare'
                : 'bg-canvas-deep text-muted hover:bg-canvas-deep'
            }`}
          >
            <tab.Icon className="mr-2 h-4 w-4 shrink-0" aria-hidden="true" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Twilio Settings */}
      {activeSubTab === 'twilio' && (
        <div className="bg-canvas-deep rounded-xl p-6">
          <h3 className="text-lg font-semibold text-paper mb-4">Twilio Configuration</h3>
          <div className="space-y-4 max-w-xl">
            <div>
              <label className="block text-sm font-medium text-muted mb-1">Account SID</label>
              <input
                type="text"
                placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-flare"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-muted mb-1">Auth Token</label>
              <input
                type="password"
                placeholder="••••••••••••••••••••••••••••••••"
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-flare"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-muted mb-1">Phone Number (+254...)</label>
              <input
                type="tel"
                placeholder="+254xxxxxxxxx"
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-flare"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-muted mb-1">Webhook URL</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={`${window.location.origin}/webhooks/admin-assistant/twilio`}
                  readOnly
                  className="flex-1 px-4 py-2 border rounded-lg bg-canvas-deep text-muted"
                />
                <button
                  onClick={() => navigator.clipboard.writeText(`${window.location.origin}/webhooks/admin-assistant/twilio`)}
                  className="px-4 py-2 border rounded-lg hover:bg-canvas-deep"
                >
                  Copy
                </button>
              </div>
              <p className="text-xs text-muted mt-1">Add this URL in your Twilio Console for Voice and SMS webhooks</p>
            </div>
            <div className="flex gap-3 pt-4">
              <button
                onClick={() => saveSettings('Twilio')}
                disabled={saving}
                className="px-6 py-2 bg-canvas-deep text-paper rounded-lg hover:opacity-90 disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Settings'}
              </button>
              <button
                onClick={testTwilioConnection}
                className="px-6 py-2 border rounded-lg hover:bg-canvas-deep"
              >
                Test Connection
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ElevenLabs Settings */}
      {activeSubTab === 'elevenlabs' && (
        <div className="bg-canvas-deep rounded-xl p-6">
          <h3 className="text-lg font-semibold text-paper mb-4">ElevenLabs Configuration</h3>
          <div className="space-y-4 max-w-xl">
            <div>
              <label className="block text-sm font-medium text-muted mb-1">API Key</label>
              <input
                type="password"
                placeholder="sk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-flare"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-muted mb-1">Agent ID</label>
              <input
                type="text"
                placeholder="agent_xxxxxxxx"
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-flare"
              />
              <p className="text-xs text-muted mt-1">Find this in your ElevenLabs Conversational AI dashboard</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-muted mb-1">Voice ID (optional)</label>
              <input
                type="text"
                placeholder="21m00Tcm4TlvDq8ikWAM"
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-flare"
              />
            </div>
            <div className="p-4 bg-canvas-deep border border-line rounded-lg">
              <h4 className="font-medium text-muted mb-2"> ElevenLabs Features</h4>
              <ul className="text-sm text-muted space-y-1">
                <li> Conversational AI Voice Calls</li>
                <li> Native WhatsApp Integration</li>
                <li> Batch Calling API</li>
                <li> Custom Knowledge Base</li>
              </ul>
            </div>
            <div className="flex gap-3 pt-4">
              <button
                onClick={() => saveSettings('ElevenLabs')}
                disabled={saving}
                className="px-6 py-2 bg-canvas-deep text-paper rounded-lg hover:opacity-90 disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Escalation Settings */}
      {activeSubTab === 'escalation' && (
        <div className="bg-canvas-deep rounded-xl p-6">
          <h3 className="text-lg font-semibold text-paper mb-4">Escalation Settings</h3>
          <div className="space-y-4 max-w-xl">
            <div>
              <label className="block text-sm font-medium text-muted mb-1">Default Escalation Phone Number</label>
              <input
                type="tel"
                placeholder="+254xxxxxxxxx"
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-flare"
              />
              <p className="text-xs text-muted mt-1">Calls will be transferred to this number when escalation is triggered</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-muted mb-1">Escalation Email</label>
              <input
                type="email"
                placeholder="support@company.com"
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-flare"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-muted mb-1">Escalation Keywords</label>
              <input
                type="text"
                placeholder="help, urgent, human, agent, speak to someone"
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-flare"
              />
              <p className="text-xs text-muted mt-1">Comma-separated keywords that trigger escalation</p>
            </div>
            <div className="space-y-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" className="w-4 h-4 rounded text-flare" defaultChecked />
                <span className="text-sm text-muted">Enable automatic escalation detection</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" className="w-4 h-4 rounded text-flare" defaultChecked />
                <span className="text-sm text-muted">Send email notification on escalation</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" className="w-4 h-4 rounded text-flare" />
                <span className="text-sm text-muted">Auto-transfer calls to human after 3 failed attempts</span>
              </label>
            </div>
            <div className="flex gap-3 pt-4">
              <button
                onClick={() => saveSettings('Escalation')}
                disabled={saving}
                className="px-6 py-2 bg-canvas-deep text-paper rounded-lg hover:opacity-90 disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
