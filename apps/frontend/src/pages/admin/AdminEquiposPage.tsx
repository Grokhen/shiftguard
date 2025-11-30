import React, { useEffect, useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import {
  getEquipos,
  getEquipoDetalle,
  actualizarEquipo,
  addMiembroEquipo,
  removeMiembroEquipo,
  type Equipo,
  type EquipoDetalle,
} from '../../services/equiposService'
import { getDelegaciones, type Delegacion } from '../../services/delegacionesService'
import { getUsuarios, type Usuario } from '../../services/usuariosService'

type EquipoEditModalProps = {
  equipo: Equipo
  delegaciones: Delegacion[]
  accessToken: string
  onClose: () => void
  onUpdated: (updated: Equipo) => void
}

function EquipoEditModal({
  equipo,
  delegaciones,
  accessToken,
  onClose,
  onUpdated,
}: EquipoEditModalProps) {
  const [nombreEquipo, setNombreEquipo] = useState(equipo.nombre_equipo)
  const [delegacionId, setDelegacionId] = useState<number>(equipo.delegacion_id)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)

    try {
      const payload: Parameters<typeof actualizarEquipo>[2] = {
        nombre_equipo: nombreEquipo.trim(),
        delegacion_id: delegacionId,
      }

      const updated = await actualizarEquipo(accessToken, equipo.id, payload)
      onUpdated(updated)
      onClose()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al guardar cambios del equipo'
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
            <h2 className="text-base font-semibold text-slate-900 sm:text-lg">Editar equipo</h2>
            <p className="text-xs text-slate-500 sm:text-sm">
              Modifica el nombre y la delegación del equipo.
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
          <div className="space-y-1">
            <label className="block text-xs font-medium text-slate-700">Nombre del equipo</label>
            <input
              type="text"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              value={nombreEquipo}
              onChange={(e) => setNombreEquipo(e.target.value)}
              required
            />
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-medium text-slate-700">Delegación</label>
            <select
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              value={delegacionId}
              onChange={(e) => setDelegacionId(Number(e.target.value))}
              required
            >
              {delegaciones.map((deleg) => (
                <option key={deleg.id} value={deleg.id}>
                  {deleg.nombre}
                </option>
              ))}
            </select>
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

export function AdminEquiposPage() {
  const { accessToken } = useAuth()

  const [equipos, setEquipos] = useState<Equipo[]>([])
  const [delegaciones, setDelegaciones] = useState<Delegacion[]>([])
  const [selectedEquipoId, setSelectedEquipoId] = useState<number | null>(null)
  const [equipoDetalle, setEquipoDetalle] = useState<EquipoDetalle | null>(null)

  const [loadingList, setLoadingList] = useState(true)
  const [loadingDetalle, setLoadingDetalle] = useState(false)
  const [errorList, setErrorList] = useState<string | null>(null)
  const [errorDetalle, setErrorDetalle] = useState<string | null>(null)

  const [editingEquipo, setEditingEquipo] = useState<Equipo | null>(null)

  const [availableUsuarios, setAvailableUsuarios] = useState<Usuario[]>([])
  const [loadingAvailable, setLoadingAvailable] = useState(false)
  const [errorAvailable, setErrorAvailable] = useState<string | null>(null)
  const [selectedUsuarioIdToAdd, setSelectedUsuarioIdToAdd] = useState<number | ''>('')
  const [addingMember, setAddingMember] = useState(false)
  const [removingUserId, setRemovingUserId] = useState<number | null>(null)

  useEffect(() => {
    if (!accessToken) return

    async function loadList(token: string) {
      setLoadingList(true)
      setErrorList(null)

      try {
        const [equiposData, delegacionesData] = await Promise.all([
          getEquipos(token),
          getDelegaciones(token),
        ])

        setEquipos(equiposData)
        setDelegaciones(delegacionesData)

        if (equiposData.length > 0) {
          setSelectedEquipoId((prev) => (prev != null ? prev : equiposData[0].id))
        } else {
          setSelectedEquipoId(null)
          setEquipoDetalle(null)
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Error al cargar equipos'
        setErrorList(message)
      } finally {
        setLoadingList(false)
      }
    }

    loadList(accessToken)
  }, [accessToken])

  async function fetchEquipoDetalle(token: string, equipoId: number) {
    setLoadingDetalle(true)
    setErrorDetalle(null)
    setLoadingAvailable(true)
    setErrorAvailable(null)
    setSelectedUsuarioIdToAdd('')

    try {
      const detalle = await getEquipoDetalle(token, equipoId)
      setEquipoDetalle(detalle)

      try {
        const usuariosDeleg = await getUsuarios(token, {
          delegacionId: detalle.delegacion_id,
          activo: true,
        })

        const miembrosIds = new Set(detalle.Miembros.map((m) => m.usuario_id))
        const disponibles = usuariosDeleg.filter((u) => !miembrosIds.has(u.id))

        setAvailableUsuarios(disponibles)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Error al cargar usuarios disponibles'
        setErrorAvailable(message)
        setAvailableUsuarios([])
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al cargar detalle del equipo'
      setErrorDetalle(message)
      setEquipoDetalle(null)
      setAvailableUsuarios([])
    } finally {
      setLoadingDetalle(false)
      setLoadingAvailable(false)
    }
  }

  useEffect(() => {
    if (!accessToken || selectedEquipoId == null) {
      setEquipoDetalle(null)
      setAvailableUsuarios([])
      return
    }

    fetchEquipoDetalle(accessToken, selectedEquipoId)
  }, [accessToken, selectedEquipoId])

  function handleEquipoUpdated(updated: Equipo) {
    setEquipos((prev) => prev.map((e) => (e.id === updated.id ? updated : e)))
    setEquipoDetalle((prev) => (prev && prev.id === updated.id ? { ...prev, ...updated } : prev))
  }

  function getDelegacionNombre(delegacionId: number) {
    const deleg = delegaciones.find((d) => d.id === delegacionId)
    return deleg ? deleg.nombre : `ID ${delegacionId}`
  }

  async function handleAddMiembro(e: React.FormEvent) {
    e.preventDefault()
    if (!accessToken || !equipoDetalle) return

    if (selectedUsuarioIdToAdd === '') {
      setErrorAvailable('Selecciona un usuario para añadir al equipo.')
      return
    }

    setAddingMember(true)
    setErrorAvailable(null)

    try {
      await addMiembroEquipo(accessToken, equipoDetalle.id, selectedUsuarioIdToAdd)

      await fetchEquipoDetalle(accessToken, equipoDetalle.id)
      setSelectedUsuarioIdToAdd('')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al añadir miembro al equipo'
      setErrorAvailable(message)
    } finally {
      setAddingMember(false)
    }
  }

  async function handleRemoveMiembro(usuarioId: number) {
    if (!accessToken || !equipoDetalle) return

    setRemovingUserId(usuarioId)
    setErrorDetalle(null)

    try {
      await removeMiembroEquipo(accessToken, equipoDetalle.id, usuarioId)
      await fetchEquipoDetalle(accessToken, equipoDetalle.id)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al quitar miembro del equipo'
      setErrorDetalle(message)
    } finally {
      setRemovingUserId(null)
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
    <div className="grid gap-4 md:grid-cols-2">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-900 sm:text-base">Equipos</h2>
          {loadingList && <span className="text-xs text-slate-500 sm:text-sm">Cargando…</span>}
        </div>

        {errorList && (
          <div className="mb-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 sm:text-sm">
            {errorList}
          </div>
        )}

        {!loadingList && equipos.length === 0 && !errorList && (
          <p className="text-sm text-slate-500">No hay equipos registrados por el momento.</p>
        )}

        {equipos.length > 0 && (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
                  <th className="px-3 py-2 font-medium">Nombre</th>
                  <th className="px-3 py-2 font-medium">Delegación</th>
                  <th className="px-3 py-2 font-medium text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {equipos.map((equipo) => {
                  const isSelected = equipo.id === selectedEquipoId
                  return (
                    <tr
                      key={equipo.id}
                      className={`cursor-pointer border-b border-slate-100 text-xs text-slate-700 last:border-0 sm:text-sm ${
                        isSelected ? 'bg-blue-50/50' : 'hover:bg-slate-50'
                      }`}
                      onClick={() => setSelectedEquipoId(equipo.id)}
                    >
                      <td className="px-3 py-2">{equipo.nombre_equipo}</td>
                      <td className="px-3 py-2">{getDelegacionNombre(equipo.delegacion_id)}</td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            setEditingEquipo(equipo)
                          }}
                          className="text-xs font-medium text-blue-600 hover:text-blue-700 hover:underline sm:text-sm"
                        >
                          Editar
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-900 sm:text-base">Detalle del equipo</h2>
        </div>

        {selectedEquipoId == null && (
          <p className="text-sm text-slate-500">
            Selecciona un equipo de la lista para ver sus miembros.
          </p>
        )}

        {selectedEquipoId != null && loadingDetalle && (
          <p className="text-sm text-slate-500">Cargando detalle…</p>
        )}

        {errorDetalle && (
          <div className="mb-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 sm:text-sm">
            {errorDetalle}
          </div>
        )}

        {equipoDetalle && !loadingDetalle && (
          <div className="space-y-4">
            <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700 sm:text-sm">
              <p>
                <span className="font-medium">Equipo:</span> {equipoDetalle.nombre_equipo}
              </p>
              <p>
                <span className="font-medium">Delegación:</span>{' '}
                {getDelegacionNombre(equipoDetalle.delegacion_id)}
              </p>
              <p>
                <span className="font-medium">Miembros:</span> {equipoDetalle.Miembros.length}
              </p>
            </div>

            <div>
              <h3 className="mb-2 text-xs font-semibold text-slate-800 sm:text-sm">
                Miembros del equipo
              </h3>

              {equipoDetalle.Miembros.length === 0 ? (
                <p className="text-sm text-slate-500">
                  Este equipo no tiene miembros asignados todavía.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
                        <th className="px-3 py-2 font-medium">Nombre</th>
                        <th className="px-3 py-2 font-medium">Email</th>
                        <th className="px-3 py-2 font-medium">Estado</th>
                        <th className="px-3 py-2 font-medium text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {equipoDetalle.Miembros.map((miembro) => (
                        <tr
                          key={miembro.usuario_id}
                          className="border-b border-slate-100 text-xs text-slate-700 last:border-0 sm:text-sm"
                        >
                          <td className="px-3 py-2">
                            {miembro.Usuario.nombre} {miembro.Usuario.apellidos}
                          </td>
                          <td className="px-3 py-2">{miembro.Usuario.email}</td>
                          <td className="px-3 py-2">
                            <span
                              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium sm:text-xs ${
                                miembro.Usuario.activo
                                  ? 'bg-green-50 text-green-700'
                                  : 'bg-slate-100 text-slate-500'
                              }`}
                            >
                              {miembro.Usuario.activo ? 'Activo' : 'Inactivo'}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right">
                            <button
                              type="button"
                              onClick={() => handleRemoveMiembro(miembro.usuario_id)}
                              className="text-xs font-medium text-red-600 hover:text-red-700 hover:underline sm:text-sm"
                              disabled={removingUserId === miembro.usuario_id}
                            >
                              {removingUserId === miembro.usuario_id ? 'Quitando…' : 'Quitar'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="mt-4 border-t border-slate-200 pt-3">
              <h3 className="mb-2 text-xs font-semibold text-slate-800 sm:text-sm">
                Añadir miembro al equipo
              </h3>

              {errorAvailable && (
                <div className="mb-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 sm:text-sm">
                  {errorAvailable}
                </div>
              )}

              {loadingAvailable ? (
                <p className="text-sm text-slate-500">Cargando usuarios disponibles…</p>
              ) : availableUsuarios.length === 0 ? (
                <p className="text-sm text-slate-500">
                  No hay usuarios activos en la delegación que no estén ya en el equipo.
                </p>
              ) : (
                <form
                  onSubmit={handleAddMiembro}
                  className="flex flex-col gap-2 sm:flex-row sm:items-center"
                >
                  <select
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 sm:max-w-xs"
                    value={selectedUsuarioIdToAdd === '' ? '' : selectedUsuarioIdToAdd}
                    onChange={(e) =>
                      setSelectedUsuarioIdToAdd(e.target.value === '' ? '' : Number(e.target.value))
                    }
                  >
                    <option value="">Selecciona un usuario</option>
                    {availableUsuarios.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.nombre} {u.apellidos} ({u.email})
                      </option>
                    ))}
                  </select>

                  <button
                    type="submit"
                    className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-60 sm:text-sm"
                    disabled={addingMember}
                  >
                    {addingMember ? 'Añadiendo…' : 'Añadir al equipo'}
                  </button>
                </form>
              )}
            </div>
          </div>
        )}
      </section>

      {editingEquipo && accessToken && (
        <EquipoEditModal
          equipo={editingEquipo}
          delegaciones={delegaciones}
          accessToken={accessToken}
          onClose={() => setEditingEquipo(null)}
          onUpdated={handleEquipoUpdated}
        />
      )}
    </div>
  )
}
