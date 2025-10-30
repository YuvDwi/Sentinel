import { createContext, useContext, useState, useEffect, ReactNode } from 'react'

interface AuthContextType {
  isAuthenticated: boolean
  token: string | null
  username: string | null
  role: string | null
  login: (token: string, username: string, role: string) => void
  logout: () => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null)
  const [username, setUsername] = useState<string | null>(null)
  const [role, setRole] = useState<string | null>(null)

  // Load auth data from localStorage on mount
  useEffect(() => {
    const storedToken = localStorage.getItem('auth_token')
    const storedUsername = localStorage.getItem('username')
    const storedRole = localStorage.getItem('role')

    if (storedToken && storedUsername && storedRole) {
      setToken(storedToken)
      setUsername(storedUsername)
      setRole(storedRole)
    }
  }, [])

  const login = (newToken: string, newUsername: string, newRole: string) => {
    setToken(newToken)
    setUsername(newUsername)
    setRole(newRole)
    localStorage.setItem('auth_token', newToken)
    localStorage.setItem('username', newUsername)
    localStorage.setItem('role', newRole)
  }

  const logout = () => {
    setToken(null)
    setUsername(null)
    setRole(null)
    localStorage.removeItem('auth_token')
    localStorage.removeItem('username')
    localStorage.removeItem('role')
  }

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated: !!token,
        token,
        username,
        role,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}



