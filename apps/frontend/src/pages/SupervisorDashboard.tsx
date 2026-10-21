import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { subscribeCalendarUpdates } from '../utils/calendarEvents'
import {
  getGuardiasDelegacion,
  getGuardiaDetalle,
  type Guardia,
  type GuardiaDetalle,
} from '../services/guardiasService'
import {
  getEquipos,
  type Equipo,
} from '../services/equiposService'
import {
  getPermisosEquipo,
  getPermisosPendientes,
  getEstadosPermiso,
  decidirPermiso,
  type PermisoEquipo,
  type PermisoConUsuario,
} from '../services/permisosService'
import {
  formatCalendarDateLong,
  formatDateLong,
  formatTime,
  isCalendarDateActive,
  isShiftActive,
} from '../utils/date'

export function SupervisorDashboard() {
  const { accessToken, user } = useAuth()

  const [isLoading, setIsLoading] = useState(true)
  const [errorInit, setErrorInit] = useState<string | null>(null)

  const [guardiasHoyDetalle, setGuardiasHoyDetalle] = useState<GuardiaDetalle[]>([])

  const [equipos, setEquipos] = useState<Equipo[]>([])
  const [equipoSeleccionadoId, setEquipoSeleccionadoId] = useState<number | null>(null)

  const [permisosEquipo, setPermisosEquipo] = useState<PermisoEquipo[]>([])
  const [isLoadingPermisosEquipo, setIsLoadingPermisosEquipo] = useState(false)
  const [errorPermisosEquipo, setErrorPermisosEquipo] = useState<string | null>(null)

  const [estadoAprobadoId, setEstadoAprobadoId] = useState<number | null>(null)
  const [estadoRechazadoId, setEstadoRechazadoId] = useState<number | null>(null)

  const [permisosPendientes, setPermisosPendientes] = useState<PermisoConUsuario[]>([])
  const [isLoadingPendientes, setIsLoadingPendientes] = useState(false)
  const [errorPendientes, setErrorPendientes] = useState<string | null>(null)
  const [permisoEnDecision, setPermisoEnDecision] = useState<number | null>(null)
  const [pendientesRevision, setPendientesRevision] = useState(0)

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible') setPendientesRevision(n => n + 1)
    }
    const unsubscribe = subscribeCalendarUpdates(refresh)
    // Also reflect changes made in a different browser/session.
    const timer = window.setInterval(refresh, 30_000)
    return () => { unsubscribe(); window.clearInterval(timer) }
  }, [])

  useEffect(() => {
    if (!accessToken || !user) return
    ;(async () => {
      setIsLoading(true)
      setErrorInit(null)

      try {
        const guardiasDelegacion: Guardia[] = await getGuardiasDelegacion(accessToken, user.deleg)

        const guardiasActivasAhora = guardiasDelegacion.filter((g) =>
          isShiftActive(g.fecha_inicio, g.fecha_fin),
        )

        const detalles = await Promise.all(
          guardiasActivasAhora.map((g) => getGuardiaDetalle(accessToken, g.id)),
        )
        setGuardiasHoyDetalle(detalles)

        const equiposRes = await getEquipos(accessToken)
        setEquipos(equiposRes)

        if (equiposRes.length > 0 && equipoSeleccionadoId === null) {
          setEquipoSeleccionadoId(equiposRes[0].id)
        }

        const estados = await getEstadosPermiso(accessToken)
        const aprobado = estados.find((e) => e.codigo === 'APROBADO')
        const rechazado = estados.find((e) => e.codigo === 'RECHAZADO')

        if (aprobado) setEstadoAprobadoId(aprobado.id)
        if (rechazado) setEstadoRechazadoId(rechazado.id)
      } catch (err) {
        console.error(err)
        setErrorInit(
          err instanceof Error
            ? err.message
            : 'Error al cargar datos iniciales del panel de supervisor.',
        )
      } finally {
        setIsLoading(false)
      }
    })()
  }, [accessToken, user, equipoSeleccionadoId])

  useEffect(() => {
    if (!accessToken || !equipoSeleccionadoId) return
    ;(async () => {
      setIsLoadingPermisosEquipo(true)
      setErrorPermisosEquipo(null)

      try {
        const currentYear = new Date().getFullYear()
        const permisos = await getPermisosEquipo(accessToken, equipoSeleccionadoId, currentYear)
        setPermisosEquipo(permisos)
      } catch (err) {
        console.error(err)
        setErrorPermisosEquipo(
          err instanceof Error ? err.message : 'Error al cargar permisos del equipo.',
        )
      } finally {
        setIsLoadingPermisosEquipo(false)
      }
    })()
  }, [accessToken, equipoSeleccionadoId])

  useEffect(() => {
    if (!accessToken) return
    let active = true
    ;(async () => {
      setIsLoadingPendientes(true)
      setErrorPendientes(null)

      try {
        const pendientes = await getPermisosPendientes(accessToken)
        if (active) setPermisosPendientes(pendientes)
      } catch (err) {
        if (!active) return
        setErrorPendientes(
          err instanceof Error
            ? err.message
            : 'Error al cargar permisos pendientes de tu delegación.',
        )
      } finally {
        if (active) setIsLoadingPendientes(false)
      }
    })()
    return () => {
      active = false
    }
  }, [accessToken, pendientesRevision])

  const tecnicosDeGuardia = useMemo(() => {
    const asignaciones: {
      guardiaId: number
      usuarioNombre: string
      usuarioApellidos: string
      usuarioEmail: string
      rolCodigo: string
      guardia: GuardiaDetalle
    }[] = []

    for (const g of guardiasHoyDetalle) {
      for (const a of g.Asignaciones) {
        asignaciones.push({
          guardiaId: g.id,
          usuarioNombre: a.Usuario.nombre,
          usuarioApellidos: a.Usuario.apellidos,
          usuarioEmail: a.Usuario.email,
          rolCodigo: a.RolGuardia.codigo,
          guardia: g,
        })
      }
    }
    return asignaciones
  }, [guardiasHoyDetalle])

  const permisosActivosHoy = useMemo(() => {
    return permisosEquipo.filter((p) => {
      const activoEnFecha = isCalendarDateActive(p.fecha_inicio, p.fecha_fin)
      const estadoValido = ['APROBADO', 'PENDIENTE'].includes(p.Estado.codigo)
      return activoEnFecha && estadoValido
    })
  }, [permisosEquipo])

  async function handleDecidirPermiso(permiso: PermisoConUsuario, accion: 'APROBAR' | 'RECHAZAR') {
    if (!accessToken || permisoEnDecision !== null) return
    if (!estadoAprobadoId || !estadoRechazadoId) {
      alert(
        'No se han cargado correctamente los estados de permiso. Contacta con un administrador.',
      )
      return
    }

    const estadoId = accion === 'APROBAR' ? estadoAprobadoId : estadoRechazadoId

    let observaciones: string | undefined
    if (accion === 'RECHAZAR') {
      const motivo = window.prompt('Motivo del rechazo (obligatorio):') ?? ''
      if (!motivo.trim()) {
        return
      }
      observaciones = motivo.trim()
    }

    setPermisoEnDecision(permiso.id)

    try {
      const actualizado = await decidirPermiso(accessToken, permiso.id, {
        estado_id: estadoId,
        observaciones,
      })

      setPermisosPendientes((prev) => prev.filter((p) => p.id !== permiso.id))

      setPermisosEquipo((prev) =>
        prev.map((p) =>
          p.id === permiso.id
            ? {
                ...p,
                Estado: actualizado.Estado,
                observaciones: actualizado.observaciones,
              }
            : p,
        ),
      )
    } catch (err) {
      console.error(err)
      alert(
        err instanceof Error ? err.message : 'Error al actualizar el permiso. Inténtalo de nuevo.',
      )
    } finally {
      setPermisoEnDecision(null)
      // Reconcile the inbox after both successful decisions and conflicts with another reviewer.
      setPendientesRevision((revision) => revision + 1)
    }
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="h-4 w-48 rounded bg-slate-100 mb-3" />
          <div className="space-y-2">
            <div className="h-4 w-64 rounded bg-slate-100" />
            <div className="h-4 w-52 rounded bg-slate-100" />
          </div>
        </section>
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="h-4 w-56 rounded bg-slate-100 mb-3" />
          <div className="space-y-2">
            <div className="h-4 w-64 rounded bg-slate-100" />
            <div className="h-4 w-52 rounded bg-slate-100" />
          </div>
        </section>
      </div>
    )
  }

  if (errorInit) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        {errorInit}
      </div>
    )
  }

  const equipoSeleccionado = equipos.find((e) => e.id === equipoSeleccionadoId)

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-900 sm:text-base">
            Técnicos de guardia ahora
          </h2>
          {/*<Link
            to="/guardias"
            className="text-xs font-medium text-blue-600 hover:text-blue-700"
          >
            Ver próximas guardias →
          </Link>*/}
        </div>

        {guardiasHoyDetalle.length === 0 || tecnicosDeGuardia.length === 0 ? (
          <p className="text-sm text-slate-500">
            No hay guardias activas en este momento en tu delegación.
          </p>
        ) : (
          <ul className="space-y-2 text-sm">
            {guardiasHoyDetalle.map((g) => {
              const principal = g.Asignaciones.find((a) => a.RolGuardia.codigo === 'PRINCIPAL')

              const secundarios = g.Asignaciones.filter(
                (a) => a.id !== principal?.id && a.RolGuardia.codigo === 'SECUNDARIO',
              )

              return (
                <li key={g.id} className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                  <div className="flex flex-col gap-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                        Guardia #{g.id} · {g.Delegacion.nombre}
                      </span>
                      <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                        {g.estado}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500">
                      {formatDateLong(g.fecha_inicio)} · {formatTime(g.fecha_inicio)} –{' '}
                      {formatTime(g.fecha_fin)}
                    </p>

                    <div className="mt-2 flex flex-col gap-2">
                      {principal && (
                        <div className="flex items-center justify-between rounded-lg bg-white px-3 py-1.5">
                          <div>
                            <p className="text-sm font-medium text-slate-900">
                              {principal.Usuario.nombre} {principal.Usuario.apellidos}
                            </p>
                            <p className="text-xs text-slate-500">{principal.Usuario.email}</p>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            <span className="rounded-full bg-blue-600 px-2 py-0.5 text-xs font-medium text-white">
                              Principal
                            </span>
                          </div>
                        </div>
                      )}

                      {secundarios.length > 0 && (
                        <div className="flex flex-col gap-1">
                          {secundarios.map((a) => (
                            <div
                              key={a.id}
                              className="flex items-center justify-between rounded-lg bg-white px-3 py-1.5"
                            >
                              <div>
                                <p className="text-sm text-slate-800">
                                  {a.Usuario.nombre} {a.Usuario.apellidos}
                                </p>
                                <p className="text-xs text-slate-500">{a.Usuario.email}</p>
                              </div>
                              <div className="flex flex-col items-end gap-1">
                                <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-800">
                                  Secundario
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 sm:text-base">
              Permisos y vacaciones activos hoy
            </h2>
            {equipoSeleccionado && (
              <p className="text-xs text-slate-500">Equipo: {equipoSeleccionado.nombre_equipo}</p>
            )}
          </div>

          {equipos.length > 1 && (
            <select
              className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-700 outline-none focus:border-blue-500 focus:bg-white focus:ring-1 focus:ring-blue-500"
              value={equipoSeleccionadoId ?? ''}
              onChange={(e) =>
                setEquipoSeleccionadoId(e.target.value ? Number(e.target.value) : null)
              }
            >
              {equipos.map((eq) => (
                <option key={eq.id} value={eq.id}>
                  {eq.nombre_equipo}
                </option>
              ))}
            </select>
          )}
        </div>

        {/*<div className="mb-2 flex items-center justify-between">
          <Link
            to="/permisos"
            className="text-xs font-medium text-blue-600 hover:text-blue-700"
          >
            Ver listado de permisos →
          </Link>
        </div>*/}

        {isLoadingPermisosEquipo ? (
          <p className="text-sm text-slate-500">Cargando permisos…</p>
        ) : errorPermisosEquipo ? (
          <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
            {errorPermisosEquipo}
          </div>
        ) : permisosActivosHoy.length === 0 ? (
          <p className="text-sm text-slate-500">
            Hoy no hay miembros del equipo con vacaciones ni otros permisos activos.
          </p>
        ) : (
          <ul className="mt-2 space-y-2 text-sm">
            {permisosActivosHoy.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2"
              >
                <div>
                  <p className="font-medium text-slate-800">
                    {p.Usuario.nombre} {p.Usuario.apellidos}
                  </p>
                  <p className="text-xs text-slate-500">
                    {p.Tipo.nombre} · {formatCalendarDateLong(p.fecha_inicio)} –{' '}
                    {formatCalendarDateLong(p.fecha_fin)}
                  </p>
                </div>
                <span
                  className={
                    'rounded-full px-2 py-0.5 text-xs font-medium ' +
                    (p.Estado.codigo === 'APROBADO'
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'bg-amber-50 text-amber-700')
                  }
                >
                  {p.Estado.nombre}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-900 sm:text-base">
            Permisos pendientes de aprobación
          </h2>
          <button
            type="button"
            disabled={isLoadingPendientes || permisoEnDecision !== null}
            onClick={() => setPendientesRevision((revision) => revision + 1)}
            className="text-xs font-medium text-blue-600 hover:text-blue-700 disabled:opacity-50"
          >
            Actualizar
          </button>
        </div>

        <p className="mb-3 text-xs text-slate-500">
          Solicitudes de toda tu delegación, de cualquier año.
        </p>

        {isLoadingPendientes && permisosPendientes.length === 0 ? (
          <p className="text-sm text-slate-500">Cargando permisos pendientes…</p>
        ) : errorPendientes ? (
          <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
            {errorPendientes}
          </div>
        ) : permisosPendientes.length === 0 ? (
          <p className="text-sm text-slate-500">
            No hay solicitudes de permiso pendientes en tu delegación.
          </p>
        ) : (
          <ul className="space-y-2 text-sm">
            {permisosPendientes.map((p) => (
              <li
                key={p.id}
                className={`flex flex-col gap-2 rounded-lg px-3 py-2 sm:flex-row sm:items-center sm:justify-between ${p.conflictos_guardias?.length ? 'border border-orange-300 bg-orange-50' : 'bg-slate-50'}`}
              >
                <div>
                  <p className="font-medium text-slate-800">
                    {p.Usuario.nombre} {p.Usuario.apellidos}
                  </p>
                  <p className="text-xs text-slate-500">
                    {p.Tipo.nombre} · {formatCalendarDateLong(p.fecha_inicio)} –{' '}
                    {formatCalendarDateLong(p.fecha_fin)}
                  </p>
                  <p className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-700">
                    <span className="font-medium">Observaciones: </span>
                    {p.observaciones?.trim() || 'Sin observaciones.'}
                  </p>
                  {!!p.conflictos_guardias?.length && <div className="mt-2 text-sm text-orange-950">
                    <p className="font-semibold">Conflicto con guardias · {p.conflictos_guardias.length} {p.conflictos_guardias.length === 1 ? 'guardia' : 'guardias'}</p>
                    <p>{p.sustituto_nombre ? `Sustituto propuesto: ${p.sustituto_nombre}` : 'Sin sustituto propuesto. Necesita buscar cobertura.'}</p>
                    <Link to="/supervisor/guardias" className="mt-1 inline-block font-medium underline">Revisar calendario de guardias</Link>
                  </div>}
                  {!p.conflictos_guardias?.length && p.sustituto_nombre && <p className="mt-2 text-sm text-slate-600">Sustituto propuesto: {p.sustituto_nombre} · Sin coincidencias actuales con guardias.</p>}
                </div>
                <div className="flex gap-2 text-xs">
                  <button
                    type="button"
                    disabled={permisoEnDecision !== null}
                    onClick={() => handleDecidirPermiso(p, 'APROBAR')}
                    className="rounded-lg bg-emerald-600 px-3 py-1 font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {permisoEnDecision === p.id ? '...' : 'Aceptar'}
                  </button>
                  <button
                    type="button"
                    disabled={permisoEnDecision !== null}
                    onClick={() => handleDecidirPermiso(p, 'RECHAZAR')}
                    className="rounded-lg bg-red-600 px-3 py-1 font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {permisoEnDecision === p.id ? '...' : 'Rechazar'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <h2 className="mb-2 text-base font-semibold text-slate-900">Calendario de guardias</h2>
        <p className="mb-4 text-sm text-slate-500">Consulta las semanas de tu delegación y añade o modifica los técnicos asignados.</p>
        <div className="flex flex-wrap gap-3">
          <Link to="/supervisor/guardias" className="inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">Ver calendario de guardias</Link>
          <Link to="/supervisor/guardias/planificar" className="inline-block rounded-lg border border-blue-200 bg-white px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50">Planificar calendario de guardias anual</Link>
        </div>
      </section>
    </div>
  )
}
