import { useState } from 'react'
import { Check, Circle } from 'lucide-react'

interface ChangePasswordProps {
  onPasswordChanged: () => void
  username: string
}

export default function ChangePassword({ onPasswordChanged, username }: ChangePasswordProps) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // Password strength validation
  const getPasswordStrength = (password: string) => {
    let strength = 0
    if (password.length >= 8) strength++
    if (password.length >= 12) strength++
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) strength++
    if (/\d/.test(password)) strength++
    if (/[^a-zA-Z0-9]/.test(password)) strength++
    return strength
  }

  const passwordStrength = getPasswordStrength(newPassword)
  const strengthLabels = ['Very Weak', 'Weak', 'Fair', 'Strong', 'Very Strong']
  const strengthColors = ['bg-flare', 'bg-sun', 'bg-sun', 'bg-lime-500', 'bg-mint']

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    // Validation
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }

    if (passwordStrength < 3) {
      setError('Please choose a stronger password. Include uppercase, lowercase, numbers, and special characters.')
      return
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    if (newPassword === currentPassword) {
      setError('New password must be different from current password')
      return
    }

    setLoading(true)

    try {
      const token = localStorage.getItem('admin_token')
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        credentials: 'include',
        body: JSON.stringify({ currentPassword, newPassword }),
      })

      const data = await res.json()

      if (!res.ok || !data.success) {
        setError(data.error || 'Failed to change password')
        return
      }

      // Update stored user info to reflect password changed
      const userStr = localStorage.getItem('admin_user')
      if (userStr) {
        const user = JSON.parse(userStr)
        user.mustChangePassword = false
        localStorage.setItem('admin_user', JSON.stringify(user))
      }

      onPasswordChanged()
    } catch (err) {
      setError('Connection failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-canvas-deep flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-canvas-deep mb-4">
          </div>
          <h1 className="text-2xl font-bold text-paper">Change Password Required</h1>
          <p className="text-muted mt-1">
            Welcome, <span className="text-paper font-medium">{username}</span>
          </p>
        </div>

        {/* Card */}
        <div className="bg-canvas-2 rounded-2xl p-8">
          <div className="mb-6 p-4 bg-sun/15 border border-sun rounded-lg">
            <p className="text-sun text-sm">
              <strong> Security Notice:</strong> You must set a new password before accessing the admin console.
              Choose a strong password with at least 8 characters.
            </p>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-flare/15 border border-flare rounded-lg text-flare text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="currentPassword" className="block text-sm font-medium text-muted mb-1">
                Current Password
              </label>
              <input
                id="currentPassword"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full px-4 py-2.5 border border-line rounded-lg focus:ring-2 focus:ring-flare focus:border-line transition-colors"
                placeholder="Enter current password"
                required
                autoFocus
              />
            </div>

            <div>
              <label htmlFor="newPassword" className="block text-sm font-medium text-muted mb-1">
                New Password
              </label>
              <input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-4 py-2.5 border border-line rounded-lg focus:ring-2 focus:ring-flare focus:border-line transition-colors"
                placeholder="Enter new password"
                required
              />
              {newPassword && (
                <div className="mt-2">
                  <div className="flex gap-1 mb-1">
                    {[0, 1, 2, 3, 4].map((i) => (
                      <div
                        key={i}
                        className={`h-1.5 flex-1 rounded-full transition-colors ${
                          i < passwordStrength ? strengthColors[passwordStrength - 1] : 'bg-canvas-deep'
                        }`}
                      />
                    ))}
                  </div>
                  <p className={`text-xs ${passwordStrength >= 3 ? 'text-mint' : 'text-muted'}`}>
                    Strength: {strengthLabels[passwordStrength - 1] || 'Too short'}
                  </p>
                </div>
              )}
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-muted mb-1">
                Confirm New Password
              </label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className={`w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-flare focus:border-line transition-colors ${
                  confirmPassword && confirmPassword !== newPassword
                    ? 'border-flare bg-flare/15'
                    : confirmPassword && confirmPassword === newPassword
                    ? 'border-mint bg-mint/15'
                    : 'border-line'
                }`}
                placeholder="Confirm new password"
                required
              />
              {confirmPassword && confirmPassword !== newPassword && (
                <p className="text-xs text-flare mt-1">Passwords do not match</p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading || passwordStrength < 3 || newPassword !== confirmPassword}
              className="w-full py-3 px-4 bg-canvas-deep text-paper font-medium rounded-lg hover: hover: focus:ring-4 focus:ring-flare transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Changing Password...
                </span>
              ) : (
                'Set New Password'
              )}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-line">
            <p className="text-xs text-muted">
              <strong>Password requirements:</strong>
            </p>
            <ul className="text-xs text-muted mt-2 space-y-1">
              <li className={newPassword.length >= 8 ? 'text-mint' : ''}>
                {newPassword.length >= 8 ? <Check className="inline h-3.5 w-3.5 text-mint" aria-hidden="true" /> : <Circle className="inline h-3.5 w-3.5 text-muted" aria-hidden="true" />} At least 8 characters
              </li>
              <li className={/[a-z]/.test(newPassword) && /[A-Z]/.test(newPassword) ? 'text-mint' : ''}>
                {/[a-z]/.test(newPassword) && /[A-Z]/.test(newPassword) ? <Check className="inline h-3.5 w-3.5 text-mint" aria-hidden="true" /> : <Circle className="inline h-3.5 w-3.5 text-muted" aria-hidden="true" />} Uppercase and lowercase letters
              </li>
              <li className={/\d/.test(newPassword) ? 'text-mint' : ''}>
                {/\d/.test(newPassword) ? <Check className="inline h-3.5 w-3.5 text-mint" aria-hidden="true" /> : <Circle className="inline h-3.5 w-3.5 text-muted" aria-hidden="true" />} At least one number
              </li>
              <li className={/[^a-zA-Z0-9]/.test(newPassword) ? 'text-mint' : ''}>
                {/[^a-zA-Z0-9]/.test(newPassword) ? <Check className="inline h-3.5 w-3.5 text-mint" aria-hidden="true" /> : <Circle className="inline h-3.5 w-3.5 text-muted" aria-hidden="true" />} At least one special character
              </li>
            </ul>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-muted text-sm mt-6">
          © 2026 Philip K. Kimani
        </p>
      </div>
    </div>
  )
}
