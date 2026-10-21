import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { ShiftMonth } from '../components/ShiftMonth'
import { actualizarGuardia, getCalendar, getCalendarTechnicians, getRolesGuardia, planificarCalendario, prepareCalendar,
  type GuardiaDetalle, type RolGuardia, type UsuarioGuardia } from '../services/guardiasService'
import { formatCalendarDateRange } from '../utils/date'
import { calendarWeekStarts, monthNames, recurringWeekStarts, shiftDay, shiftsOnDay } from '../utils/shiftCalendar'
import { notifyCalendarUpdated } from '../utils/calendarEvents'

export function ShiftCalendarPage({ annual = false }: { annual?: boolean }) {
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
  const [repeat, setRepeat] = useState(false)
  const [frequency, setFrequency] = useState('1')
  const [replaceExisting, setReplaceExisting] = useState(false)
  const [success, setSuccess] = useState('')
  const details = useRef<HTMLElement>(null)
  const weekStarts = calendarWeekStarts(year)

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
    setReplaceExisting(false); setSuccess('')
  }
  async function save(shift: GuardiaDetalle) {
    if (!accessToken || saving) return
    if (primary && primary === secondary) { setError('El principal y el secundario deben ser técnicos distintos.'); return }
    if (annual && (!primary || (repeat && (!Number.isInteger(Number(frequency)) || Number(frequency) < 1 || Number(frequency) > weekStarts.length)))) {
      setError(`Selecciona el principal y una frecuencia entera entre 1 y ${weekStarts.length}.`); return
    }
    const principalRole = roles.find(r => r.codigo === 'PRINCIPAL')
    const secondaryRole = roles.find(r => r.codigo === 'SECUNDARIO')
    if (!principalRole || !secondaryRole) { setError('Faltan los roles de guardia. Contacta con administración.'); return }
    setSaving(true); setError(null)
    try {
      if (annual) {
        const result = await planificarCalendario(accessToken, {
          anio: year, guardia_id: shift.id, principal_id: Number(primary), secundario_id: secondary ? Number(secondary) : undefined,
          frecuencia_semanas: repeat ? Number(frequency) : undefined, reemplazar_existentes: replaceExisting,
        })
        notifyCalendarUpdated()
        setSuccess(`Planificación guardada: ${result.programadas} ${result.programadas === 1 ? 'semana' : 'semanas'} del año ${year}.`)
        try { setShifts(await getCalendar(accessToken, year)) }
        catch { setError('La planificación se ha guardado, pero no se pudo recargar el calendario. Pulsa Actualizar para consultarla.') }
      } else {
        const assignments = shift.Asignaciones.filter(a => !['PRINCIPAL', 'SECUNDARIO'].includes(a.RolGuardia.codigo))
          .map(a => ({ usuario_id: a.usuario_id, rol_guardia_id: a.rol_guardia_id }))
        if (primary) assignments.push({ usuario_id: Number(primary), rol_guardia_id: principalRole.id })
        if (secondary) assignments.push({ usuario_id: Number(secondary), rol_guardia_id: secondaryRole.id })
        const updated = await actualizarGuardia(accessToken, shift.id, { asignaciones: assignments })
        setShifts(prev => prev.map(s => s.id === shift.id ? updated : s))
        notifyCalendarUpdated()
        setSuccess('Técnicos guardados. Los conflictos de permisos se han actualizado.')
      }
      setEditing(null)
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudieron guardar los técnicos.') }
    finally { setSaving(false) }
  }
  function selectDay(day: string) {
    if (saving) return
    setSelected(day); setEditing(null); setError(null); setSuccess(''); setReplaceExisting(false)
    if (annual) {
      const shift = shifts.find(s => shiftDay(s.fecha_inicio) === day)
      if (shift) edit(shift)
      details.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      details.current?.focus({ preventScroll: true })
    }
  }
  const selectedShifts = shiftsOnDay(shifts, selected)
  const plannedStarts = recurringWeekStarts(year, selected, repeat ? Number(frequency) : undefined)
  const occupied = plannedStarts.filter(day => {
    const shift = shifts.find(s => shiftDay(s.fecha_inicio) === day)
    if (!shift?.Asignaciones.length) return false
    return shift.Asignaciones.length !== (secondary ? 2 : 1) ||
      !shift.Asignaciones.some(a => a.usuario_id === Number(primary) && a.RolGuardia.codigo === 'PRINCIPAL') ||
      (!!secondary && !shift.Asignaciones.some(a => a.usuario_id === Number(secondary) && a.RolGuardia.codigo === 'SECUNDARIO'))
  }).length
  const detailsPanel = (
    <section ref={details} tabIndex={annual ? -1 : undefined} className="scroll-mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" aria-live="polite">
      <h2 className="mb-3 font-semibold">Guardia del {formatCalendarDateRange(selected, selected).split(' — ')[0]}</h2>
      {selectedShifts.length === 0 && <p className="text-sm text-slate-500">{annual ? 'Selecciona un inicio de semana resaltado. Si la semana está ocupada por una guardia anterior, revísala en el calendario mensual.' : 'No hay guardia para este día.'}</p>}
      {selectedShifts.map(shift => <div key={shift.id} className="mb-4 space-y-3">
        <p className="text-sm text-slate-600">{formatCalendarDateRange(shiftDay(shift.fecha_inicio), shiftDay(new Date(new Date(shift.fecha_fin).getTime() - 1).toISOString()))}</p>
        {shift.Asignaciones.length === 0 && <p className="text-sm text-slate-500">Guardia vacía. Añade los técnicos.</p>}
        <ul className="space-y-2 text-sm">{shift.Asignaciones.map(a => <li key={a.id} className="rounded-lg bg-slate-50 p-2">
          <span className="font-medium">{a.Usuario.nombre} {a.Usuario.apellidos}</span><br /><span className="text-slate-500">{a.RolGuardia.nombre}</span>
        </li>)}</ul>
        {editing !== shift.id ? <button type="button" disabled={saving || (annual && !weekStarts.includes(selected))} onClick={() => edit(shift)} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{annual ? 'Planificar esta semana' : 'Modificar técnicos'}</button> : <form onSubmit={event => { event.preventDefault(); void save(shift) }} className="space-y-3">
          <div className={annual ? 'grid gap-3 sm:grid-cols-2' : 'space-y-3'}>
            {([{ label: 'Principal', value: primary, change: setPrimary }, { label: 'Secundario', value: secondary, change: setSecondary }]).map(field => <label key={field.label} className="block text-sm font-medium">
              {field.label}<select aria-label={field.label} value={field.value} required={annual && field.label === 'Principal'} disabled={saving} onChange={e => { field.change(e.target.value); setReplaceExisting(false) }} className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2">
                <option value="">Sin asignar</option>
                {field.value && !technicians.some(t => t.id === Number(field.value)) && <option value={field.value}>Asignación anterior (retirar o sustituir)</option>}
                {technicians.map(t => <option key={t.id} value={t.id}>{t.nombre} {t.apellidos} ({t.email})</option>)}
              </select>
            </label>)}
          </div>
          {annual && <div className="space-y-3 rounded-xl bg-violet-50 p-4 text-sm">
            <label className="flex items-center gap-2 font-medium"><input type="checkbox" checked={repeat} disabled={saving} onChange={e => { setRepeat(e.target.checked); setReplaceExisting(false) }} />Repetir hasta fin de año</label>
            {repeat && <label className="block font-medium">Frecuencia (semanas)
              <input aria-label="Frecuencia (semanas)" type="number" required min={1} max={weekStarts.length} step={1} value={frequency} disabled={saving} onChange={e => { setFrequency(e.target.value); setReplaceExisting(false) }} className="ml-3 w-24 rounded-lg border border-slate-300 bg-white p-2" />
            </label>}
            <p>{repeat ? `Una semana de guardia cada ${frequency || '…'} ${Number(frequency) === 1 ? 'semana' : 'semanas'}. Máximo: ${weekStarts.length}.` : 'Se asignará únicamente la semana seleccionada.'}</p>
            <p className="font-medium">{plannedStarts.length === 1 ? 'Se programará 1 semana' : `Se programarán ${plannedStarts.length} semanas`}{plannedStarts.length > 0 ? `, desde ${formatCalendarDateRange(plannedStarts[0], plannedStarts[0]).split(' — ')[0]} hasta la que comienza el ${formatCalendarDateRange(plannedStarts.at(-1)!, plannedStarts.at(-1)!).split(' — ')[0]}.` : '.'}</p>
            {!!occupied && <label className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-950">
              <input type="checkbox" checked={replaceExisting} disabled={saving} onChange={e => setReplaceExisting(e.target.checked)} className="mt-1" />
              Reemplazar las asignaciones existentes de {occupied} {occupied === 1 ? 'semana' : 'semanas'} por los técnicos seleccionados.
            </label>}
          </div>}
          <div className="flex gap-2"><button disabled={saving || (annual && occupied > 0 && !replaceExisting)} type="submit" className="rounded-lg bg-blue-600 px-3 py-2 text-sm text-white disabled:opacity-50">{saving ? 'Guardando…' : annual ? 'Guardar planificación' : 'Guardar técnicos'}</button><button type="button" disabled={saving} onClick={() => setEditing(null)} className="rounded-lg border px-3 py-2 text-sm">Cancelar</button></div>
        </form>}
      </div>)}
    </section>
  )
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link to="/supervisor" className="text-sm font-medium text-blue-700">← Volver al panel</Link>
        {annual ? <span className="font-semibold">Año actual: {year}</span> : <div className="flex items-center gap-3">
          <button type="button" disabled={saving || (year === 2000 && month === 0)} onClick={() => moveMonth(-1)} className="rounded-lg border bg-white px-3 py-2 text-sm disabled:opacity-40">Mes anterior</button>
          <span className="text-sm font-semibold">{monthNames[month]} {year}</span>
          <button type="button" disabled={saving || (year === 2100 && month === 11)} onClick={() => moveMonth(1)} className="rounded-lg border bg-white px-3 py-2 text-sm disabled:opacity-40">Mes siguiente</button>
        </div>}
        <button type="button" disabled={loading || saving} onClick={() => { setEditing(null); setRevision(n => n + 1) }} className="text-sm font-medium text-blue-700 disabled:opacity-40">Actualizar</button>
      </div>
      <p className="text-sm text-slate-600">{annual ? 'Selecciona el primer día de una semana resaltada para añadir los técnicos. La frecuencia se cuenta en semanas desde esa fecha y termina en la última semana del año actual. Las semanas que cruzan de año se conservan completas.' : 'Semanas de lunes a domingo · horario de Madrid. Selecciona un día para consultar o modificar los técnicos de esa guardia.'}</p>
      {notice && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{notice}</p>}
      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {success && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">{success}</p>}
      {loading ? <p role="status">Preparando calendario…</p> : annual ? <>
        {detailsPanel}
        <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 12 }, (_, m) =>
          <ShiftMonth key={m} year={year} month={m} shifts={shifts} selected={selected} onSelect={selectDay} weekStarts={weekStarts} compact />)}</div>
      </> : <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <ShiftMonth year={year} month={month} shifts={shifts} selected={selected} onSelect={selectDay} />
        {detailsPanel}
      </div>}
    </div>
  )
}
