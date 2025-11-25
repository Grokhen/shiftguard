import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { FormEvent } from 'react'
import { login } from '../services/authService'
import { parseJwt } from '../utils/jwt'

export function LoginPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('admin@empresa.local')
  const [password, setPassword] = useState('Admin1234!')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setError(null)

    try {
      const { access_token } = await login(email, password)

      localStorage.setItem('access_token', access_token)

      const payload = parseJwt(access_token)

      if (!payload) {
        throw new Error('Token recibido inválido')
      }

      const roleId = payload.role
      localStorage.setItem('user_role_id', String(roleId))
      localStorage.setItem('user_delegacion_id', String(payload.deleg))

      if (roleId === 1) {
        navigate('/tecnico', { replace: true })
      } else if (roleId === 2) {
        navigate('/supervisor', { replace: true })
      } else {
        navigate('/admin', { replace: true })
      }
    } catch (err) {
      console.error(err)
      setError(
        err instanceof Error ? err.message : 'No se ha podido iniciar sesión. Inténtalo de nuevo.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-blue-50 to-white px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-sm border border-slate-100">
        <div className="mb-6 flex flex-col items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 text-white font-semibold">
            SG
          </div>
          <h1 className="text-xl font-semibold text-slate-900">Acceso a ShiftGuard</h1>
          <p className="text-center text-sm text-slate-500">
            Introduce tu correo corporativo y contraseña para entrar.
          </p>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-slate-700">Correo electrónico</label>
            <input
              type="email"
              autoComplete="email"
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none ring-0 transition focus:border-blue-500 focus:bg-white focus:ring-1 focus:ring-blue-500"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu.nombre@empresa.local"
              required
            />
          </div>

          <div className="space-y-1">
            <label className="block text-sm font-medium text-slate-700">Contraseña</label>
            <input
              type="password"
              autoComplete="current-password"
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none ring-0 transition focus:border-blue-500 focus:bg-white focus:ring-1 focus:ring-blue-500"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="mt-2 w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isSubmitting ? 'Entrando…' : 'Entrar'}
          </button>

          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        </form>

        <p className="mt-4 text-center text-xs text-slate-400">Versión demo - ShiftGuard © 2025</p>
      </div>
    </div>
  )
}
