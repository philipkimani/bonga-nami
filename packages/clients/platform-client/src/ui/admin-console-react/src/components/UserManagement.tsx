import { useState, useEffect } from 'react'
import { X } from 'lucide-react'

interface AdminUser {
  id: string
  username: string
  email: string | null
  displayName: string | null
  role: string
  isActive: boolean
  lastLoginAt: string | null
  loginCount: number
  createdAt: string
}

export default function UserManagement() {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null)

  // Get current user role from localStorage
  useEffect(() => {
    const storedUser = localStorage.getItem('admin_user')
    if (storedUser) {
      try {
        const user = JSON.parse(storedUser)
        setCurrentUserRole(user.role)
      } catch {
        // Ignore
      }
    }
  }, [])

  const loadUsers = async () => {
    setLoading(true)
    setError(null)
    try {
      const token = localStorage.getItem('admin_token')
      const res = await fetch('/api/auth/users', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
      const data = await res.json()
      
      if (data.success) {
        setUsers(data.users)
      } else {
        setError(data.error || 'Failed to load users')
      }
    } catch (e) {
      setError('Failed to connect to server')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadUsers()
  }, [])

  // Only super_admin can see user management
  if (currentUserRole !== 'super_admin') {
    return null
  }

  return (
    <div className="bg-canvas-2 rounded-xl border p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-paper"> Admin Users</h2>
          <p className="text-sm text-muted mt-1">
            Manage who can access the admin console
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-canvas-deep text-paper rounded-lg hover:opacity-90 transition text-sm font-medium flex items-center gap-2"
        >
          Add User
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-flare/12 border border-flare rounded-lg text-flare-ink text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-10">
          <div className="animate-spin text-2xl">⏳</div>
          <span className="ml-2 text-muted">Loading users...</span>
        </div>
      ) : users.length === 0 ? (
        <div className="text-center py-10 text-muted">
          No users found
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-canvas-deep">
                <th className="text-left py-3 px-4 font-medium text-muted">User</th>
                <th className="text-left py-3 px-4 font-medium text-muted">Role</th>
                <th className="text-left py-3 px-4 font-medium text-muted">Status</th>
                <th className="text-left py-3 px-4 font-medium text-muted">Last Login</th>
                <th className="text-right py-3 px-4 font-medium text-muted">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <UserRow
                  key={user.id}
                  user={user}
                  onUpdate={loadUsers}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreateModal && (
        <CreateUserModal
          onClose={() => setShowCreateModal(false)}
          onCreated={() => {
            setShowCreateModal(false)
            loadUsers()
          }}
        />
      )}
    </div>
  )
}

interface UserRowProps {
  user: AdminUser
  onUpdate: () => void
}

function UserRow({ user, onUpdate }: UserRowProps) {
  const [showActions, setShowActions] = useState(false)
  const [showResetPassword, setShowResetPassword] = useState(false)
  const [loading, setLoading] = useState(false)

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'super_admin':
        return (
          <span className="px-2 py-1 bg-flare/12 text-flare-ink rounded-full text-xs font-medium">
            Super Admin
          </span>
        )
      case 'admin':
        return (
          <span className="px-2 py-1 bg-canvas-deep text-muted rounded-full text-xs font-medium">
            Admin
          </span>
        )
      case 'viewer':
        return (
          <span className="px-2 py-1 bg-canvas-deep text-paper rounded-full text-xs font-medium">
            Viewer
          </span>
        )
      default:
        return (
          <span className="px-2 py-1 bg-canvas-deep text-muted rounded-full text-xs">
            {role}
          </span>
        )
    }
  }

  const handleToggleActive = async () => {
    setLoading(true)
    try {
      const token = localStorage.getItem('admin_token')
      const res = await fetch(`/api/auth/users/${user.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ isActive: !user.isActive }),
      })
      const data = await res.json()
      if (data.success) {
        onUpdate()
      }
    } catch (e) {
      console.error('Failed to toggle user status:', e)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm(`Are you sure you want to delete user "${user.username}"? This cannot be undone.`)) {
      return
    }

    setLoading(true)
    try {
      const token = localStorage.getItem('admin_token')
      const res = await fetch(`/api/auth/users/${user.id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
      const data = await res.json()
      if (data.success) {
        onUpdate()
      }
    } catch (e) {
      console.error('Failed to delete user:', e)
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Never'
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <>
      <tr className="border-b hover:bg-canvas-deep">
        <td className="py-3 px-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-canvas-deep flex items-center justify-center text-paper font-bold">
              {user.username.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="font-medium text-paper">
                {user.displayName || user.username}
              </div>
              <div className="text-xs text-muted">
                @{user.username}
                {user.email && ` • ${user.email}`}
              </div>
            </div>
          </div>
        </td>
        <td className="py-3 px-4">
          {getRoleBadge(user.role)}
        </td>
        <td className="py-3 px-4">
          <span
            className={`px-2 py-1 rounded-full text-xs font-medium ${
              user.isActive
                ? 'bg-mint/15 text-mint-ink'
                : 'bg-flare/12 text-flare-ink'
            }`}
          >
            {user.isActive ? 'Active' : 'Disabled'}
          </span>
        </td>
        <td className="py-3 px-4 text-muted text-sm">
          {formatDate(user.lastLoginAt)}
          {user.loginCount > 0 && (
            <span className="text-xs text-muted ml-1">({user.loginCount} logins)</span>
          )}
        </td>
        <td className="py-3 px-4 text-right relative">
          <button
            onClick={() => setShowActions(!showActions)}
            disabled={loading}
            className="p-2 hover:bg-canvas-deep rounded-lg transition disabled:opacity-50"
          >
            {loading ? '⏳' : '⋮'}
          </button>

          {showActions && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setShowActions(false)}
              />
              <div className="absolute right-0 mt-1 w-48 bg-canvas-2 rounded-lg border z-20">
                <button
                  onClick={() => {
                    setShowActions(false)
                    setShowResetPassword(true)
                  }}
                  className="w-full text-left px-4 py-2 text-sm hover:bg-canvas-deep flex items-center gap-2"
                >
                  Reset Password
                </button>
                <button
                  onClick={() => {
                    setShowActions(false)
                    handleToggleActive()
                  }}
                  className="w-full text-left px-4 py-2 text-sm hover:bg-canvas-deep flex items-center gap-2"
                >
                  {user.isActive ? 'Disable' : 'Enable'}
                </button>
                <hr />
                <button
                  onClick={() => {
                    setShowActions(false)
                    handleDelete()
                  }}
                  className="w-full text-left px-4 py-2 text-sm text-flare-ink hover:bg-flare/12 flex items-center gap-2"
                >
                  Delete User
                </button>
              </div>
            </>
          )}
        </td>
      </tr>

      {showResetPassword && (
        <ResetPasswordModal
          user={user}
          onClose={() => setShowResetPassword(false)}
          onReset={() => {
            setShowResetPassword(false)
            onUpdate()
          }}
        />
      )}
    </>
  )
}

interface CreateUserModalProps {
  onClose: () => void
  onCreated: () => void
}

function CreateUserModal({ onClose, onCreated }: CreateUserModalProps) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'ADMIN' | 'SUPER_ADMIN'>('ADMIN')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (username.length < 3) {
      setError('Username must be at least 3 characters')
      return
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }

    setLoading(true)
    try {
      const token = localStorage.getItem('admin_token')
      const res = await fetch('/api/auth/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          username,
          password,
          displayName: displayName || username,
          email: email || null,
          role,
        }),
      })

      const data = await res.json()

      if (data.success) {
        onCreated()
      } else {
        setError(data.error || 'Failed to create user')
      }
    } catch (e) {
      setError('Connection failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-canvas-2 rounded-2xl max-w-md w-full p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-paper"> Create New Admin User</h3>
          <button
            onClick={onClose}
            className="p-1 hover:bg-canvas-deep rounded-lg transition"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-flare/12 border border-flare rounded-lg text-flare-ink text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-muted mb-1">
              Username <span className="text-flare-ink">*</span>
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
              className="w-full px-4 py-2 border border-line rounded-lg focus:ring-2 focus:ring-flare-ink focus:border-line"
              placeholder="e.g., johndoe"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-muted mb-1">
              Display Name
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full px-4 py-2 border border-line rounded-lg focus:ring-2 focus:ring-flare-ink focus:border-line"
              placeholder="e.g., John Doe"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-muted mb-1">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2 border border-line rounded-lg focus:ring-2 focus:ring-flare-ink focus:border-line"
              placeholder="e.g., john@example.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-muted mb-1">
              Temporary Password <span className="text-flare-ink">*</span>
            </label>
            <input
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2 border border-line rounded-lg focus:ring-2 focus:ring-flare-ink focus:border-line"
              placeholder="Min 8 characters"
              required
            />
            <p className="text-xs text-muted mt-1">
              User will be required to change this on first login
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-muted mb-2">
              Role <span className="text-flare-ink">*</span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setRole('ADMIN')}
                className={`p-3 rounded-lg border-2 text-left transition ${
                  role === 'ADMIN'
                    ? 'border-line bg-canvas-deep'
                    : 'border-line hover:border-line'
                }`}
              >
                <div className="font-medium text-paper"> Admin</div>
                <div className="text-xs text-muted mt-1">
                  Full access to platform settings
                </div>
              </button>
              <button
                type="button"
                onClick={() => setRole('SUPER_ADMIN')}
                className={`p-3 rounded-lg border-2 text-left transition ${
                  role === 'SUPER_ADMIN'
                    ? 'border-flare bg-flare/12'
                    : 'border-line hover:border-line'
                }`}
              >
                <div className="font-medium text-paper"> Super Admin</div>
                <div className="text-xs text-muted mt-1">
                  Can manage other admin users
                </div>
              </button>
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-line text-muted rounded-lg hover:bg-canvas-deep transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 bg-canvas-deep text-paper rounded-lg hover:opacity-90 transition disabled:opacity-50"
            >
              {loading ? 'Creating...' : 'Create User'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

interface ResetPasswordModalProps {
  user: AdminUser
  onClose: () => void
  onReset: () => void
}

function ResetPasswordModal({ user, onClose, onReset }: ResetPasswordModalProps) {
  const [newPassword, setNewPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }

    setLoading(true)
    try {
      const token = localStorage.getItem('admin_token')
      const res = await fetch(`/api/auth/users/${user.id}/reset-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ newPassword }),
      })

      const data = await res.json()

      if (data.success) {
        onReset()
      } else {
        setError(data.error || 'Failed to reset password')
      }
    } catch (e) {
      setError('Connection failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-canvas-2 rounded-2xl max-w-md w-full p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-paper"> Reset Password</h3>
          <button
            onClick={onClose}
            className="p-1 hover:bg-canvas-deep rounded-lg transition"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <p className="text-sm text-muted mb-4">
          Set a new temporary password for <strong>{user.displayName || user.username}</strong>.
          They will be required to change it on their next login.
        </p>

        {error && (
          <div className="mb-4 p-3 bg-flare/12 border border-flare rounded-lg text-flare-ink text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-muted mb-1">
              New Temporary Password
            </label>
            <input
              type="text"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full px-4 py-2 border border-line rounded-lg focus:ring-2 focus:ring-flare-ink focus:border-line"
              placeholder="Min 8 characters"
              required
              autoFocus
            />
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-line text-muted rounded-lg hover:bg-canvas-deep transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 bg-canvas-deep text-paper rounded-lg hover:opacity-90 transition disabled:opacity-50"
            >
              {loading ? 'Resetting...' : 'Reset Password'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
