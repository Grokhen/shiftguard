import React, { useEffect, useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import {
  getUsuarios,
  type Usuario,
  type UsuarioFilters,
  actualizarUsuario,
} from '../../services/usuariosService'
import { getDelegaciones, type Delegacion } from '../../services/delegacionesService'
import { getRolesUsuario, type RolUsuario } from '../../services/rolesUsuarioService'

type UserEditModalProps = {
  user: Usuario
  roles: RolUsuario[]
  delegaciones: Delegacion[]
  accessToken: string
  onClose: () => void
  onUpdated: (updated: Usuario) => void
}

function UserEditModal({
  user,
  roles,
  delegaciones,
  accessToken,
  onClose,
  onUpdated,
}: UserEditModalProps) {
  const [nombre, setNombre] = useState(user.nombre)
  const [apellidos, setApellidos] = useState(user.apellidos)
  const [email, setEmail] = useState(user.email)
  const [rolId, setRolId] = useState<number>(user.rol_id)
  const [delegacionId, setDelegacionId] = useState<number | ''>(user.delegacion_id ?? '')
  const [activo, setActivo] = useState<boolean>(user.activo)
  const [password, setPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)

    try {
      const payload: Parameters<typeof actualizarUsuario>[2] = {
        nombre,
        apellidos,
        email,
        rol_id: rolId,
        delegacion_id: delegacionId === '' ? undefined : delegacionId,
        activo,
      }

      if (password.trim().length > 0) {
        payload.password = password.trim()
      }

      const updated = await actualizarUsuario(accessToken, user.id, payload)
      onUpdated(updated)
      onClose()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al guardar'
      setError(message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-4 shadow-lg sm:p-6">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900 sm:text-lg">Editar usuario</h2>
            <p className="text-xs text-slate-500 sm:text-sm">
              Modifica los datos del usuario y guarda los cambios.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
          >
            <span className="sr-only">Cerrar</span>✕
          </button>
        </div>

        {error && (
          <div className="mb-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 sm:text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
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
                value={rolId}
                onChange={(e) => setRolId(Number(e.target.value))}
                required
              >
                <option value="" disabled>
                  Selecciona un rol
                </option>
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
                value={delegacionId}
                onChange={(e) =>
                  setDelegacionId(e.target.value === '' ? '' : Number(e.target.value))
                }
              >
                <option value="">Sin delegación</option>
                {delegaciones.map((deleg) => (
                  <option key={deleg.id} value={deleg.id}>
                    {deleg.nombre}
                  </option>
                ))}
              </select>
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

            <div className="space-y-1 text-right">
              <label className="block text-xs font-medium text-slate-700">
                Resetear contraseña (opcional)
              </label>
              <input
                type="password"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 sm:text-sm"
                placeholder="Dejar vacío para no cambiar"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
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
              {saving ? 'Guardando…' : 'Guardar cambios'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export function AdminUsuariosPage() {
  const { accessToken } = useAuth()
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [delegaciones, setDelegaciones] = useState<Delegacion[]>([])
  const [roles, setRoles] = useState<RolUsuario[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [filterDelegacionId, setFilterDelegacionId] = useState<number | 'all'>('all')
  const [filterRolId, setFilterRolId] = useState<number | 'all'>('all')
  const [filterActivo, setFilterActivo] = useState<'all' | 'true' | 'false'>('all')

  const [editingUser, setEditingUser] = useState<Usuario | null>(null)

  useEffect(() => {
    if (!accessToken) return

    async function loadData(token: string) {
      setLoading(true)
      setError(null)
      try {
        const [usuariosData, delegacionesData, rolesData] = await Promise.all([
          getUsuarios(token),
          getDelegaciones(token),
          getRolesUsuario(token),
        ])

        setUsuarios(usuariosData)
        setDelegaciones(delegacionesData)
        setRoles(rolesData)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Error al cargar datos de usuarios'
        setError(message)
      } finally {
        setLoading(false)
      }
    }

    loadData(accessToken)
  }, [accessToken])

  async function reloadUsuariosWithFilters(overrides: Partial<UsuarioFilters> = {}) {
    if (!accessToken) return

    const filters: UsuarioFilters = {
      delegacionId:
        'delegacionId' in overrides
          ? overrides.delegacionId
          : filterDelegacionId === 'all'
            ? undefined
            : filterDelegacionId,
      rolId:
        'rolId' in overrides ? overrides.rolId : filterRolId === 'all' ? undefined : filterRolId,
      activo:
        'activo' in overrides
          ? overrides.activo
          : filterActivo === 'all'
            ? undefined
            : filterActivo === 'true',
    }

    setLoading(true)
    setError(null)
    try {
      const data = await getUsuarios(accessToken, filters)
      setUsuarios(data)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al cargar usuarios filtrados'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  function handleDelegacionFilterChange(value: string) {
    const newValue = value === 'all' ? 'all' : Number(value)
    setFilterDelegacionId(newValue)
    reloadUsuariosWithFilters({
      delegacionId: newValue === 'all' ? undefined : newValue,
    })
  }

  function handleRolFilterChange(value: string) {
    const newValue = value === 'all' ? 'all' : Number(value)
    setFilterRolId(newValue)
    reloadUsuariosWithFilters({
      rolId: newValue === 'all' ? undefined : newValue,
    })
  }

  function handleActivoFilterChange(value: string) {
    let activo: boolean | undefined
    if (value === 'true') activo = true
    else if (value === 'false') activo = false
    else activo = undefined

    setFilterActivo(value as 'all' | 'true' | 'false')
    reloadUsuariosWithFilters({ activo })
  }

  function handleUserUpdated(updated: Usuario) {
    setUsuarios((prev) => prev.map((u) => (u.id === updated.id ? updated : u)))
  }

  function getDelegacionNombre(delegacionId: number | null | undefined) {
    if (!delegacionId) return '-'
    const deleg = delegaciones.find((d) => d.id === delegacionId)
    return deleg ? deleg.nombre : `ID ${delegacionId}`
  }

  function getRolNombre(rolId: number) {
    const rol = roles.find((r) => r.id === rolId)
    return rol ? rol.nombre : `ID ${rolId}`
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-slate-900 sm:text-base">Filtros</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <label className="block text-xs font-medium text-slate-700">Delegación</label>
            <select
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              value={filterDelegacionId === 'all' ? 'all' : filterDelegacionId}
              onChange={(e) => handleDelegacionFilterChange(e.target.value)}
            >
              <option value="all">Todas</option>
              {delegaciones.map((deleg) => (
                <option key={deleg.id} value={deleg.id}>
                  {deleg.nombre}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-medium text-slate-700">Rol</label>
            <select
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              value={filterRolId === 'all' ? 'all' : filterRolId}
              onChange={(e) => handleRolFilterChange(e.target.value)}
            >
              <option value="all">Todos</option>
              {roles.map((rol) => (
                <option key={rol.id} value={rol.id}>
                  {rol.nombre} ({rol.codigo})
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-medium text-slate-700">Estado</label>
            <select
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              value={filterActivo}
              onChange={(e) => handleActivoFilterChange(e.target.value)}
            >
              <option value="all">Todos</option>
              <option value="true">Activos</option>
              <option value="false">Inactivos</option>
            </select>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-900 sm:text-base">Usuarios</h2>
          {loading && <span className="text-xs text-slate-500 sm:text-sm">Cargando…</span>}
        </div>

        {error && (
          <div className="mb-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 sm:text-sm">
            {error}
          </div>
        )}

        {!loading && usuarios.length === 0 && !error && (
          <p className="text-sm text-slate-500">
            No se han encontrado usuarios con los filtros actuales.
          </p>
        )}

        {usuarios.length > 0 && (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
                  <th className="px-3 py-2 font-medium">Nombre</th>
                  <th className="px-3 py-2 font-medium">Email</th>
                  <th className="px-3 py-2 font-medium">Rol</th>
                  <th className="px-3 py-2 font-medium">Delegación</th>
                  <th className="px-3 py-2 font-medium">Estado</th>
                  <th className="px-3 py-2 font-medium text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {usuarios.map((usuario) => (
                  <tr
                    key={usuario.id}
                    className="border-b border-slate-100 text-xs text-slate-700 last:border-0 sm:text-sm"
                  >
                    <td className="px-3 py-2">
                      {usuario.nombre} {usuario.apellidos}
                    </td>
                    <td className="px-3 py-2">{usuario.email}</td>
                    <td className="px-3 py-2">{getRolNombre(usuario.rol_id)}</td>
                    <td className="px-3 py-2">{getDelegacionNombre(usuario.delegacion_id)}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium sm:text-xs ${
                          usuario.activo
                            ? 'bg-green-50 text-green-700'
                            : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {usuario.activo ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => setEditingUser(usuario)}
                        className="text-xs font-medium text-blue-600 hover:text-blue-700 hover:underline sm:text-sm"
                      >
                        Editar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {editingUser && accessToken && (
        <UserEditModal
          user={editingUser}
          roles={roles}
          delegaciones={delegaciones}
          accessToken={accessToken}
          onClose={() => setEditingUser(null)}
          onUpdated={handleUserUpdated}
        />
      )}
    </div>
  )
}
