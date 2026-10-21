import type { Guardia } from '../services/guardiasService'

export const calendarZone = 'Europe/Madrid'
export const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
const dayFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: calendarZone, year: 'numeric', month: '2-digit', day: '2-digit',
})
export function shiftDay(iso: string): string {
  const parts = Object.fromEntries(dayFormatter.formatToParts(new Date(iso)).map(p => [p.type, p.value]))
  return `${parts.year}-${parts.month}-${parts.day}`
}
export function shiftsOnDay<T extends Guardia>(shifts: T[], date: string): T[] {
  return shifts.filter(shift => shiftDay(shift.fecha_inicio) <= date &&
    shiftDay(new Date(new Date(shift.fecha_fin).getTime() - 1).toISOString()) >= date)
}
export function monthDays(year: number, month: number) {
  const first = new Date(Date.UTC(year, month, 1))
  const offset = (first.getUTCDay() + 6) % 7
  const count = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  return Array.from({ length: Math.ceil((offset + count) / 7) * 7 }, (_, i) => {
    const date = new Date(Date.UTC(year, month, 1 - offset + i))
    return { value: date.toISOString().slice(0, 10), number: date.getUTCDate(), current: date.getUTCMonth() === month }
  })
}
