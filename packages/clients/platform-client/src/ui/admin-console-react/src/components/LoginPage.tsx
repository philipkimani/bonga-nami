import { useState } from 'react'

interface LoginPageProps {
  onLogin: (token: string, user: { username: string; role: string }) => void
  apiBase?: string
}

export default function LoginPage({ onLogin, apiBase = '' }: LoginPageProps) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch(`${apiBase}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username, password }),
      })

      const data = await res.json()

      if (!res.ok || !data.success) {
        setError(data.error || 'Login failed')
        return
      }

      // Store token and user info
      localStorage.setItem('admin_token', data.token)
      localStorage.setItem('admin_user', JSON.stringify(data.user))
      
      onLogin(data.token, data.user)
    } catch (err) {
      setError('Connection failed. Is the server running?')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-canvas-deep flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-canvas-deep mb-4">
          </div>
          <h1 className="text-2xl font-bold text-paper">Admin Console</h1>
          <p className="text-muted mt-1">Bonga Nami</p>
        </div>

        {/* Login Card */}
        <div className="bg-canvas-2 rounded-2xl p-8">
          <h2 className="text-xl font-semibold text-paper mb-6">Sign In</h2>
          
          {error && (
            <div className="mb-4 p-3 bg-flare/15 border border-flare rounded-lg text-flare text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="username" className="block text-sm font-medium text-muted mb-1">
                Username
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-4 py-2.5 border border-line rounded-lg focus:ring-2 focus:ring-flare focus:border-line transition-colors"
                placeholder="Enter username"
                required
                autoFocus
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-muted mb-1">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2.5 border border-line rounded-lg focus:ring-2 focus:ring-flare focus:border-line transition-colors"
                placeholder="Enter password"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 bg-canvas-deep text-paper font-medium rounded-lg hover: hover: focus:ring-4 focus:ring-flare transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Signing in...
                </span>
              ) : (
                'Sign In'
              )}
            </button>
          </form>
        </div>

        {/* Footer */}
        <p className="text-center text-muted text-sm mt-6">
          © 2026 Philip K. Kimani
        </p>
      </div>
    </div>
  )
}
