// One calendar timezone for all delegations until per-delegation timezones are defined.
export const SHIFT_TIME_ZONE = 'Europe/Madrid'
const day = 86_400_000
const offsetFormatter = new Intl.DateTimeFormat('en-GB', { timeZone: SHIFT_TIME_ZONE, timeZoneName: 'longOffset' })

// Interpret a civil day as midnight in Madrid, independently of the server's TZ.
export function shiftDayStart(value: string): Date {
  const target = new Date(`${value}T00:00:00.000Z`).getTime()
  let instant = target
  for (let i = 0; i < 3; i++) {
    const zone = offsetFormatter.formatToParts(new Date(instant)).find(p => p.type === 'timeZoneName')!.value
    const offset = /^GMT([+-])(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(zone)
    const seconds = offset ? (Number(offset[2]) * 3600 + Number(offset[3]) * 60 + Number(offset[4] ?? 0)) * (offset[1] === '+' ? 1 : -1) : 0
    instant = target - seconds * 1000
  }
  return new Date(instant)
}

export function permissionShiftRange(start: string, end: string) {
  const nextDay = new Date(new Date(`${end.slice(0, 10)}T00:00:00.000Z`).getTime() + day)
  return { desde: shiftDayStart(start.slice(0, 10)), hasta: shiftDayStart(nextDay.toISOString().split('T')[0]) }
}

export function calendarWeeks(year: number) {
  const first = new Date(`${String(year).padStart(4, '0')}-01-01T00:00:00.000Z`)
  const end = new Date(`${String(year).padStart(4, '0')}-12-31T00:00:00.000Z`).getTime()
  let cursor = first.getTime() - ((first.getUTCDay() + 6) % 7) * day
  const weeks: { fecha_inicio: Date; fecha_fin: Date }[] = []
  while (cursor <= end) {
    weeks.push({
      fecha_inicio: shiftDayStart(new Date(cursor).toISOString().slice(0, 10)),
      fecha_fin: shiftDayStart(new Date(cursor + 7 * day).toISOString().slice(0, 10)),
    })
    cursor += 7 * day
  }
  return weeks
}
