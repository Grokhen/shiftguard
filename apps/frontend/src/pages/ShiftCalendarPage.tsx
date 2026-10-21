import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { ShiftMonth } from '../components/ShiftMonth'
import { actualizarGuardia, getCalendar, getCalendarTechnicians, getRolesGuardia, planificarCalendario, prepareCalendar,
  type GuardiaDetalle, type RolGuardia, type UsuarioGuardia } from '../services/guardiasService'
import { formatCalendarDateRange } from '../utils/date'
import { calendarWeekStarts, monthNames, recurringWeekStarts, shiftDay, shiftsOnDay } from '../utils/shiftCalendar'
import { notifyCalendarUpdated } from '../utils/calendarEvents'
import { getPermisosPendientes, type PermisoConUsuario } from '../services/permisosService'
import { assignedPermissionConflicts, calendarDay, permissionConflicts } from '../utils/permissionCalendar'

export function ShiftCalendarPage({ annual = false }: { annual?: boolean }) {
  const { accessToken } = useAuth()
  const today = shiftDay(new Date().toISOString())
  const currentYear = Number(today.slice(0, 4))
  const [searchParams] = useSearchParams()
  const initialDay = (!annual && calendarDay(searchParams.get('fecha'))) || today
  const requestedId = Number(searchParams.get('permiso'))
  const permissionId = !annual && Number.isSafeInteger(requestedId) && requestedId > 0 ? requestedId : null
  const [year, setYear] = useState(Number(initialDay.slice(0, 4)))
  const [month, setMonth] = useState(Number(initialDay.slice(5, 7)) - 1)
  const [selected, setSelected] = useState(initialDay)
  const [permissionContext, setPermissionContext] = useState<{ id: number; permission: PermisoConUsuario | null; error?: string } | null>(null)
  const [permissionRevision, setPermissionRevision] = useState(0)
  const context = permissionContext?.id === permissionId ? permissionContext : null
  const permission = context?.permission
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
    if (!accessToken || !permissionId) return
    let active = true
    getPermisosPendientes(accessToken).then(permissions => {
      if (active) setPermissionContext({ id: permissionId, permission: permissions.find(p => p.id === permissionId) ?? null })
    }).catch(() => {
      if (active) setPermissionContext({ id: permissionId, permission: null, error: 'No se pudo consultar la solicitud. Pulsa Actualizar para intentarlo de nuevo.' })
    })
    return () => { active = false }
  }, [accessToken, permissionId, permissionRevision, revision])

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
  function selectYear(value: number) {
    setYear(value); setSelected(calendarWeekStarts(value)[0])
    setEditing(null); setError(null); setSuccess(''); setReplaceExisting(false)
  }
  function goToConflict(day: string) {
    setYear(Number(day.slice(0, 4))); setMonth(Number(day.slice(5, 7)) - 1); setSelected(day)
    setEditing(null); setError(null); setSuccess('')
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
        setPermissionRevision(n => n + 1)
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
  const conflictRanges = permission ? assignedPermissionConflicts(permission, shifts) : []
  const permissionRanges = permission ? permissionConflicts(permission, permission.conflictos_guardias ?? []) : []
  const plannedStarts = recurringWeekStarts(year, selected, repeat ? Number(frequency) : undefined)
  const plannedEnd = plannedStarts.length ? new Date(`${plannedStarts.at(-1)!}T00:00:00.000Z`) : null
  if (plannedEnd) plannedEnd.setUTCDate(plannedEnd.getUTCDate() + 7)
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
            <p className="font-medium">{plannedStarts.length === 1 ? 'Se programará 1 semana' : `Se programarán ${plannedStarts.length} semanas`}{plannedEnd ? `, desde ${formatCalendarDateRange(plannedStarts[0], plannedEnd.toISOString()).replace(' — ', ' hasta el ')}.` : '.'}</p>
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
        {annual ? <label className="text-sm font-semibold">Año a planificar
          <select aria-label="Año a planificar" value={year} disabled={saving || loading} onChange={event => selectYear(Number(event.target.value))} className="ml-3 rounded-lg border border-slate-300 bg-white p-2">
            <option value={currentYear}>{currentYear} (actual)</option>
            <option value={currentYear + 1}>{currentYear + 1} (siguiente)</option>
          </select>
        </label> : <div className="flex items-center gap-3">
          <button type="button" disabled={saving || (year === 2000 && month === 0)} onClick={() => moveMonth(-1)} className="rounded-lg border bg-white px-3 py-2 text-sm disabled:opacity-40">Mes anterior</button>
          <span className="text-sm font-semibold">{monthNames[month]} {year}</span>
          <button type="button" disabled={saving || (year === 2100 && month === 11)} onClick={() => moveMonth(1)} className="rounded-lg border bg-white px-3 py-2 text-sm disabled:opacity-40">Mes siguiente</button>
        </div>}
        <button type="button" disabled={loading || saving} onClick={() => { setEditing(null); setRevision(n => n + 1) }} className="text-sm font-medium text-blue-700 disabled:opacity-40">Actualizar</button>
      </div>
      <p className="text-sm text-slate-600">{annual ? 'Elige el año actual o el siguiente y selecciona el primer día de una semana resaltada para añadir los técnicos. La frecuencia se cuenta en semanas desde esa fecha y termina en la última semana del año elegido. Las semanas que cruzan de año se conservan completas.' : 'Semanas de lunes a domingo · horario de Madrid. Selecciona un día para consultar o modificar los técnicos de esa guardia.'}</p>
      {permissionId && <section aria-label="Solicitud en revisión" className="space-y-2 rounded-lg border border-orange-200 bg-orange-50 p-4 text-sm text-orange-950">
        {!context ? <p>Consultando la solicitud de permiso…</p> : context.error ? <p role="alert">{context.error}</p> : permission ? <>
          <p className="font-semibold">Permiso de {permission.Usuario.nombre} {permission.Usuario.apellidos} · {formatCalendarDateRange(permission.fecha_inicio, permission.fecha_fin)}</p>
          <p>{permissionRanges.length ? 'Los días en naranja coinciden con una guardia del solicitante. Selecciona un día y pulsa «Modificar técnicos» para cambiar la asignación.' : 'Esta solicitud ya no tiene coincidencias con guardias.'}</p>
          {permission.sustituto_nombre && <p>Sustituto propuesto: {permission.sustituto_nombre}</p>}
          <div className="flex flex-wrap gap-2">{permissionRanges.map(range => <button key={range.guardiaId} type="button" disabled={saving} onClick={() => goToConflict(range.desde)} className="rounded-lg border border-orange-300 bg-white px-3 py-1 font-medium disabled:opacity-40">Ver {formatCalendarDateRange(range.desde, range.hasta)}</button>)}</div>
        </> : <p>Esta solicitud ya no está pendiente o no está disponible. Vuelve al panel para revisar los permisos actuales.</p>}
      </section>}
      {notice && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{notice}</p>}
      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {success && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">{success}</p>}
      {loading ? <p role="status">Preparando calendario…</p> : annual ? <>
        {detailsPanel}
        <div className="flex flex-wrap items-center gap-3 text-sm" aria-label="Leyenda de inicios de semana">
          <span className="text-slate-600">Inicio de semana:</span>
          <span className="rounded-lg bg-emerald-100 px-3 py-1 font-medium text-emerald-950">Asignada · con técnicos</span>
          <span className="rounded-lg bg-violet-100 px-3 py-1 font-medium text-violet-950">Vacía · sin técnicos</span>
        </div>
        <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 12 }, (_, m) =>
          <ShiftMonth key={m} year={year} month={m} shifts={shifts} selected={selected} onSelect={selectDay} weekStarts={weekStarts} compact />)}</div>
      </> : <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <ShiftMonth year={year} month={month} shifts={shifts} selected={selected} onSelect={selectDay} conflictRanges={conflictRanges} />
        {detailsPanel}
      </div>}
    </div>
  )
}
