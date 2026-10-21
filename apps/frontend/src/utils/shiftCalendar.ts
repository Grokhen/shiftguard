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

export function calendarWeekStarts(year: number): string[] {
  const first = new Date(Date.UTC(year, 0, 1))
  const start = first.getTime() - ((first.getUTCDay() + 6) % 7) * 86_400_000
  const last = Date.UTC(year, 11, 31)
  const result: string[] = []
  for (let time = start; time <= last; time += 7 * 86_400_000) result.push(new Date(time).toISOString().slice(0, 10))
  return result
}

export function recurringWeekStarts(year: number, start: string, frequency?: number): string[] {
  const weeks = calendarWeekStarts(year)
  const index = weeks.indexOf(start)
  if (index < 0 || (frequency !== undefined && (!Number.isInteger(frequency) || frequency < 1 || frequency > weeks.length))) return []
  return frequency === undefined ? [start] : weeks.filter((_, i) => i >= index && (i - index) % frequency === 0)
}
