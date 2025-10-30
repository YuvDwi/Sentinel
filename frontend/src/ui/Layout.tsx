import { ReactNode, useState, useRef, useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import { Button } from '../components/ui/button'
import { Home, Activity, BarChart3, Bot, LogOut, ChevronDown } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen bg-[#050505] text-foreground">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        {children}
      </div>
    </div>
  )
}

function Sidebar() {
  const { username, role, logout } = useAuth()
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  
  const mainNav = [
    { label: 'Overview', icon: Home, path: '/' },
    { label: 'Tracing', icon: Activity, path: '/tracing' },
    { label: 'Query Builder', icon: BarChart3, path: '/metrics' },
    { label: 'Copilot', icon: Bot, path: '/assistant' },
  ]
  
  const dashboardsNav: any[] = []
  
  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsUserMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])
  
  return (
    <aside className="w-52 bg-[#0a0a0a] border-r border-border flex flex-col">
      {/* Logo */}
      <div className="p-3 border-b border-border">
        <div className="flex items-center justify-center py-1">
          <img 
            src="/1Password_LIGHT_primary-logo_dark-backgrounds_cloud.png" 
            alt="1Password" 
            className="h-6 w-auto object-contain"
          />
        </div>
      </div>
      
      {/* Main navigation */}
      <nav className="flex-1 overflow-y-auto p-3">
        <div className="space-y-2 mb-6">
          {mainNav.map(item => (
            <NavLink
              key={item.label}
              to={item.path}
              className={({ isActive }) => `flex items-center gap-3 h-9 px-3 rounded text-sm transition-colors ${
                isActive 
                  ? 'bg-white/10 text-foreground' 
                  : 'text-foreground/80 hover:bg-white/5 hover:text-foreground'
              }`}
            >
              <item.icon className="h-4 w-4" />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </div>
        
        {/* Dashboards section */}
        {dashboardsNav.length > 0 && (
          <div>
            <div className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Dashboards
            </div>
            <div className="space-y-2">
              {dashboardsNav.map(item => (
                <NavLink
                  key={item.label}
                  to={item.path}
                  className={({ isActive }) => `flex items-center gap-3 h-9 px-3 rounded text-sm transition-colors ${
                    isActive 
                      ? 'bg-white/10 text-foreground' 
                      : 'text-foreground/80 hover:bg-white/5 hover:text-foreground'
                  }`}
                  >
                    <item.icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </NavLink>
              ))}
            </div>
          </div>
        )}
      </nav>
      
      {/* User section */}
      <div className="p-3 border-t border-border relative" ref={menuRef}>
        <Button 
          variant="ghost" 
          className="w-full justify-start gap-3 h-auto py-2 hover:bg-accent/80 transition-all duration-200"
          onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
        >
          <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-sm font-semibold text-primary-foreground">
            {username ? username.substring(0, 2).toUpperCase() : 'OP'}
          </div>
          <div className="flex-1 text-left">
            <div className="text-sm font-medium">{username || 'User'}</div>
            <div className="text-xs text-muted-foreground capitalize">{role || 'viewer'}</div>
          </div>
          <ChevronDown className={`h-4 w-4 transition-transform ${isUserMenuOpen ? 'rotate-180' : ''}`} />
        </Button>
        
        {/* Dropdown menu */}
        {isUserMenuOpen && (
          <div className="absolute bottom-full left-3 right-3 mb-2 bg-[#1a1a1a] border border-border rounded-lg shadow-lg overflow-hidden">
            <button
              onClick={() => {
                logout()
                setIsUserMenuOpen(false)
              }}
              className="w-full flex items-center gap-3 px-4 py-3 text-sm hover:bg-white/5 transition-colors text-left"
            >
              <LogOut className="h-4 w-4" />
              <span>Sign out</span>
            </button>
          </div>
        )}
      </div>
    </aside>
  )
}
