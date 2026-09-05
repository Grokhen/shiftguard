export const SESSION_INVALIDATED_EVENT = 'shiftguard:session-invalidated'
export const PASSWORD_CHANGE_REQUIRED_EVENT = 'shiftguard:password-change-required'
export const PASSWORD_CHANGED_EVENT = 'shiftguard:password-changed'

export function notifySessionInvalidated(token: string) {
  window.dispatchEvent(new CustomEvent(SESSION_INVALIDATED_EVENT, { detail: token }))
}

export function notifyPasswordChangeRequired(token: string) {
  window.dispatchEvent(new CustomEvent(PASSWORD_CHANGE_REQUIRED_EVENT, { detail: token }))
}

export function notifyPasswordChanged(token: string) {
  window.dispatchEvent(new CustomEvent(PASSWORD_CHANGED_EVENT, { detail: token }))
}
