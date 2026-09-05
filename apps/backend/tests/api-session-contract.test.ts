import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  authorizedDelete,
  authorizedGet,
  authorizedPatch,
  authorizedPost,
} from '../../frontend/src/services/apiClient'
import {
  PASSWORD_CHANGE_REQUIRED_EVENT,
  SESSION_INVALIDATED_EVENT,
} from '../../frontend/src/utils/session'
import { cambiarPasswordPropia } from '../../frontend/src/services/usuariosService'
import { parseJwt } from '../../frontend/src/utils/jwt'

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

  it.each(['PASSWORD_CHANGE_REQUIRED', 'OTHER_DENIAL'])(
    'distinguishes a required change from other 403 responses: %s',
    async (code) => {
      const events = new EventTarget()
      const reset = vi.fn()
      const invalidated = vi.fn()
      events.addEventListener(PASSWORD_CHANGE_REQUIRED_EVENT, reset)
      events.addEventListener(SESSION_INVALIDATED_EVENT, invalidated)
      vi.stubGlobal('window', events)
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValue(
            new Response(JSON.stringify({ code, error: 'Acceso restringido' }), { status: 403 }),
          ),
      )
      await expect(authorizedGet('/api/guardias', 'affected-token')).rejects.toThrow(
        'Acceso restringido',
      )
      expect(invalidated).not.toHaveBeenCalled()
      expect(reset).toHaveBeenCalledTimes(code === 'PASSWORD_CHANGE_REQUIRED' ? 1 : 0)
      if (code === 'PASSWORD_CHANGE_REQUIRED')
        expect(reset.mock.calls[0][0].detail).toBe('affected-token')
    },
  )

  it('sends the current and new password to the authenticated own-password endpoint', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetch)
    await expect(
      cambiarPasswordPropia('token', 'old-password', 'new-password'),
    ).resolves.toBeUndefined()
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/api/usuarios/me/password'), {
      method: 'PATCH',
      headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ password_actual: 'old-password', password_nueva: 'new-password' }),
    })
  })

  it.each([true, false, undefined, 'false'])(
    'validates the password-change hint in a token: %s',
    (requiresPasswordChange) => {
      const payload = {
        sub: 1,
        role: 1,
        roleCode: 'TECNICO',
        deleg: 1,
        exp: 2_000_000_000,
        requiresPasswordChange,
      }
      const token = `header.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.signature`
      if (typeof requiresPasswordChange === 'string') expect(parseJwt(token)).toBeNull()
      else expect(parseJwt(token)).toMatchObject({ roleCode: 'TECNICO' })
    },
  )
})
