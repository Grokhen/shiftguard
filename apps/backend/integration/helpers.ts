import { randomUUID } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import * as jwt from 'jsonwebtoken'
import { vi } from 'vitest'
import { prisma } from '../src/prisma'

export function createDelegation() {
  return prisma.delegacion.create({ data: { nombre: `Integration ${randomUUID()}` } })
}

export async function createActor(delegacionId: number, codigo = 'TECNICO') {
  const role = await prisma.rolUsuario.upsert({
    where: { codigo },
    create: { codigo, nombre: codigo },
    update: {},
  })
  const user = await prisma.usuario.create({
    data: {
      nombre: 'Integration',
      apellidos: codigo,
      email: `${randomUUID()}@example.invalid`,
      password_hash: 'integration-only-not-a-password-hash',
      rol_id: role.id,
      delegacion_id: delegacionId,
    },
  })
  const token = jwt.sign(
    {
      sub: user.id,
      role: role.id,
      roleCode: role.codigo,
      deleg: delegacionId,
      passwordVersion: 0,
    },
    process.env.JWT_SECRET!,
    { expiresIn: '15m' },
  )
  return { user, token }
}

// Only schedules real queries. A missing arrival fails promptly, and close() releases
// any pending request so failed assertions cannot leave a transaction hanging.
export function createReadBarrier() {
  let arrivals = 0
  let release!: () => void
  let fail!: (error: Error) => void
  let timeout: ReturnType<typeof setTimeout> | undefined
  const ready = new Promise<void>((resolve, reject) => {
    release = resolve
    fail = reject
  })
  return {
    get arrivals() {
      return arrivals
    },
    async wait() {
      if (arrivals >= 2) return
      arrivals += 1
      if (arrivals === 1) {
        timeout = setTimeout(() => fail(new Error('No llegaron dos lecturas concurrentes')), 3000)
      } else {
        clearTimeout(timeout)
        release()
      }
      await ready
    },
    close() {
      clearTimeout(timeout)
      release()
    },
  }
}

type ReadPoint = {
  model: 'usuario' | 'miembroEquipo' | 'asignacionGuardia' | 'rolGuardia'
  method: 'findUnique' | 'findFirst' | 'findMany'
  matches?: (args: unknown[]) => boolean
}

// Each point belongs to a different route. Both initial transactions read before
// either writes; retries run normally with fresh PostgreSQL snapshots and results.
export function synchronizeTransactionReads(points: [ReadPoint, ReadPoint]) {
  const barrier = createReadBarrier()
  const seen = new Set<ReadPoint>()
  const original = prisma.$transaction.bind(prisma)
  const spy = vi.spyOn(prisma, '$transaction')
  spy.mockImplementation(((
    work: (tx: Prisma.TransactionClient) => Promise<unknown>,
    options?: {
      isolationLevel?: Prisma.TransactionIsolationLevel
      maxWait?: number
      timeout?: number
    },
  ) =>
    original(
      async (tx) =>
        work(
          new Proxy(tx, {
            get(target, model, receiver) {
              const delegate = Reflect.get(target, model, receiver)
              if (!points.some((point) => point.model === model)) return delegate
              return new Proxy(delegate, {
                get(queryTarget, method, queryReceiver) {
                  const query = Reflect.get(queryTarget, method, queryReceiver)
                  const point = points.find(
                    (item) => item.model === model && item.method === method,
                  )
                  if (!point) return query
                  return async (...args: unknown[]) => {
                    const result = await Reflect.apply(query, queryTarget, args)
                    if (!seen.has(point) && (!point.matches || point.matches(args))) {
                      seen.add(point)
                      await barrier.wait()
                    }
                    return result
                  }
                },
              })
            },
          }),
        ),
      options,
    )) as typeof prisma.$transaction)
  return {
    spy,
    get arrivals() {
      return barrier.arrivals
    },
    close() {
      barrier.close()
      spy.mockRestore()
    },
  }
}
