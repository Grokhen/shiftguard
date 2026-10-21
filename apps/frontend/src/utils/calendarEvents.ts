const calendarEvent = 'shiftguard:calendar-updated'
const calendarStorageKey = 'shiftguard-calendar-updated'

export function notifyCalendarUpdated() {
  window.dispatchEvent(new Event(calendarEvent))
  try { window.localStorage.setItem(calendarStorageKey, `${Date.now()}-${Math.random()}`) }
  catch { /* The local event still works when storage is unavailable. */ }
}

export function subscribeCalendarUpdates(refresh: () => void) {
  const onStorage = (event: StorageEvent) => { if (event.key === calendarStorageKey) refresh() }
  window.addEventListener(calendarEvent, refresh)
  window.addEventListener('storage', onStorage)
  window.addEventListener('focus', refresh)
  document.addEventListener('visibilitychange', refresh)
  return () => {
    window.removeEventListener(calendarEvent, refresh)
    window.removeEventListener('storage', onStorage)
    window.removeEventListener('focus', refresh)
    document.removeEventListener('visibilitychange', refresh)
  }
}
