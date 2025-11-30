import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { getDelegaciones, type Delegacion } from '../../services/delegacionesService'
import { getRolesUsuario, type RolUsuario } from '../../services/rolesUsuarioService'
import { crearUsuario, type CrearUsuarioInput } from '../../services/usuariosService'

export function AdminUsuarioNuevoPage() {
  const { accessToken } = useAuth()
  const navigate = useNavigate()

  const [delegaciones, setDelegaciones] = useState<Delegacion[]>([])
  const [roles, setRoles] = useState<RolUsuario[]>([])
  const [loadingLookups, setLoadingLookups] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [nombre, setNombre] = useState('')
  const [apellidos, setApellidos] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [rolId, setRolId] = useState<number | ''>('')
  const [delegacionId, setDelegacionId] = useState<number | ''>('')
  const [activo, setActivo] = useState(true)

  useEffect(() => {
    if (!accessToken) return

    async function loadLookups(token: string) {
      setLoadingLookups(true)
      setError(null)
      try {
        const [delegacionesData, rolesData] = await Promise.all([
          getDelegaciones(token),
          getRolesUsuario(token),
        ])
        setDelegaciones(delegacionesData)
        setRoles(rolesData)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Error al cargar datos auxiliares'
        setError(message)
      } finally {
        setLoadingLookups(false)
      }
    }

    loadLookups(accessToken)
  }, [accessToken])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!accessToken) return

    setError(null)

    if (!rolId || !delegacionId) {
      setError('Debes seleccionar un rol y una delegación.')
      return
    }

    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.')
      return
    }

    if (password !== passwordConfirm) {
      setError('Las contraseñas no coinciden.')
      return
    }

    const payload: CrearUsuarioInput = {
      nombre: nombre.trim(),
      apellidos: apellidos.trim(),
      email: email.trim(),
      password: password.trim(),
      rol_id: rolId,
      delegacion_id: delegacionId,
      activo,
    }

    setSaving(true)
    try {
      await crearUsuario(accessToken, payload)
      navigate('/admin/usuarios')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al crear usuario'
      setError(message)
    } finally {
      setSaving(false)
    }
  }

  if (!accessToken) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-500 shadow-sm">
        No hay token de acceso. Vuelve a iniciar sesión.
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-xl">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <h2 className="mb-2 text-base font-semibold text-slate-900 sm:text-lg">Nuevo usuario</h2>
        <p className="mb-4 text-xs text-slate-500 sm:text-sm">
          Crea una nueva cuenta de usuario asignando rol, delegación y estado inicial.
        </p>

        {error && (
          <div className="mb-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 sm:text-sm">
            {error}
          </div>
        )}

        {loadingLookups ? (
          <p className="text-sm text-slate-500">Cargando datos…</p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="block text-xs font-medium text-slate-700">Nombre</label>
                <input
                  type="text"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-medium text-slate-700">Apellidos</label>
                <input
                  type="text"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  value={apellidos}
                  onChange={(e) => setApellidos(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-medium text-slate-700">Email</label>
              <input
                type="email"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="block text-xs font-medium text-slate-700">Rol</label>
                <select
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  value={rolId === '' ? '' : rolId}
                  onChange={(e) => setRolId(e.target.value === '' ? '' : Number(e.target.value))}
                  required
                >
                  <option value="">Selecciona un rol</option>
                  {roles.map((rol) => (
                    <option key={rol.id} value={rol.id}>
                      {rol.nombre} ({rol.codigo})
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-medium text-slate-700">Delegación</label>
                <select
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  value={delegacionId === '' ? '' : delegacionId}
                  onChange={(e) =>
                    setDelegacionId(e.target.value === '' ? '' : Number(e.target.value))
                  }
                  required
                >
                  <option value="">Selecciona una delegación</option>
                  {delegaciones.map((deleg) => (
                    <option key={deleg.id} value={deleg.id}>
                      {deleg.nombre}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="block text-xs font-medium text-slate-700">Contraseña</label>
                <input
                  type="password"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-medium text-slate-700">
                  Confirmar contraseña
                </label>
                <input
                  type="password"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  value={passwordConfirm}
                  onChange={(e) => setPasswordConfirm(e.target.value)}
                  required
                  minLength={8}
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-4">
              <label className="flex items-center gap-2 text-xs text-slate-700 sm:text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  checked={activo}
                  onChange={(e) => setActivo(e.target.checked)}
                />
                Usuario activo
              </label>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => navigate('/admin/usuarios')}
                className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 sm:text-sm"
                disabled={saving}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-60 sm:text-sm"
                disabled={saving}
              >
                {saving ? 'Creando…' : 'Crear usuario'}
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  )
}
