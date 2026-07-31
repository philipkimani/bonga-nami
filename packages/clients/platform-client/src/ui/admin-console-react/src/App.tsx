import { useState, useEffect } from 'react'
import SectionSwitcher from './components/SectionSwitcher'
import LoginPage from './components/LoginPage'
import ChangePassword from './components/ChangePassword'
import KnowledgeBaseSection from './sections/KnowledgeBase'
import AdminAssistantSection from './sections/AdminAssistant'
import PlatformSettingsSection from './sections/PlatformSettings'
import AnalyticsSection from './sections/AnalyticsSection'

type Section = 'knowledge-base' | 'admin-assistant' | 'platform-settings' | 'analytics'

interface User {
  username: string
  role: string
  mustChangePassword?: boolean
}

// Check if running in production (auth required) or dev (auth optional)
// @ts-expect-error - Vite provides import.meta.env
const REQUIRE_AUTH = import.meta.env?.PROD || import.meta.env?.VITE_REQUIRE_AUTH === 'true'

function App() {
  const [activeSection, setActiveSection] = useState<Section>('analytics')
  const [isAuthenticated, setIsAuthenticated] = useState(!REQUIRE_AUTH)
  const [mustChangePassword, setMustChangePassword] = useState(false)
  const [user, setUser] = useState<User | null>(null)
  const [checkingAuth, setCheckingAuth] = useState(REQUIRE_AUTH)

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

  // Show loading spinner while checking auth
  if (checkingAuth) {
    return (
      <>
        <div className="bg-animated">
          <div className="orb-1"></div>
          <div className="orb-2"></div>
        </div>
        <div className="min-h-screen flex items-center justify-center">
          <div className="relative">
            <div className="w-16 h-16 border-4 border-purple-500/30 rounded-full"></div>
            <div className="absolute top-0 left-0 w-16 h-16 border-4 border-transparent border-t-purple-500 rounded-full animate-spin"></div>
          </div>
        </div>
      </>
    )
  }

  // Show login page if not authenticated
  if (!isAuthenticated) {
    return <LoginPage onLogin={handleLogin} />
  }

  // Show password change screen if required
  if (mustChangePassword && user) {
    return <ChangePassword onPasswordChanged={handlePasswordChanged} username={user.username} />
  }

  return (
    <>
      {/* Animated Background */}
      <div className="bg-animated">
        <div className="orb-1"></div>
        <div className="orb-2"></div>
      </div>

      <div className="min-h-screen relative">
        {/* Header */}
        <header className="glass-card sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-lg glow-purple">
                  <span className="text-white text-2xl">🚀</span>
                </div>
                <div>
                  <h1 className="text-xl font-bold text-gray-900">Admin Console</h1>
                  <p className="text-sm font-medium text-gray-700">Ruskins AI Platform</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <span className="px-4 py-2 bg-emerald-500 text-white rounded-full text-sm font-bold flex items-center gap-2 shadow-lg">
                  <span className="w-2 h-2 bg-white rounded-full animate-pulse"></span>
                  Live
                </span>
                {user && (
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 px-3 py-2 bg-white rounded-xl shadow-md border border-gray-200">
                      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-white text-sm font-bold">
                        {user.username.charAt(0).toUpperCase()}
                      </div>
                      <span className="text-sm font-bold text-gray-900">
                        {user.username}
                      </span>
                    </div>
                    <button
                      onClick={handleLogout}
                      className="px-4 py-2 text-sm font-bold text-gray-700 hover:text-white hover:bg-red-500 bg-white rounded-xl shadow-md border border-gray-200 transition-all duration-300"
                    >
                      Logout
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* Section Switcher - Prominent at top */}
        <SectionSwitcher 
          activeSection={activeSection} 
          onSectionChange={setActiveSection} 
        />

        {/* Main Content */}
        <main className="max-w-7xl mx-auto px-6 py-8">
          <div className="glass-card-light rounded-3xl p-8 hover-lift">
            {activeSection === 'platform-settings' && <PlatformSettingsSection />}
            {activeSection === 'analytics' && <AnalyticsSection />}
            {activeSection === 'knowledge-base' && <KnowledgeBaseSection />}
            {activeSection === 'admin-assistant' && <AdminAssistantSection />}
          </div>
        </main>

        {/* Footer */}
        <footer className="py-6 text-center">
          <p className="text-gray-500 text-sm">
            © 2026 Ruskins AI Platform • Built for Kenya 🇰🇪
          </p>
        </footer>
      </div>
    </>
  )
}

export default App
