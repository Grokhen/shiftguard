export function formatDate(iso: string): string {
  const d = new Date(iso)
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d)
}

export function formatTime(iso: string): string {
  const d = new Date(iso)
  return new Intl.DateTimeFormat('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(d)
}

export function formatDateLong(iso: string): string {
  const d = new Date(iso)
  return new Intl.DateTimeFormat('es-ES', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(d)
}

export function formatDateRange(startIso: string, endIso: string): string {
  return `${formatDate(startIso)} — ${formatDate(endIso)}`
}

export function isShiftActive(startIso: string, endIso: string, now = new Date()): boolean {
  return new Date(startIso).getTime() <= now.getTime() && now.getTime() < new Date(endIso).getTime()
}

// Prisma serializes DATE columns as midnight UTC. Preserve that calendar day for display.
function calendarDate(iso: string): Date {
  return new Date(`${iso.slice(0, 10)}T00:00:00.000Z`)
}

export function formatCalendarDateLong(iso: string): string {
  return new Intl.DateTimeFormat('es-ES', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(calendarDate(iso))
}

export function formatCalendarDateRange(startIso: string, endIso: string): string {
  const formatter = new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  })
  return `${formatter.format(calendarDate(startIso))} — ${formatter.format(calendarDate(endIso))}`
}

export function isCalendarDateActive(startIso: string, endIso: string, now = new Date()): boolean {
  const today = [
    String(now.getFullYear()).padStart(4, '0'),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-')
  return startIso.slice(0, 10) <= today && today <= endIso.slice(0, 10)
}
