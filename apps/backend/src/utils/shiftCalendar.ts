// One calendar timezone for all delegations until per-delegation timezones are defined.
export const SHIFT_TIME_ZONE = 'Europe/Madrid'
const day = 86_400_000
const partsFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: SHIFT_TIME_ZONE,
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
})

// Interpret a civil day as midnight in Madrid, independently of the server's TZ.
export function shiftDayStart(value: string): Date {
  const target = new Date(`${value}T00:00:00.000Z`).getTime()
  let instant = target
  for (let i = 0; i < 3; i++) {
    const parts = Object.fromEntries(partsFormatter.formatToParts(new Date(instant)).map(p => [p.type, p.value]))
    const wallClock = new Date(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}.000Z`).getTime()
    instant += target - wallClock
  }
  return new Date(instant)
}

export function permissionShiftRange(start: string, end: string) {
  const nextDay = new Date(new Date(`${end.slice(0, 10)}T00:00:00.000Z`).getTime() + day)
  return { desde: shiftDayStart(start.slice(0, 10)), hasta: shiftDayStart(nextDay.toISOString().slice(0, 10)) }
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
