import { useEffect, useMemo, useState, type FormEvent } from 'react'
//import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import {
  getGuardiasDelegacion,
  getGuardiaDetalle,
  crearGuardia,
  actualizarGuardia,
  type Guardia,
  type GuardiaDetalle,
} from '../services/guardiasService'
import {
  getEquipos,
  getEquipoDetalle,
  type Equipo,
  type UsuarioBasico,
} from '../services/equiposService'
import {
  getPermisosEquipo,
  getEstadosPermiso,
  decidirPermiso,
  type PermisoEquipo,
} from '../services/permisosService'
import { formatDateLong, formatTime } from '../utils/date'

const ROL_GUARDIA_PRINCIPAL_ID = 1
const ROL_GUARDIA_SECUNDARIO_ID = 2

function isNowBetween(startIso: string, endIso: string): boolean {
  const now = new Date()
  const start = new Date(startIso)
  const end = new Date(endIso)
  return start.getTime() <= now.getTime() && now.getTime() <= end.getTime()
}

function isTodayBetween(startIso: string, endIso: string): boolean {
  const today = new Date()
  const start = new Date(startIso)
  const end = new Date(endIso)

  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const s = new Date(start.getFullYear(), start.getMonth(), start.getDate())
  const e = new Date(end.getFullYear(), end.getMonth(), end.getDate())

  return s.getTime() <= t.getTime() && t.getTime() <= e.getTime()
}

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

  const [permisosPendientes, setPermisosPendientes] = useState<PermisoEquipo[]>([])
  const [isLoadingPendientes, setIsLoadingPendientes] = useState(false)
  const [errorPendientes, setErrorPendientes] = useState<string | null>(null)
  const [permisoEnDecision, setPermisoEnDecision] = useState<number | null>(null)

  const [tecnicosDisponibles, setTecnicosDisponibles] = useState<UsuarioBasico[]>([])
  const [errorTecnicos, setErrorTecnicos] = useState<string | null>(null)

  const [guardiaFechaInicio, setGuardiaFechaInicio] = useState('')
  const [guardiaFechaFin, setGuardiaFechaFin] = useState('')
  const [guardiaEstado, setGuardiaEstado] = useState('PLANIFICADA')
  const [guardiaTecnicoId, setGuardiaTecnicoId] = useState('')
  const [guardiaTecnicoSecId, setGuardiaTecnicoSecId] = useState('')
  const [errorGuardiaForm, setErrorGuardiaForm] = useState<string | null>(null)
  const [successGuardiaForm, setSuccessGuardiaForm] = useState<string | null>(null)
  const [isSubmittingGuardia, setIsSubmittingGuardia] = useState(false)

  useEffect(() => {
    if (!accessToken || !user) return
    ;(async () => {
      setIsLoading(true)
      setErrorInit(null)

      try {
        const guardiasDelegacion: Guardia[] = await getGuardiasDelegacion(accessToken, user.deleg)

        const guardiasActivasAhora = guardiasDelegacion.filter((g) =>
          isNowBetween(g.fecha_inicio, g.fecha_fin),
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
    if (!accessToken || equipos.length === 0) return
    ;(async () => {
      setIsLoadingPendientes(true)
      setErrorPendientes(null)

      try {
        const currentYear = new Date().getFullYear()

        const allArrays = await Promise.all(
          equipos.map((eq) => getPermisosEquipo(accessToken, eq.id, currentYear)),
        )

        const allPermisos = allArrays.flat()
        const pendientes = allPermisos.filter((p) => p.Estado.codigo === 'PENDIENTE')

        setPermisosPendientes(pendientes)
      } catch (err) {
        console.error(err)
        setErrorPendientes(
          err instanceof Error
            ? err.message
            : 'Error al cargar permisos pendientes de tus equipos.',
        )
      } finally {
        setIsLoadingPendientes(false)
      }
    })()
  }, [accessToken, equipos])

  useEffect(() => {
    if (!accessToken || !equipoSeleccionadoId) {
      setTecnicosDisponibles([])
      return
    }

    ;(async () => {
      setErrorTecnicos(null)
      try {
        const equipoDetalle = await getEquipoDetalle(accessToken, equipoSeleccionadoId)
        const usuarios = equipoDetalle.Miembros.map((m) => m.Usuario)
        setTecnicosDisponibles(usuarios)
      } catch (err) {
        console.error(err)
        setErrorTecnicos(
          err instanceof Error ? err.message : 'Error al cargar técnicos del equipo.',
        )
        setTecnicosDisponibles([])
      }
    })()
  }, [accessToken, equipoSeleccionadoId])

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
      const activoEnFecha = isTodayBetween(p.fecha_inicio, p.fecha_fin)
      const estadoValido = ['APROBADO', 'PENDIENTE'].includes(p.Estado.codigo)
      return activoEnFecha && estadoValido
    })
  }, [permisosEquipo])

  async function handleDecidirPermiso(permiso: PermisoEquipo, accion: 'APROBAR' | 'RECHAZAR') {
    if (!accessToken) return
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
    }
  }

  async function handleCrearGuardia(e: FormEvent) {
    e.preventDefault()
    if (!accessToken) return

    setErrorGuardiaForm(null)
    setSuccessGuardiaForm(null)

    if (!guardiaFechaInicio || !guardiaFechaFin || !guardiaTecnicoId) {
      setErrorGuardiaForm('Selecciona fechas de inicio/fin y un técnico asignado.')
      return
    }

    if (guardiaTecnicoSecId && guardiaTecnicoSecId === guardiaTecnicoId) {
      setErrorGuardiaForm('No puedes asignar el mismo técnico como principal y secundario.')
      return
    }

    const ini = new Date(guardiaFechaInicio)
    const fin = new Date(guardiaFechaFin)

    if (fin.getTime() <= ini.getTime()) {
      setErrorGuardiaForm('La fecha y hora de fin deben ser posteriores a la de inicio.')
      return
    }

    setIsSubmittingGuardia(true)

    try {
      const creada = await crearGuardia(accessToken, {
        fecha_inicio: ini.toISOString(),
        fecha_fin: fin.toISOString(),
        estado: guardiaEstado || undefined,
      })

      const asignaciones = [
        {
          usuario_id: Number(guardiaTecnicoId),
          rol_guardia_id: ROL_GUARDIA_PRINCIPAL_ID,
        },
      ]

      if (guardiaTecnicoSecId) {
        asignaciones.push({
          usuario_id: Number(guardiaTecnicoSecId),
          rol_guardia_id: ROL_GUARDIA_SECUNDARIO_ID,
        })
      }
      await actualizarGuardia(accessToken, creada.id, {
        asignaciones,
      })

      setSuccessGuardiaForm('Guardia creada y asignada correctamente.')
      setGuardiaFechaInicio('')
      setGuardiaFechaFin('')
      setGuardiaTecnicoId('')
      setGuardiaTecnicoSecId('')
    } catch (err) {
      console.error(err)
      setErrorGuardiaForm(
        err instanceof Error ? err.message : 'Error al crear la guardia. Revisa los datos.',
      )
    } finally {
      setIsSubmittingGuardia(false)
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
              const principal = g.Asignaciones.find(
                (a) =>
                  a.RolGuardia.id === ROL_GUARDIA_PRINCIPAL_ID ||
                  a.RolGuardia.codigo === 'PRINCIPAL',
              )

              const secundarios = g.Asignaciones.filter(
                (a) =>
                  a.id !== principal?.id &&
                  (a.RolGuardia.id === ROL_GUARDIA_SECUNDARIO_ID ||
                    a.RolGuardia.codigo === 'SECUNDARIO'),
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
                    {p.Tipo.nombre} · {formatDateLong(p.fecha_inicio)} –{' '}
                    {formatDateLong(p.fecha_fin)}
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
          {/*<Link
            to="/permisos"
            className="text-xs font-medium text-blue-600 hover:text-blue-700"
          >
            Ver todos los permisos →
          </Link>*/}
        </div>

        {isLoadingPendientes ? (
          <p className="text-sm text-slate-500">Cargando permisos pendientes…</p>
        ) : errorPendientes ? (
          <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
            {errorPendientes}
          </div>
        ) : permisosPendientes.length === 0 ? (
          <p className="text-sm text-slate-500">
            No hay solicitudes de permiso pendientes de tus equipos.
          </p>
        ) : (
          <ul className="space-y-2 text-sm">
            {permisosPendientes.map((p) => (
              <li
                key={p.id}
                className="flex flex-col gap-2 rounded-lg bg-slate-50 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-medium text-slate-800">
                    {p.Usuario.nombre} {p.Usuario.apellidos}
                  </p>
                  <p className="text-xs text-slate-500">
                    {p.Tipo.nombre} · {formatDateLong(p.fecha_inicio)} –{' '}
                    {formatDateLong(p.fecha_fin)}
                  </p>
                </div>
                <div className="flex gap-2 text-xs">
                  <button
                    type="button"
                    disabled={permisoEnDecision === p.id}
                    onClick={() => handleDecidirPermiso(p, 'APROBAR')}
                    className="rounded-lg bg-emerald-600 px-3 py-1 font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {permisoEnDecision === p.id ? '...' : 'Aceptar'}
                  </button>
                  <button
                    type="button"
                    disabled={permisoEnDecision === p.id}
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
        <h2 className="mb-3 text-sm font-semibold text-slate-900 sm:text-base">
          Crear nueva guardia
        </h2>

        {errorTecnicos && (
          <div className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
            {errorTecnicos}
          </div>
        )}

        {equipos.length === 0 ? (
          <p className="text-sm text-slate-500">
            No tienes equipos asignados. Contacta con un administrador.
          </p>
        ) : (
          <form
            className="grid gap-3 sm:grid-cols-2 sm:gap-4 text-sm"
            onSubmit={handleCrearGuardia}
          >
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Equipo</label>
              <select
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:bg-white focus:ring-1 focus:ring-blue-500"
                value={equipoSeleccionadoId ?? ''}
                onChange={(e) =>
                  setEquipoSeleccionadoId(e.target.value ? Number(e.target.value) : null)
                }
                required
              >
                {equipos.map((eq) => (
                  <option key={eq.id} value={eq.id}>
                    {eq.nombre_equipo}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Estado inicial
              </label>
              <select
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:bg-white focus:ring-1 focus:ring-blue-500"
                value={guardiaEstado}
                onChange={(e) => setGuardiaEstado(e.target.value)}
              >
                <option value="PLANIFICADA">Planificada</option>
                <option value="PUBLICADA">Publicada</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Fecha y hora de inicio
              </label>
              <input
                type="datetime-local"
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:bg-white focus:ring-1 focus:ring-blue-500"
                value={guardiaFechaInicio}
                onChange={(e) => setGuardiaFechaInicio(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Fecha y hora de fin
              </label>
              <input
                type="datetime-local"
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:bg-white focus:ring-1 focus:ring-blue-500"
                value={guardiaFechaFin}
                onChange={(e) => setGuardiaFechaFin(e.target.value)}
                required
              />
            </div>

            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Técnico asignado (rol PRINCIPAL)
              </label>
              <select
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:bg-white focus:ring-1 focus:ring-blue-500"
                value={guardiaTecnicoId}
                onChange={(e) => setGuardiaTecnicoId(e.target.value)}
                required
                disabled={tecnicosDisponibles.length === 0}
              >
                <option value="">
                  {tecnicosDisponibles.length === 0
                    ? 'No hay técnicos en este equipo'
                    : 'Selecciona un técnico'}
                </option>
                {tecnicosDisponibles.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nombre} {t.apellidos} ({t.email})
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Técnico con rol SECUNDARIO (opcional)
              </label>
              <select
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:bg-white focus:ring-1 focus:ring-blue-500"
                value={guardiaTecnicoSecId}
                onChange={(e) => setGuardiaTecnicoSecId(e.target.value)}
                disabled={tecnicosDisponibles.length === 0}
              >
                <option value="">
                  {tecnicosDisponibles.length === 0
                    ? 'No hay técnicos en este equipo'
                    : 'Sin técnico secundario'}
                </option>
                {tecnicosDisponibles.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nombre} {t.apellidos} ({t.email})
                  </option>
                ))}
              </select>
            </div>

            {errorGuardiaForm && (
              <div className="sm:col-span-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
                {errorGuardiaForm}
              </div>
            )}

            {successGuardiaForm && (
              <div className="sm:col-span-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                {successGuardiaForm}
              </div>
            )}

            <div className="sm:col-span-2 flex justify-end">
              <button
                type="submit"
                disabled={isSubmittingGuardia}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isSubmittingGuardia ? 'Creando…' : 'Crear guardia'}
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  )
}
