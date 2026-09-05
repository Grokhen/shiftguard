import type { PrismaClient } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { seedDatabase } from '../src/prisma/seed'

const argon2Mock = vi.hoisted(() => ({ hash: vi.fn(), argon2id: 2 }))
vi.mock('argon2', () => ({ default: argon2Mock }))

function database() {
  const tx = {
    rolUsuario: { upsert: vi.fn(), findUnique: vi.fn().mockResolvedValue({ id: 3 }) },
    tipoPermiso: { upsert: vi.fn() },
    estadoPermiso: { upsert: vi.fn() },
    rolGuardia: { upsert: vi.fn() },
    delegacion: { upsert: vi.fn().mockResolvedValue({ id: 1 }) },
    usuario: { upsert: vi.fn().mockResolvedValue({ email: 'admin@empresa.local' }) },
  }
  const transaction = vi.fn().mockImplementation((work) => work(tx))
  return { tx, transaction, client: { $transaction: transaction } as unknown as PrismaClient }
}

const environment = { AUTH_PEPPER: 'test-pepper', SEED_ADMIN_PASSWORD: 'test-password-123' }

beforeEach(() => {
  vi.clearAllMocks()
  argon2Mock.hash.mockResolvedValue('hashed-test-password')
})

describe('seed configuration and credentials', () => {
  it.each([
    {},
    { SEED_ADMIN_PASSWORD: environment.SEED_ADMIN_PASSWORD },
    { AUTH_PEPPER: environment.AUTH_PEPPER },
    { ...environment, SEED_ADMIN_PASSWORD: '' },
    { ...environment, SEED_ADMIN_PASSWORD: 'Admin1234!' },
    { ...environment, SEED_ADMIN_PASSWORD: 'a'.repeat(129) },
  ])('rejects invalid configuration before hashing or writing: %j', async (env) => {
    const db = database()
    await expect(seedDatabase(db.client, env)).rejects.toThrow(/AUTH_PEPPER|SEED_ADMIN_PASSWORD/)
    expect(argon2Mock.hash).not.toHaveBeenCalled()
    expect(db.transaction).not.toHaveBeenCalled()
  })

  it('hashes the explicit password and seeds catalogs and admin in one transaction', async () => {
    const db = database()
    const result = await seedDatabase(db.client, environment)
    expect(argon2Mock.hash).toHaveBeenCalledWith('test-password-123test-pepper', {
      type: 2, memoryCost: 2 ** 16, timeCost: 3,
    })
    expect(db.transaction).toHaveBeenCalledTimes(1)
    expect(db.tx.rolUsuario.upsert).toHaveBeenCalledTimes(3)
    expect(db.tx.tipoPermiso.upsert).toHaveBeenCalledTimes(5)
    expect(db.tx.estadoPermiso.upsert).toHaveBeenCalledTimes(4)
    expect(db.tx.rolGuardia.upsert).toHaveBeenCalledTimes(2)
    expect(db.tx.usuario.upsert).toHaveBeenCalledWith({
      where: { email: 'admin@empresa.local' },
      update: {},
      create: {
        nombre: 'Admin', apellidos: 'Sistema', email: 'admin@empresa.local',
        password_hash: 'hashed-test-password', password_actualizada_en: expect.any(Date),
        rol_id: 3, delegacion_id: 1,
      },
      select: { email: true },
    })
    expect(result).toEqual({ email: 'admin@empresa.local' })
  })

  it('does not replace existing credentials on repeated executions', async () => {
    const db = database()
    await seedDatabase(db.client, environment)
    await seedDatabase(db.client, { ...environment, SEED_ADMIN_PASSWORD: 'different-password' })
    for (const [args] of db.tx.usuario.upsert.mock.calls) expect(args.update).toEqual({})
  })

  it('does not start writing when hashing fails', async () => {
    const db = database()
    argon2Mock.hash.mockRejectedValue(new Error('hash failed'))
    await expect(seedDatabase(db.client, environment)).rejects.toThrow('hash failed')
    expect(db.transaction).not.toHaveBeenCalled()
  })

  it('propagates a transaction failure without reporting success', async () => {
    const db = database()
    db.tx.usuario.upsert.mockRejectedValue(new Error('write failed'))
    await expect(seedDatabase(db.client, environment)).rejects.toThrow('write failed')
  })
})
