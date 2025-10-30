import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card'
import { Button } from '../../components/ui/button'
import { AlertCircle, CheckCircle } from 'lucide-react'
import { API_URL } from '../../config'

type SignupProps = {
  onSignup: (token: string, username: string, role: string) => void
}

export function Signup({ onSignup }: SignupProps) {
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!username || !email || !password) {
      setError('All fields are required')
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }

    setLoading(true)

    try {
      const response = await fetch(`${API_URL}/api/v1/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email, password }),
      })

      if (response.ok) {
        setSuccess(true)
        // Redirect to login after 2 seconds
        setTimeout(() => {
          navigate('/login')
        }, 2000)
      } else {
        const errorData = await response.json()
        setError(errorData.error || 'Signup failed')
      }
    } catch (err) {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#050505] p-4">
      <Card className="w-full max-w-md !border-white/10">
        <CardHeader className="text-center pb-4">
          <div className="flex justify-center mb-4">
            <img 
              src="/1Password_LIGHT_primary-logo_dark-backgrounds_cloud.png" 
              alt="1Password" 
              className="h-8 w-auto object-contain"
            />
          </div>
          <CardTitle className="text-2xl">Create Account</CardTitle>
          <CardDescription>
            Sign up for Observability Dashboard
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {success && (
              <div className="p-3 rounded bg-green-500/10 border border-green-500/20 flex items-start gap-2">
                <CheckCircle className="h-4 w-4 text-green-400 mt-0.5 flex-shrink-0" />
                <span className="text-sm text-green-400">Account created successfully! Redirecting to login...</span>
              </div>
            )}
            
            {error && (
              <div className="p-3 rounded bg-red-500/10 border border-red-500/20 flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-red-400 mt-0.5 flex-shrink-0" />
                <span className="text-sm text-red-400">{error}</span>
              </div>
            )}

            <div>
              <label htmlFor="username" className="block text-sm font-medium mb-2">
                Username
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full h-10 px-3 bg-black/50 border border-border rounded focus:outline-none focus:border-primary/50 transition-colors"
                placeholder="Enter your username"
                disabled={loading || success}
                autoComplete="username"
              />
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium mb-2">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full h-10 px-3 bg-black/50 border border-border rounded focus:outline-none focus:border-primary/50 transition-colors"
                placeholder="Enter your email"
                disabled={loading || success}
                autoComplete="email"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium mb-2">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full h-10 px-3 bg-black/50 border border-border rounded focus:outline-none focus:border-primary/50 transition-colors"
                placeholder="Enter your password"
                disabled={loading || success}
                autoComplete="new-password"
              />
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium mb-2">
                Confirm Password
              </label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full h-10 px-3 bg-black/50 border border-border rounded focus:outline-none focus:border-primary/50 transition-colors"
                placeholder="Confirm your password"
                disabled={loading || success}
                autoComplete="new-password"
              />
            </div>

            <Button
              type="submit"
              className="w-full h-10 bg-primary hover:bg-primary/90 text-primary-foreground"
              disabled={loading || success}
            >
              {success ? 'Account Created!' : loading ? 'Creating Account...' : 'Sign Up'}
            </Button>

            <div className="text-center text-sm text-foreground/60">
              Already have an account?{' '}
              <button
                type="button"
                onClick={() => navigate('/login')}
                className="text-primary hover:underline"
                disabled={loading || success}
              >
                Log in
              </button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}


