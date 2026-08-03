import { useState, useEffect, useCallback } from 'react'
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

  const tabs: { id: Tab; label: string; icon: string; badge?: string }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: '📊' },
    { id: 'webchat', label: 'Web Chat', icon: '💬' },
    { id: 'calls', label: 'Voice Calls', icon: '📞' },
    { id: 'sms', label: 'SMS', icon: '💬' },
    { id: 'whatsapp', label: 'WhatsApp', icon: '📱' },
    { id: 'analytics', label: 'Analytics', icon: '📈' },
    { id: 'settings', label: 'Settings', icon: '⚙️' },
  ]

  return (
    <div className="space-y-6">
      {/* Sidebar + Content Layout */}
      <div className="flex gap-6">
        {/* Left Sidebar Navigation */}
        <div className="w-64 flex-shrink-0">
          <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
            <div className="p-4 gradient-primary text-white">
              <h3 className="font-semibold">🤖 Admin Assistant</h3>
              <p className="text-sm text-white/70 mt-1">AI Customer Service</p>
            </div>
            <nav className="p-2">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`
                    w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-all
                    ${activeTab === tab.id
                      ? 'bg-purple-50 text-purple-700 font-medium'
                      : 'text-gray-600 hover:bg-gray-50'
                    }
                  `}
                >
                  <span className="text-lg">{tab.icon}</span>
                  <span>{tab.label}</span>
                  {tab.badge && (
                    <span className="ml-auto px-2 py-0.5 bg-orange-100 text-orange-600 rounded-full text-xs">
                      {tab.badge}
                    </span>
                  )}
                </button>
              ))}
            </nav>
            <div className="p-4 border-t text-xs text-gray-400 text-center">
              <p>© 2026 Philip K. Kimani</p>
            </div>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1">
          <div className="bg-white rounded-xl shadow-sm border">
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
