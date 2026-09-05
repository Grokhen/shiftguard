import { createHash } from 'node:crypto'
import type { RequestHandler } from 'express'

type Counter = { attempts: number; expiresAt: number }

// Per-process protection. Multiple replicas need a shared limiter at the gateway/store.
export function createLoginRateLimiter({
  windowMs = 15 * 60 * 1000,
  ipLimit = 50,
  accountLimit = 10,
  maxEntries = 10_000,
  now = () => performance.now(),
} = {}): RequestHandler {
  const counters = new Map<string, Counter>()

  return (req, res, next) => {
    const time = now()
    // Fixed expirations follow insertion order; expired counters do not accumulate.
    for (const [key, counter] of counters) {
      if (counter.expiresAt > time) break
      counters.delete(key)
    }

    // Express defaults to the socket address. Do not trust caller-supplied forwarding headers.
    const keys = [{ key: `ip:${req.ip ?? req.socket.remoteAddress ?? 'unknown'}`, limit: ipLimit }]
    const email = req.body?.email
    if (typeof email === 'string' && email.length <= 255 && email.trim()) {
      const account = createHash('sha256').update(email.trim().toLowerCase()).digest('hex')
      keys.push({ key: `account:${account}`, limit: accountLimit })
    }

    const blocked = keys
      .map(({ key, limit }) => ({ counter: counters.get(key), limit }))
      .filter(({ counter, limit }) => counter && counter.attempts >= limit)
    const missing = keys.filter(({ key }) => !counters.has(key)).length
    if (blocked.length || counters.size + missing > maxEntries) {
      const expiry = blocked.length
        ? Math.max(...blocked.map(({ counter }) => counter!.expiresAt))
        : counters.values().next().value?.expiresAt ?? time + windowMs
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil((expiry - time) / 1000))))
      res.status(429).json({ error: 'Demasiados intentos de acceso. Inténtalo de nuevo más tarde.' })
      return
    }

    // Reserve synchronously before any database/hash work so concurrent requests also count.
    for (const { key } of keys) {
      const counter = counters.get(key)
      if (counter) counter.attempts += 1
      else counters.set(key, { attempts: 1, expiresAt: time + windowMs })
    }
    next()
  }
}
