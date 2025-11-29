import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import {
  getGuardiasDelegacion,
  getGuardiaDetalle,
  type Guardia,
  type GuardiaDetalle,
  type AsignacionGuardiaConUsuario,
} from '../services/guardiasService'
import { getEquipos, type Equipo } from '../services/equiposService'
import { getPermisosEquipo, type PermisoEquipo } from '../services/permisosService'
import { formatDateLong, formatTime } from '../utils/date'

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
  const [error, setError] = useState<string | null>(null)

  const [guardiasHoyDetalle, setGuardiasHoyDetalle] = useState<GuardiaDetalle[]>([])

  const [equipos, setEquipos] = useState<Equipo[]>([])
  const [equipoSeleccionadoId, setEquipoSeleccionadoId] = useState<number | null>(null)
  const [permisosEquipo, setPermisosEquipo] = useState<PermisoEquipo[]>([])
  const [isLoadingPermisos, setIsLoadingPermisos] = useState(false)
  const [errorPermisos, setErrorPermisos] = useState<string | null>(null)

  useEffect(() => {
    if (!accessToken || !user) return

    ;(async () => {
      setIsLoading(true)
      setError(null)

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
      } catch (err) {
        console.error(err)
        setError(
          err instanceof Error
            ? err.message
            : 'Error al cargar guardias y equipos de tu delegación.',
        )
      } finally {
        setIsLoading(false)
      }
    })()
  }, [accessToken, user, equipoSeleccionadoId])

  useEffect(() => {
    if (!accessToken || !equipoSeleccionadoId) return

    ;(async () => {
      setIsLoadingPermisos(true)
      setErrorPermisos(null)

      try {
        const currentYear = new Date().getFullYear()
        const permisos = await getPermisosEquipo(accessToken, equipoSeleccionadoId, currentYear)
        setPermisosEquipo(permisos)
      } catch (err) {
        console.error(err)
        setErrorPermisos(
          err instanceof Error ? err.message : 'Error al cargar permisos del equipo.',
        )
      } finally {
        setIsLoadingPermisos(false)
      }
    })()
  }, [accessToken, equipoSeleccionadoId])

  const tecnicosDeGuardia: AsignacionGuardiaConUsuario[] = useMemo(() => {
    const asignaciones: AsignacionGuardiaConUsuario[] = []
    for (const g of guardiasHoyDetalle) {
      for (const a of g.Asignaciones) {
        asignaciones.push(a)
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

  if (error) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        {error}
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
          <Link to="/guardias" className="text-xs font-medium text-blue-600 hover:text-blue-700">
            Ver próximas guardias →
          </Link>
        </div>

        {guardiasHoyDetalle.length === 0 || tecnicosDeGuardia.length === 0 ? (
          <p className="text-sm text-slate-500">
            No hay guardias activas en este momento en tu delegación.
          </p>
        ) : (
          <ul className="space-y-2 text-sm">
            {guardiasHoyDetalle.map((g) => (
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

                  <div className="mt-2 flex flex-col gap-1">
                    {g.Asignaciones.map((a) => (
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
                        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                          {a.RolGuardia.codigo}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </li>
            ))}
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

        <div className="mb-2 flex items-center justify-between">
          <Link to="/permisos" className="text-xs font-medium text-blue-600 hover:text-blue-700">
            Ver listado de permisos →
          </Link>
        </div>

        {isLoadingPermisos ? (
          <p className="text-sm text-slate-500">Cargando permisos…</p>
        ) : errorPermisos ? (
          <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{errorPermisos}</div>
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
    </div>
  )
}
