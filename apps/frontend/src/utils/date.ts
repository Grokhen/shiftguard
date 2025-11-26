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
