import type { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { ROLE_ADMIN, ROLE_SUPERVISOR, ROLE_TECNICO } from '../../constants/roles'

interface AppLayoutProps {
  children: ReactNode
  title?: string
  subtitle?: string
}

function roleLabel(roleId?: number | null) {
  switch (roleId) {
    case ROLE_TECNICO:
      return 'Técnico'
    case ROLE_SUPERVISOR:
      return 'Supervisor'
    case ROLE_ADMIN:
      return 'Administrador'
    default:
      return 'Usuario'
  }
}

export function AppLayout({ children, title, subtitle }: AppLayoutProps) {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()

  const handleLogout = () => {
    signOut()
    navigate('/', { replace: true })
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link to="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-white font-semibold">
              SG
            </div>
            <span className="font-semibold text-slate-900">ShiftGuard</span>
          </Link>

          <div className="flex items-center gap-3 text-sm text-slate-500">
            <span className="hidden sm:inline">{roleLabel(user?.role)}</span>
            <button
              onClick={handleLogout}
              className="rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Cerrar sesión
            </button>
            <div className="h-8 w-8 rounded-full bg-slate-200" />
          </div>
        </div>
      </header>

      <main className="flex-1">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-6">
          {(title || subtitle) && (
            <div className="flex flex-col gap-1">
              {title && (
                <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">{title}</h1>
              )}
              {subtitle && <p className="text-sm text-slate-500 sm:text-base">{subtitle}</p>}
            </div>
          )}

          {children}
        </div>
      </main>
    </div>
  )
}
