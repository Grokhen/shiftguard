import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import type { RoleCode } from '../../constants/roles'

interface ProtectedRouteProps {
  children: ReactNode
  allowedRoles?: RoleCode[]
}

export function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const { isAuthenticated, user, isLoading } = useAuth()
  const location = useLocation()

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="rounded-xl bg-white px-4 py-3 text-sm text-slate-600 shadow">
          Cargando sesión…
        </div>
      </div>
    )
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/" replace state={{ from: location }} />
  }

  if (allowedRoles && !allowedRoles.includes(user.roleCode)) {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}
