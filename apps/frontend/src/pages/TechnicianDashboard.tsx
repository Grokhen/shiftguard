import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { getMyShifts, type AsignacionGuardia } from '../services/guardiasService'
import {
  getMyPermisos,
  getTiposPermiso,
  crearPermiso,
  type Permiso,
  type TipoPermiso,
} from '../services/permisosService'
import { formatDateLong, formatTime, formatDateRange } from '../utils/date'

export function TechnicianDashboard() {
  const { accessToken } = useAuth()

  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [shifts, setShifts] = useState<AsignacionGuardia[]>([])
  const [permisos, setPermisos] = useState<Permiso[]>([])
  const [tiposPermiso, setTiposPermiso] = useState<TipoPermiso[]>([])

  const [formTipoId, setFormTipoId] = useState<string>('')
  const [formFechaInicio, setFormFechaInicio] = useState<string>('')
  const [formFechaFin, setFormFechaFin] = useState<string>('')
  const [formObservaciones, setFormObservaciones] = useState<string>('')
  const [formError, setFormError] = useState<string | null>(null)
  const [formSuccess, setFormSuccess] = useState<string | null>(null)
  const [isSubmittingPermiso, setIsSubmittingPermiso] = useState(false)

  useEffect(() => {
    if (!accessToken) return

    setIsLoading(true)
    setError(null)
    ;(async () => {
      try {
        const [shiftsRes, permisosRes, tiposRes] = await Promise.all([
          getMyShifts(accessToken),
          getMyPermisos(accessToken),
          getTiposPermiso(accessToken),
        ])

        setShifts(shiftsRes)
        setPermisos(permisosRes)
        setTiposPermiso(tiposRes)

        const tipoVacaciones = tiposRes.find((t) => t.codigo === 'VACACIONES')
        const defaultTipo = tipoVacaciones ?? tiposRes[0]
        if (defaultTipo) {
          setFormTipoId(String(defaultTipo.id))
        }
      } catch (err) {
        console.error(err)
        setError(
          err instanceof Error ? err.message : 'Error al cargar tus datos de guardias y permisos.',
        )
      } finally {
        setIsLoading(false)
      }
    })()
  }, [accessToken])

  const nextShift = useMemo(() => {
    if (!shifts.length) return null

    const now = new Date()

    const futureShifts = shifts.filter((asig) => {
      const start = new Date(asig.Guardia.fecha_inicio)
      return start.getTime() >= now.getTime()
    })

    if (!futureShifts.length) return null

    futureShifts.sort((a, b) => {
      const aStart = new Date(a.Guardia.fecha_inicio).getTime()
      const bStart = new Date(b.Guardia.fecha_inicio).getTime()
      return aStart - bStart
    })

    return futureShifts[0]
  }, [shifts])

  const vacacionesAprobadas = useMemo(
    () =>
      permisos.filter((p) => /*p.Tipo.codigo === 'VACACIONES' &&*/ p.Estado.codigo === 'APROBADO'),
    [permisos],
  )

  const vacacionesPendientes = useMemo(
    () =>
      permisos.filter((p) => /*p.Tipo.codigo === 'VACACIONES' &&*/ p.Estado.codigo === 'PENDIENTE'),
    [permisos],
  )

  async function handleSolicitarPermiso(e: FormEvent) {
    e.preventDefault()
    if (!accessToken) return

    setFormError(null)
    setFormSuccess(null)

    if (!formTipoId || !formFechaInicio || !formFechaFin) {
      setFormError('Rellena tipo, fecha de inicio y fecha de fin.')
      return
    }

    const inicioDate = new Date(formFechaInicio)
    const finDate = new Date(formFechaFin)
    if (finDate.getTime() < inicioDate.getTime()) {
      setFormError('La fecha fin debe ser posterior o igual a la fecha de inicio.')
      return
    }

    setIsSubmittingPermiso(true)

    try {
      const created = await crearPermiso(accessToken, {
        tipo_id: Number(formTipoId),
        fecha_inicio: formFechaInicio,
        fecha_fin: formFechaFin,
        observaciones: formObservaciones || undefined,
      })

      setPermisos((prev) => [created, ...prev])

      setFormSuccess('Permiso solicitado correctamente.')
      setFormFechaInicio('')
      setFormFechaFin('')
      setFormObservaciones('')
    } catch (err) {
      console.error(err)
      setFormError(
        err instanceof Error ? err.message : 'Error al solicitar el permiso. Inténtalo de nuevo.',
      )
    } finally {
      setIsSubmittingPermiso(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="h-4 w-36 rounded bg-slate-100 mb-3" />
          <div className="space-y-2">
            <div className="h-4 w-64 rounded bg-slate-100" />
            <div className="h-4 w-52 rounded bg-slate-100" />
            <div className="h-4 w-40 rounded bg-slate-100" />
          </div>
        </section>
        <section className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="h-4 w-40 rounded bg-slate-100 mb-3" />
            <div className="h-4 w-full rounded bg-slate-100 mb-2" />
            <div className="h-4 w-3/4 rounded bg-slate-100" />
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="h-4 w-48 rounded bg-slate-100 mb-3" />
            <div className="h-4 w-full rounded bg-slate-100 mb-2" />
            <div className="h-4 w-3/4 rounded bg-slate-100" />
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

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-900 sm:text-base">
            Tu siguiente guardia
          </h2>
          {nextShift && (
            <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">
              {nextShift.Guardia.estado}
            </span>
          )}
        </div>

        {nextShift ? (
          <div className="space-y-1 text-sm">
            <p className="font-medium text-slate-900">
              {formatDateLong(nextShift.Guardia.fecha_inicio)}
            </p>
            <p className="text-slate-600">
              {formatTime(nextShift.Guardia.fecha_inicio)} —{' '}
              {formatTime(nextShift.Guardia.fecha_fin)}
            </p>
            <p className="text-slate-500">
              Rol: {nextShift.RolGuardia.nombre} ({nextShift.RolGuardia.codigo})
            </p>
          </div>
        ) : (
          <p className="text-sm text-slate-500">
            No tienes guardias planificadas en las próximas fechas.
          </p>
        )}

        <div className="mt-4">
          <Link
            to="/guardias/mias"
            className="text-sm font-medium text-blue-600 hover:text-blue-700"
          >
            Ver todas mis guardias →
          </Link>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <h3 className="mb-3 text-sm font-semibold text-slate-900 sm:text-base">
            Permisos aprobados
          </h3>
          {vacacionesAprobadas.length === 0 ? (
            <p className="text-sm text-slate-500">No tienes permisos aprobados.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {vacacionesAprobadas.map((v) => (
                <li
                  key={v.id}
                  className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2"
                >
                  <span className="text-slate-700">
                    {formatDateRange(v.fecha_inicio, v.fecha_fin)}
                  </span>
                  <span className="text-xs font-medium text-slate-500">{v.Tipo.nombre}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <h3 className="mb-3 text-sm font-semibold text-slate-900 sm:text-base">
            Permisos pendientes de validación
          </h3>
          {vacacionesPendientes.length === 0 ? (
            <p className="text-sm text-slate-500">No tienes solicitudes de permisos pendientes.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {vacacionesPendientes.map((v) => (
                <li
                  key={v.id}
                  className="flex items-center justify-between rounded-lg bg-amber-50 px-3 py-2"
                >
                  <div>
                    <p className="text-slate-800">{formatDateRange(v.fecha_inicio, v.fecha_fin)}</p>
                    <p className="text-xs text-slate-500">{v.Tipo.nombre}</p>
                  </div>
                  <span className="text-xs font-medium text-amber-700">{v.Estado.nombre}</span>
                </li>
              ))}
            </ul>
          )}

          {/*<div className="mt-3">
            <Link
              to="/permisos/mios"
              className="text-xs font-medium text-blue-600 hover:text-blue-700"
            >
              Ver todos mis permisos →
            </Link>
          </div>*/}
        </div>
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <h3 className="mb-3 text-sm font-semibold text-slate-900 sm:text-base">
          Solicitar nuevo permiso
        </h3>

        {tiposPermiso.length === 0 ? (
          <p className="text-sm text-slate-500">
            No hay tipos de permiso configurados. Contacta con un administrador.
          </p>
        ) : (
          <form
            className="grid gap-3 sm:grid-cols-2 sm:gap-4 text-sm"
            onSubmit={handleSolicitarPermiso}
          >
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Tipo de permiso
              </label>
              <select
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:bg-white focus:ring-1 focus:ring-blue-500"
                value={formTipoId}
                onChange={(e) => setFormTipoId(e.target.value)}
                required
              >
                {tiposPermiso.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nombre} ({t.codigo})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Fecha inicio</label>
              <input
                type="date"
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:bg-white focus:ring-1 focus:ring-blue-500"
                value={formFechaInicio}
                onChange={(e) => setFormFechaInicio(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Fecha fin</label>
              <input
                type="date"
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:bg-white focus:ring-1 focus:ring-blue-500"
                value={formFechaFin}
                onChange={(e) => setFormFechaFin(e.target.value)}
                required
              />
            </div>

            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Observaciones (opcional)
              </label>
              <textarea
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:bg-white focus:ring-1 focus:ring-blue-500"
                rows={3}
                value={formObservaciones}
                onChange={(e) => setFormObservaciones(e.target.value)}
                placeholder="Ej: Vacaciones de verano, cambio de turno, etc."
              />
            </div>

            {formError && (
              <div className="sm:col-span-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
                {formError}
              </div>
            )}

            {formSuccess && (
              <div className="sm:col-span-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                {formSuccess}
              </div>
            )}

            <div className="sm:col-span-2 flex justify-end">
              <button
                type="submit"
                disabled={isSubmittingPermiso}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isSubmittingPermiso ? 'Enviando…' : 'Solicitar permiso'}
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  )
}
