import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { ShiftMonth } from '../components/ShiftMonth'
import { getCalendar, type GuardiaDetalle } from '../services/guardiasService'
import { formatCalendarDateRange } from '../utils/date'
import { shiftDay, shiftsOnDay } from '../utils/shiftCalendar'

export function TechnicianCalendarPage() {
  const { accessToken, user } = useAuth()
  const today = shiftDay(new Date().toISOString())
  const [year, setYear] = useState(Number(today.slice(0, 4)))
  const [selected, setSelected] = useState(today)
  const [shifts, setShifts] = useState<GuardiaDetalle[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)
  const details = useRef<HTMLElement>(null)
  useEffect(() => {
    if (!accessToken) return
    let active = true
    ;(async () => {
      setLoading(true); setError(null); setShifts([])
      try {
        const calendar = await getCalendar(accessToken, year)
        if (active) setShifts(calendar)
      } catch (err) { if (active) setError(err instanceof Error ? err.message : 'No se pudo cargar el calendario.') }
      finally { if (active) setLoading(false) }
    })()
    return () => { active = false }
  }, [accessToken, year, revision])
  function moveYear(offset: number) {
    const next = year + offset
    setYear(next); setSelected(`${next}-01-01`)
  }
  const selectedShifts = shiftsOnDay(shifts, selected)
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link to="/tecnico" className="text-sm font-medium text-blue-700">← Volver al panel</Link>
        <div className="flex items-center gap-4">
          <button type="button" disabled={year <= 2000} onClick={() => moveYear(-1)} className="rounded-lg border bg-white px-3 py-2 text-sm disabled:opacity-40">Año anterior</button>
          <span className="font-semibold">{year}</span>
          <button type="button" disabled={year >= 2100} onClick={() => moveYear(1)} className="rounded-lg border bg-white px-3 py-2 text-sm disabled:opacity-40">Año siguiente</button>
        </div>
        <button type="button" disabled={loading} onClick={() => setRevision(n => n + 1)} className="text-sm font-medium text-blue-700 disabled:opacity-40">Actualizar</button>
      </div>
      <div className="flex flex-wrap gap-3 text-xs">
        <span className="rounded-lg bg-red-100 px-3 py-2 text-red-900">P · Mis guardias como principal</span>
        <span className="rounded-lg bg-yellow-100 px-3 py-2 text-yellow-900">S · Mis guardias como secundario</span>
        <span className="rounded-lg bg-blue-50 px-3 py-2 text-blue-900">Guardias de mis compañeros</span>
      </div>
      <p className="text-sm text-slate-600">Selecciona cualquier día para ver quién cubre esa semana en tu delegación. Horario de Madrid.</p>
      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {loading ? <p role="status">Cargando calendario…</p> : <>
        <section ref={details} tabIndex={-1} className="scroll-mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" aria-live="polite">
          <h2 className="mb-3 font-semibold">Guardia del {formatCalendarDateRange(selected, selected).split(' — ')[0]}</h2>
          {selectedShifts.length === 0 && <p className="text-sm text-slate-500">Todavía no hay guardia preparada para este día.</p>}
          {selectedShifts.map(shift => <div key={shift.id} className="mb-3">
            <p className="mb-2 text-sm text-slate-500">{formatCalendarDateRange(shiftDay(shift.fecha_inicio), shiftDay(new Date(new Date(shift.fecha_fin).getTime() - 1).toISOString()))}</p>
            {shift.Asignaciones.length === 0 ? <p className="text-sm text-slate-500">Semana sin técnicos asignados.</p> :
              <ul className="flex flex-wrap gap-3 text-sm">{shift.Asignaciones.map(a => <li key={a.id} className="rounded-lg bg-slate-50 p-3">
                <span className="font-medium">{a.Usuario.nombre} {a.Usuario.apellidos}{a.usuario_id === user?.sub ? ' (tú)' : ''}</span><br />{a.RolGuardia.nombre}
              </li>)}</ul>}
          </div>)}
        </section>
        <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 12 }, (_, month) => <ShiftMonth key={month} year={year} month={month} shifts={shifts} selected={selected} onSelect={day => {
            setSelected(day)
            details.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            details.current?.focus({ preventScroll: true })
          }} userId={user?.sub} compact />)}
        </div>
      </>}
    </div>
  )
}
