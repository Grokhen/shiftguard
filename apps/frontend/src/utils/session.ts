export const SESSION_INVALIDATED_EVENT = 'shiftguard:session-invalidated'

export function notifySessionInvalidated(token: string) {
  window.dispatchEvent(new CustomEvent(SESSION_INVALIDATED_EVENT, { detail: token }))
}
