import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { cambiarPasswordPropia } from '../services/usuariosService'
import { notifyPasswordChanged } from '../utils/session'

export function ChangePasswordPage() {
  const { accessToken, user, signOut } = useAuth()
  const navigate = useNavigate()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!accessToken || isSubmitting) return
    setError(null)
    if (newPassword.length < 8) {
      setError('La nueva contraseña debe tener al menos 8 caracteres.')
      return
    }
    if (newPassword !== confirmation) {
      setError('Las contraseñas no coinciden.')
      return
    }
    if (currentPassword === newPassword) {
      setError('La nueva contraseña debe ser distinta de la actual.')
      return
    }

    setIsSubmitting(true)
    try {
      await cambiarPasswordPropia(accessToken, currentPassword, newPassword)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmation('')
      // Changing the password revokes this token. A late response must not sign out a newer login.
      notifyPasswordChanged(accessToken)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se ha podido cambiar la contraseña.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-blue-50 to-white px-4 py-8">
      <div className="w-full max-w-md rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">Cambiar contraseña</h1>
        <p className="mt-2 text-sm text-slate-600">
          {user?.requiresPasswordChange
            ? 'Debes sustituir tu contraseña antes de acceder a ShiftGuard.'
            : 'Elige una nueva contraseña para tu cuenta.'}{' '}
          Después tendrás que iniciar sesión de nuevo.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div className="space-y-1">
            <label htmlFor="current-password" className="block text-sm font-medium text-slate-700">
              Contraseña actual
            </label>
            <input
              id="current-password"
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              required
              disabled={isSubmitting}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="new-password" className="block text-sm font-medium text-slate-700">
              Nueva contraseña
            </label>
            <input
              id="new-password"
              name="newPassword"
              type="password"
              autoComplete="new-password"
              minLength={8}
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              required
              disabled={isSubmitting}
              aria-describedby="password-hint"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <p id="password-hint" className="text-xs text-slate-500">
              Al menos 8 caracteres y distinta de la actual.
            </p>
          </div>
          <div className="space-y-1">
            <label htmlFor="confirm-password" className="block text-sm font-medium text-slate-700">
              Confirmar nueva contraseña
            </label>
            <input
              id="confirm-password"
              name="confirmation"
              type="password"
              autoComplete="new-password"
              minLength={8}
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              required
              disabled={isSubmitting}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isSubmitting ? 'Guardando…' : 'Guardar contraseña'}
          </button>
        </form>

        <div className="mt-4 flex justify-between gap-3 text-sm">
          {!user?.requiresPasswordChange && (
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => navigate('/')}
              className="text-blue-700 hover:underline disabled:opacity-50"
            >
              Volver
            </button>
          )}
          <button
            type="button"
            disabled={isSubmitting}
            onClick={signOut}
            className="text-slate-600 hover:underline disabled:opacity-50"
          >
            Cerrar sesión
          </button>
        </div>
      </div>
    </div>
  )
}
