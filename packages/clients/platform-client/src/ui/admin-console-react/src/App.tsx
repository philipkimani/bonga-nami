import { useState, useEffect } from 'react'
import { LogOut } from 'lucide-react'
import SectionSwitcher from './components/SectionSwitcher'
import LoginPage from './components/LoginPage'
import ChangePassword from './components/ChangePassword'
import EscalationsSection from './sections/Escalations'
import KnowledgeBaseSection from './sections/KnowledgeBase'
import AdminAssistantSection from './sections/AdminAssistant'
import PlatformSettingsSection from './sections/PlatformSettings'
import AnalyticsSection from './sections/AnalyticsSection'

type Section = 'escalations' | 'knowledge-base' | 'admin-assistant' | 'platform-settings' | 'analytics'

const SECTIONS: Section[] = ['escalations', 'analytics', 'knowledge-base', 'admin-assistant', 'platform-settings']

/**
 * Escalations is the default: a person waiting for help outranks a metric for
 * every role in the system. After that, people return to wherever they work.
 */
function initialSection(): Section {
  const stored = localStorage.getItem('admin_section')
  return SECTIONS.includes(stored as Section) ? (stored as Section) : 'escalations'
}

interface User {
  username: string
  role: string
  mustChangePassword?: boolean
}

// Check if running in production (auth required) or dev (auth optional)
// @ts-expect-error - Vite provides import.meta.env
const REQUIRE_AUTH = import.meta.env?.PROD || import.meta.env?.VITE_REQUIRE_AUTH === 'true'

function App() {
  const [activeSection, setActiveSection] = useState<Section>(initialSection)
  const [isAuthenticated, setIsAuthenticated] = useState(!REQUIRE_AUTH)
  const [mustChangePassword, setMustChangePassword] = useState(false)
  const [user, setUser] = useState<User | null>(null)
  const [checkingAuth, setCheckingAuth] = useState(REQUIRE_AUTH)
  const [queueCount, setQueueCount] = useState(0)
  const [queueUrgent, setQueueUrgent] = useState(false)

  useEffect(() => {
    localStorage.setItem('admin_section', activeSection)
  }, [activeSection])

  // Check existing session on mount
  useEffect(() => {
    if (!REQUIRE_AUTH) return

    const checkSession = async () => {
      const token = localStorage.getItem('admin_token')
      if (!token) {
        setCheckingAuth(false)
        return
      }

      // Check stored user for mustChangePassword
      const storedUser = localStorage.getItem('admin_user')
      if (storedUser) {
        try {
          const userData = JSON.parse(storedUser)
          if (userData.mustChangePassword) {
            setIsAuthenticated(true)
            setMustChangePassword(true)
            setUser(userData)
            setCheckingAuth(false)
            return
          }
        } catch {
          // Invalid stored user
        }
      }

      try {
        const res = await fetch('/api/auth/session', {
          headers: { Authorization: `Bearer ${token}` },
          credentials: 'include',
        })
        const data = await res.json()

        if (data.authenticated) {
          setIsAuthenticated(true)
          setUser(data.user)
        } else {
          localStorage.removeItem('admin_token')
          localStorage.removeItem('admin_user')
        }
      } catch {
        // Session check failed, user needs to log in
      }
      setCheckingAuth(false)
    }

    checkSession()
  }, [])

  // Queue count is lifted here so the nav badge is visible from every section.
  useEffect(() => {
    if (!isAuthenticated) return

    const poll = async () => {
      try {
        const res = await fetch('/api/admin-assistant/escalations', {
          headers: { Authorization: `Bearer ${localStorage.getItem('admin_token') || ''}` },
        })
        if (!res.ok) return
        const json = await res.json()
        setQueueCount(json.stats?.total ?? 0)
        setQueueUrgent((json.stats?.byUrgency?.high ?? 0) > 0)
      } catch {
        // Badge is advisory; a failed poll leaves the last known count.
      }
    }

    poll()
    const id = setInterval(poll, 15000)
    return () => clearInterval(id)
  }, [isAuthenticated])

  const handleLogin = (_token: string, userData: User) => {
    setIsAuthenticated(true)
    setUser(userData)
    // Check if password change is required
    if (userData.mustChangePassword) {
      setMustChangePassword(true)
    }
  }

  const handlePasswordChanged = () => {
    setMustChangePassword(false)
    // Update user state
    if (user) {
      setUser({ ...user, mustChangePassword: false })
    }
  }

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
    } catch {
      // Ignore logout errors
    }
    localStorage.removeItem('admin_token')
    localStorage.removeItem('admin_user')
    setIsAuthenticated(false)
    setMustChangePassword(false)
    setUser(null)
  }

  if (checkingAuth) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-canvas">
        <div className="h-12 w-12 animate-spin rounded-full border-2 border-line border-t-flare" />
      </div>
    )
  }

  if (!isAuthenticated) {
    return <LoginPage onLogin={handleLogin} />
  }

  if (mustChangePassword && user) {
    return <ChangePassword onPasswordChanged={handlePasswordChanged} username={user.username} />
  }

  return (
    <div className="min-h-dvh bg-canvas font-sans text-paper">
      <header className="sticky top-0 z-30 border-b border-line bg-canvas/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-4">
          <div>
            <p className="text-lg font-bold tracking-tight text-paper">Bonga Nami</p>
            <p className="text-xs text-muted">Admin Console</p>
          </div>

          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-2 rounded-full border border-mint/40 bg-mint/15 px-3 py-1.5 text-xs font-medium text-mint">
              <span className="h-1.5 w-1.5 rounded-full bg-mint motion-safe:animate-pulse" aria-hidden="true" />
              Live
            </span>

            {user && (
              <>
                <span className="hidden text-sm text-muted sm:inline">{user.username}</span>
                <button
                  onClick={handleLogout}
                  className="inline-flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm font-medium text-muted transition-colors hover:border-flare/50 hover:text-flare focus:outline-none focus-visible:ring-2 focus-visible:ring-flare"
                >
                  <LogOut className="h-4 w-4" aria-hidden="true" />
                  Log out
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      <SectionSwitcher
        activeSection={activeSection}
        onSectionChange={setActiveSection}
        escalationCount={queueCount}
        escalationUrgent={queueUrgent}
      />

      <main className="mx-auto max-w-7xl px-6 pb-16">
        {activeSection === 'escalations' && <EscalationsSection />}
        {activeSection === 'analytics' && <AnalyticsSection />}
        {activeSection === 'knowledge-base' && <KnowledgeBaseSection />}
        {activeSection === 'admin-assistant' && <AdminAssistantSection />}
        {activeSection === 'platform-settings' && <PlatformSettingsSection />}
      </main>
    </div>
  )
}

export default App
