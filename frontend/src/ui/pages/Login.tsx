import { useState, FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card'
import { Button } from '../../components/ui/button'
import { AlertCircle } from 'lucide-react'
import { API_URL } from '../../config'

interface LoginResponse {
  token: string
  username: string
  role: string
  expires_in: number
}

export function Login({ onLogin }: { onLogin: (token: string, username: string, role: string) => void }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch(`${API_URL}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })

      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.error || 'Login failed')
      }

      const data: LoginResponse = await res.json()
      
      // Store token in localStorage
      localStorage.setItem('auth_token', data.token)
      localStorage.setItem('username', data.username)
      localStorage.setItem('role', data.role)
      
      // Call parent callback
      onLogin(data.token, data.username, data.role)
      
      // Navigate to dashboard
      navigate('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#050505] px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <img 
            src="/1Password_LIGHT_primary-logo_dark-backgrounds_cloud.png" 
            alt="1Password" 
            className="h-12 w-auto object-contain"
          />
        </div>

        <Card className="!border-white/10">
          <CardHeader className="text-center pb-4">
            <CardTitle className="text-2xl">Observability Dashboard</CardTitle>
            <CardDescription className="text-base text-foreground/70">
              Sign in with your 1Password credentials
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Username */}
              <div>
                <label htmlFor="username" className="block text-sm font-medium text-foreground/80 mb-2">
                  Username
                </label>
                <input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  autoFocus
                  disabled={loading}
                  className="w-full h-11 px-4 bg-white/5 border border-white/20 rounded text-base text-foreground placeholder:text-foreground/40 focus:outline-none focus:border-blue-500/50 focus:bg-white/10 transition-colors disabled:opacity-50"
                  placeholder="Enter your username"
                />
              </div>

              {/* Password */}
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-foreground/80 mb-2">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={loading}
                  className="w-full h-11 px-4 bg-white/5 border border-white/20 rounded text-base text-foreground placeholder:text-foreground/40 focus:outline-none focus:border-blue-500/50 focus:bg-white/10 transition-colors disabled:opacity-50"
                  placeholder="Enter your password"
                />
              </div>

              {/* Error message */}
              {error && (
                <div className="p-3 rounded bg-red-500/10 border border-red-500/20 flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
                  <div className="text-sm text-red-400">{error}</div>
                </div>
              )}

              {/* Submit button */}
              <Button
                type="submit"
                disabled={loading}
                className="w-full h-11 bg-blue-500 hover:bg-blue-600 text-white font-medium disabled:opacity-50"
              >
                {loading ? 'Signing in...' : 'Sign In'}
              </Button>

              {/* Signup link */}
              <div className="text-center text-sm text-foreground/60 mt-4">
                Don't have an account?{' '}
                <button
                  type="button"
                  onClick={() => navigate('/signup')}
                  className="text-blue-400 hover:underline"
                  disabled={loading}
                >
                  Sign up
                </button>
              </div>
            </form>
          </CardContent>
        </Card>

        <div className="mt-6 text-center text-xs text-foreground/50">
          Secured by 1Password Service Accounts
        </div>
      </div>
    </div>
  )
}

