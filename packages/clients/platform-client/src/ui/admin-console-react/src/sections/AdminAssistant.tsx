import { useState, useEffect, useCallback } from 'react'
import { BarChart3, LineChart, MessageSquare, Phone, Settings, Smartphone } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import DashboardTab from '../components/assistant/DashboardTab'
import CallsTab from '../components/assistant/CallsTab'
import SmsTab from '../components/assistant/SmsTab'
import WhatsAppTab from '../components/assistant/WhatsAppTab'
import SettingsTab from '../components/assistant/SettingsTab'
import AnalyticsTab from '../components/assistant/AnalyticsTab'
import WebChatTab from '../components/assistant/WebChatTab'

type Tab = 'dashboard' | 'webchat' | 'calls' | 'sms' | 'whatsapp' | 'analytics' | 'settings'

export default function AdminAssistantSection() {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard')

  // Listen for navigation events from child components (Quick Actions, View All, etc.)
  const handleNavigate = useCallback((e: Event) => {
    const detail = (e as CustomEvent).detail
    if (detail?.tab) setActiveTab(detail.tab as Tab)
  }, [])

  useEffect(() => {
    window.addEventListener('admin-navigate', handleNavigate)
    return () => window.removeEventListener('admin-navigate', handleNavigate)
  }, [handleNavigate])

  const tabs: { id: Tab; label: string; Icon: LucideIcon; badge?: string }[] = [
    { id: 'dashboard', label: 'Dashboard', Icon: BarChart3 },
    { id: 'webchat', label: 'Web Chat', Icon: MessageSquare },
    { id: 'calls', label: 'Voice Calls', Icon: Phone },
    { id: 'sms', label: 'SMS', Icon: MessageSquare },
    { id: 'whatsapp', label: 'WhatsApp', Icon: Smartphone },
    { id: 'analytics', label: 'Analytics', Icon: LineChart },
    { id: 'settings', label: 'Settings', Icon: Settings },
  ]

  return (
    <div className="space-y-6">
      {/* Sidebar + Content Layout */}
      <div className="flex gap-6">
        {/* Left Sidebar Navigation */}
        <div className="w-64 flex-shrink-0">
          <div className="bg-canvas-2 rounded-xl border overflow-hidden">
            <div className="p-4 bg-canvas-deep text-paper">
              <h3 className="font-semibold">Admin Assistant</h3>
              <p className="text-sm text-paper/70 mt-1">AI Customer Service</p>
            </div>
            <nav className="p-2">
              {tabs.map(({ id, label, Icon, badge }) => (
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
                  {badge && (
                    <span className="ml-auto px-2 py-0.5 bg-sun/15 text-sun rounded-full text-xs">
                      {badge}
                    </span>
                  )}
                </button>
              ))}
            </nav>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1">
          <div className="bg-canvas-2 rounded-xl border">
            {activeTab === 'dashboard' && <DashboardTab />}
            {activeTab === 'webchat' && <WebChatTab />}
            {activeTab === 'calls' && <CallsTab />}
            {activeTab === 'sms' && <SmsTab />}
            {activeTab === 'whatsapp' && <WhatsAppTab />}
            {activeTab === 'analytics' && <AnalyticsTab />}
            {activeTab === 'settings' && <SettingsTab />}
          </div>
        </div>
      </div>
    </div>
  )
}
