import type { GuardiaDetalle } from '../services/guardiasService'
import { monthDays, monthNames, shiftDay, shiftsOnDay } from '../utils/shiftCalendar'

export function ShiftMonth({ year, month, shifts, selected, onSelect, userId, compact = false, weekStarts }: {
  year: number; month: number; shifts: GuardiaDetalle[]; selected: string;
  onSelect: (day: string) => void; userId?: number; compact?: boolean; weekStarts?: string[]
}) {
  const today = shiftDay(new Date().toISOString())
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" aria-label={`${monthNames[month]} ${year}`}>
      <h2 className="mb-3 font-semibold text-slate-900">{monthNames[month]} {year}</h2>
      <div className="grid grid-cols-7 gap-1 text-center text-xs text-slate-500" aria-hidden="true">
        {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((day, i) => <span key={i} className="py-1">{day}</span>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {monthDays(year, month).map(day => {
          const matches = shiftsOnDay(shifts, day.value)
          const own = matches.flatMap(s => s.Asignaciones).filter(a => a.usuario_id === userId)
          const principal = own.some(a => a.RolGuardia.codigo === 'PRINCIPAL')
          const secondary = own.some(a => a.RolGuardia.codigo === 'SECUNDARIO')
          const assigned = matches.some(s => s.Asignaciones.length > 0)
          const planningStart = weekStarts?.includes(day.value) && (day.current || (month === 0 && day.value < `${year}-01-01`))
          const enabled = weekStarts ? planningStart : day.current
          const color = planningStart ? 'bg-violet-100 font-bold text-violet-950' : principal ? 'bg-red-100 text-red-900' : secondary ? 'bg-yellow-100 text-yellow-900'
            : assigned ? 'bg-blue-50 text-blue-900' : 'bg-slate-50 text-slate-700'
          const label = principal ? 'Principal' : secondary ? 'Secundario' : assigned ? 'Compañeros de guardia' : matches.length ? 'Sin técnicos asignados' : 'Sin guardia preparada'
          return (
            <button key={day.value} type="button" disabled={!enabled} aria-pressed={selected === day.value}
              aria-label={`${day.value}: ${planningStart ? 'Planificar semana' : label}`} onClick={() => onSelect(day.value)}
              className={`${compact ? 'min-h-9 text-xs' : 'min-h-16 text-sm'} flex flex-col items-center justify-center rounded-lg border border-transparent ${color} disabled:opacity-30 hover:border-blue-400 focus-visible:outline-2 focus-visible:outline-blue-600 ${selected === day.value ? 'ring-2 ring-blue-600' : ''} ${today === day.value ? 'font-bold underline' : ''}`}>
              <span>{day.number}</span>
              {planningStart && <span className="text-[10px]">Inicio</span>}
              {day.current && (principal || secondary) && <span className="text-[10px] font-semibold">{principal ? 'P' : 'S'}</span>}
              {!compact && day.current && <span className="text-[10px]">{assigned ? 'Asignada' : matches.length ? 'Vacía' : '—'}</span>}
            </button>
          )
        })}
      </div>
    </section>
  )
}
