import express from 'express'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createLoginRateLimiter } from '../src/middlewares/loginRateLimit'

function fixture(options: Parameters<typeof createLoginRateLimiter>[0] = {}, simulatedIp = false) {
  let time = 0
  let reached = 0
  const app = express()
  app.use(express.json())
  if (simulatedIp) {
    // Only this test harness accepts a header as an IP; the application never does.
    app.use((req, _res, next) => {
      Object.defineProperty(req, 'ip', { value: req.get('test-ip') ?? '127.0.0.1' })
      next()
    })
  }
  app.post('/login', createLoginRateLimiter({ ...options, now: () => time }), (_req, res) => {
    reached += 1
    res.status(401).json({ error: 'Credenciales inválidas' })
  })
  return { app, advance: (milliseconds: number) => { time += milliseconds }, reached: () => reached }
}

describe('login request limits', () => {
  it('limits an account across IPs and normalizes case and surrounding spaces', async () => {
    const f = fixture({ accountLimit: 2 }, true)
    await request(f.app).post('/login').set('test-ip', '1').send({ email: 'user@example.com' }).expect(401)
    await request(f.app).post('/login').set('test-ip', '2').send({ email: ' USER@example.com ' }).expect(401)
    const denied = await request(f.app).post('/login').set('test-ip', '3').send({ email: 'user@example.com' }).expect(429)
    expect(denied.headers['retry-after']).toBe('900')
    expect(f.reached()).toBe(2)
  })

  it('limits password spraying across different accounts from the same IP', async () => {
    const f = fixture({ ipLimit: 2 })
    await request(f.app).post('/login').send({ email: 'a@example.com' }).expect(401)
    await request(f.app).post('/login').send({ email: 'b@example.com' }).expect(401)
    await request(f.app).post('/login').send({ email: 'c@example.com' }).expect(429)
    expect(f.reached()).toBe(2)
  })

  it('does not allow spoofed forwarding headers to bypass the IP limit', async () => {
    const f = fixture({ ipLimit: 1 })
    await request(f.app).post('/login').set('X-Forwarded-For', '192.0.2.1').send({}).expect(401)
    await request(f.app).post('/login').set('X-Forwarded-For', '192.0.2.2').send({}).expect(429)
  })

  it('counts malformed login bodies without requiring an account key', async () => {
    const f = fixture({ ipLimit: 2 })
    await request(f.app).post('/login').send({ email: { invalid: true } }).expect(401)
    await request(f.app).post('/login').expect(401)
    await request(f.app).post('/login').send({ email: 'a'.repeat(256) }).expect(429)
  })

  it('expires the window without extending it when blocked requests arrive', async () => {
    const f = fixture({ accountLimit: 1, windowMs: 2000 })
    await request(f.app).post('/login').send({ email: 'a@example.com' }).expect(401)
    f.advance(1250)
    const denied = await request(f.app).post('/login').send({ email: 'a@example.com' }).expect(429)
    expect(denied.headers['retry-after']).toBe('1')
    f.advance(750)
    await request(f.app).post('/login').send({ email: 'a@example.com' }).expect(401)
  })

  it('reserves attempts before asynchronous handlers finish', async () => {
    const app = express()
    let started = 0
    app.use(createLoginRateLimiter({ ipLimit: 2 }))
    app.post('/login', async (_req, res) => {
      started += 1
      await new Promise((resolve) => setTimeout(resolve, 10))
      res.sendStatus(200)
    })
    const responses = await Promise.all(Array.from({ length: 8 }, () => request(app).post('/login')))
    expect(responses.filter((res) => res.status === 200)).toHaveLength(2)
    expect(responses.filter((res) => res.status === 429)).toHaveLength(6)
    expect(started).toBe(2)
  })

  it('keeps active counters when capacity is reached and recovers after expiration', async () => {
    const f = fixture({ maxEntries: 2, accountLimit: 1, windowMs: 1000 }, true)
    await request(f.app).post('/login').set('test-ip', '1').send({ email: 'a@example.com' }).expect(401)
    await request(f.app).post('/login').set('test-ip', '2').send({ email: 'b@example.com' }).expect(429)
    await request(f.app).post('/login').set('test-ip', '1').send({ email: 'a@example.com' }).expect(429)
    f.advance(1000)
    await request(f.app).post('/login').set('test-ip', '2').send({ email: 'b@example.com' }).expect(401)
  })

  it('allows unrelated accounts from different IPs while one account is limited', async () => {
    const f = fixture({ accountLimit: 1 }, true)
    await request(f.app).post('/login').set('test-ip', '1').send({ email: 'a@example.com' }).expect(401)
    await request(f.app).post('/login').set('test-ip', '1').send({ email: 'a@example.com' }).expect(429)
    await request(f.app).post('/login').set('test-ip', '2').send({ email: 'b@example.com' }).expect(401)
  })
})
