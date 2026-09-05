import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  authorizedDelete,
  authorizedGet,
  authorizedPatch,
  authorizedPost,
} from '../../frontend/src/services/apiClient'
import { SESSION_INVALIDATED_EVENT } from '../../frontend/src/utils/session'

afterEach(() => vi.unstubAllGlobals())

describe('API session contract with the frontend client', () => {
  it.each(['GET', 'POST', 'PATCH', 'DELETE'])(
    'announces which session received a 401 on %s',
    async (method) => {
      const events = new EventTarget()
      const invalidated = vi.fn()
      events.addEventListener(SESSION_INVALIDATED_EVENT, invalidated)
      vi.stubGlobal('window', events)
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          new Response(
            JSON.stringify({
              error: 'Sesión invalidada. Inicia sesión de nuevo.',
            }),
            { status: 401 },
          ),
        ),
      )
      const calls = {
        GET: () => authorizedGet('/api/usuarios/me', 'old-token'),
        POST: () => authorizedPost('/api/guardias', 'old-token', {}),
        PATCH: () => authorizedPatch('/api/usuarios/me', 'old-token', {}),
        DELETE: () => authorizedDelete('/api/equipos/1/miembros/2', 'old-token'),
      }
      await expect(calls[method as keyof typeof calls]()).rejects.toThrow('Sesión invalidada')
      expect(invalidated).toHaveBeenCalledTimes(1)
      expect((invalidated.mock.calls[0][0] as CustomEvent).detail).toBe('old-token')
    },
  )

  it('keeps the session on permission denials', async () => {
    const events = new EventTarget()
    const invalidated = vi.fn()
    events.addEventListener(SESSION_INVALIDATED_EVENT, invalidated)
    vi.stubGlobal('window', events)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 403 })))
    await expect(authorizedGet('/api/usuarios', 'token')).rejects.toThrow()
    expect(invalidated).not.toHaveBeenCalled()
  })

  it('accepts an empty successful password-change response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })))
    await expect(authorizedPatch('/api/usuarios/me/password', 'token', {})).resolves.toBeUndefined()
  })
})
