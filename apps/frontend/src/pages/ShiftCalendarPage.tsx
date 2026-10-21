import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { ShiftMonth } from '../components/ShiftMonth'
import { actualizarGuardia, getCalendar, getCalendarTechnicians, getRolesGuardia, prepareCalendar,
  type GuardiaDetalle, type RolGuardia, type UsuarioGuardia } from '../services/guardiasService'
import { formatCalendarDateRange } from '../utils/date'
import { monthNames, shiftDay, shiftsOnDay } from '../utils/shiftCalendar'

export function ShiftCalendarPage() {
  const { accessToken } = useAuth()
  const today = shiftDay(new Date().toISOString())
  const [year, setYear] = useState(Number(today.slice(0, 4)))
  const [month, setMonth] = useState(Number(today.slice(5, 7)) - 1)
  const [selected, setSelected] = useState(today)
  const [shifts, setShifts] = useState<GuardiaDetalle[]>([])
  const [technicians, setTechnicians] = useState<UsuarioGuardia[]>([])
  const [roles, setRoles] = useState<RolGuardia[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const [editing, setEditing] = useState<number | null>(null)
  const [primary, setPrimary] = useState('')
  const [secondary, setSecondary] = useState('')
  const [saving, setSaving] = useState(false)
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    if (!accessToken) return
    let active = true
    ;(async () => {
      setLoading(true)
      setError(null)
      setShifts([])
      try {
        const prepared = await prepareCalendar(accessToken, year)
        const [calendar, users, catalog] = await Promise.all([
          getCalendar(accessToken, year), getCalendarTechnicians(accessToken), getRolesGuardia(accessToken),
        ])
        if (!active) return
        setShifts(calendar); setTechnicians(users); setRoles(catalog)
        setNotice(prepared.guardias_previas ? 'Se conservan guardias anteriores con otras fechas. Las semanas que ocupan no se han reemplazado.' : '')
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'No se pudo cargar el calendario.')
      } finally { if (active) setLoading(false) }
    })()
    return () => { active = false }
  }, [accessToken, year, revision])

  function moveMonth(offset: number) {
    const date = new Date(Date.UTC(year, month + offset, 1))
    setYear(date.getUTCFullYear()); setMonth(date.getUTCMonth()); setSelected(date.toISOString().slice(0, 10))
    setEditing(null); setError(null)
  }
  function edit(shift: GuardiaDetalle) {
    setEditing(shift.id)
    setPrimary(String(shift.Asignaciones.find(a => a.RolGuardia.codigo === 'PRINCIPAL')?.usuario_id ?? ''))
    setSecondary(String(shift.Asignaciones.find(a => a.RolGuardia.codigo === 'SECUNDARIO')?.usuario_id ?? ''))
    setError(null)
  }
  async function save(shift: GuardiaDetalle) {
    if (!accessToken || saving) return
    if (primary && primary === secondary) { setError('El principal y el secundario deben ser técnicos distintos.'); return }
    const principalRole = roles.find(r => r.codigo === 'PRINCIPAL')
    const secondaryRole = roles.find(r => r.codigo === 'SECUNDARIO')
    if (!principalRole || !secondaryRole) { setError('Faltan los roles de guardia. Contacta con administración.'); return }
    setSaving(true); setError(null)
    try {
      const assignments = shift.Asignaciones.filter(a => !['PRINCIPAL', 'SECUNDARIO'].includes(a.RolGuardia.codigo))
        .map(a => ({ usuario_id: a.usuario_id, rol_guardia_id: a.rol_guardia_id }))
      if (primary) assignments.push({ usuario_id: Number(primary), rol_guardia_id: principalRole.id })
      if (secondary) assignments.push({ usuario_id: Number(secondary), rol_guardia_id: secondaryRole.id })
      const updated = await actualizarGuardia(accessToken, shift.id, { asignaciones: assignments })
      setShifts(prev => prev.map(s => s.id === shift.id ? updated : s)); setEditing(null)
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudieron guardar los técnicos.') }
    finally { setSaving(false) }
  }
  const selectedShifts = shiftsOnDay(shifts, selected)
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link to="/supervisor" className="text-sm font-medium text-blue-700">← Volver al panel</Link>
        <div className="flex items-center gap-3">
          <button type="button" disabled={saving || (year === 2000 && month === 0)} onClick={() => moveMonth(-1)} className="rounded-lg border bg-white px-3 py-2 text-sm disabled:opacity-40">Mes anterior</button>
          <span className="text-sm font-semibold">{monthNames[month]} {year}</span>
          <button type="button" disabled={saving || (year === 2100 && month === 11)} onClick={() => moveMonth(1)} className="rounded-lg border bg-white px-3 py-2 text-sm disabled:opacity-40">Mes siguiente</button>
        </div>
        <button type="button" disabled={loading || saving} onClick={() => { setEditing(null); setRevision(n => n + 1) }} className="text-sm font-medium text-blue-700 disabled:opacity-40">Actualizar</button>
      </div>
      <p className="text-sm text-slate-600">Semanas de lunes a domingo · horario de Madrid. Selecciona un día para consultar o modificar los técnicos de esa guardia.</p>
      {notice && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{notice}</p>}
      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {loading ? <p role="status">Preparando calendario…</p> : <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <ShiftMonth year={year} month={month} shifts={shifts} selected={selected} onSelect={day => { if (!saving) { setSelected(day); setEditing(null); setError(null) } }} />
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" aria-live="polite">
          <h2 className="mb-3 font-semibold">Guardia del {formatCalendarDateRange(selected, selected).split(' — ')[0]}</h2>
          {selectedShifts.length === 0 && <p className="text-sm text-slate-500">No hay guardia para este día.</p>}
          {selectedShifts.map(shift => <div key={shift.id} className="mb-4 space-y-3">
            <p className="text-sm text-slate-600">{formatCalendarDateRange(shiftDay(shift.fecha_inicio), shiftDay(new Date(new Date(shift.fecha_fin).getTime() - 1).toISOString()))}</p>
            {shift.Asignaciones.length === 0 && <p className="text-sm text-slate-500">Guardia vacía. Añade los técnicos.</p>}
            <ul className="space-y-2 text-sm">{shift.Asignaciones.map(a => <li key={a.id} className="rounded-lg bg-slate-50 p-2">
              <span className="font-medium">{a.Usuario.nombre} {a.Usuario.apellidos}</span><br /><span className="text-slate-500">{a.RolGuardia.nombre}</span>
            </li>)}</ul>
            {editing !== shift.id ? <button type="button" disabled={saving} onClick={() => edit(shift)} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white">Modificar técnicos</button> : <form onSubmit={event => { event.preventDefault(); void save(shift) }} className="space-y-3">
              {([{ label: 'Principal', value: primary, change: setPrimary }, { label: 'Secundario', value: secondary, change: setSecondary }]).map(field => <label key={field.label} className="block text-sm font-medium">
                {field.label}<select aria-label={field.label} value={field.value} disabled={saving} onChange={e => field.change(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2">
                  <option value="">Sin asignar</option>
                  {field.value && !technicians.some(t => t.id === Number(field.value)) && <option value={field.value}>Asignación anterior (retirar o sustituir)</option>}
                  {technicians.map(t => <option key={t.id} value={t.id}>{t.nombre} {t.apellidos} ({t.email})</option>)}
                </select>
              </label>)}
              <div className="flex gap-2"><button disabled={saving} type="submit" className="rounded-lg bg-blue-600 px-3 py-2 text-sm text-white disabled:opacity-50">{saving ? 'Guardando…' : 'Guardar técnicos'}</button><button type="button" disabled={saving} onClick={() => setEditing(null)} className="rounded-lg border px-3 py-2 text-sm">Cancelar</button></div>
            </form>}
          </div>)}
        </section>
      </div>}
    </div>
  )
}
