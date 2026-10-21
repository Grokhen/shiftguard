import { Prisma } from '@prisma/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { serializableTransaction } from '../src/utils/transaction'

const db = vi.hoisted(() => ({ $transaction: vi.fn() }))
vi.mock('../src/prisma', () => ({ prisma: db }))
beforeEach(() => { vi.resetAllMocks(); vi.useFakeTimers() })
afterEach(() => vi.useRealTimers())
const error = (code: string) => new Prisma.PrismaClientKnownRequestError('Test conflict', { code, clientVersion: 'test' })

it('allows the competing commit to finish between attempts and still stops after three failures', async () => {
  db.$transaction.mockRejectedValue(error('P2034'))
  const pending = serializableTransaction(async () => 'unused')
  const rejected = expect(pending).rejects.toMatchObject({ statusCode: 409 })
  await vi.advanceTimersByTimeAsync(19)
  expect(db.$transaction).toHaveBeenCalledTimes(1)
  await vi.advanceTimersByTimeAsync(1)
  expect(db.$transaction).toHaveBeenCalledTimes(2)
  await vi.advanceTimersByTimeAsync(39)
  expect(db.$transaction).toHaveBeenCalledTimes(2)
  await vi.advanceTimersByTimeAsync(1)
  await rejected
  expect(db.$transaction).toHaveBeenCalledTimes(3)
  expect(vi.getTimerCount()).toBe(0)
})

it('does not delay or retry non-serialization database errors', async () => {
  const failure = error('P2002')
  db.$transaction.mockRejectedValue(failure)
  await expect(serializableTransaction(async () => 'unused')).rejects.toBe(failure)
  expect(db.$transaction).toHaveBeenCalledTimes(1)
  expect(vi.getTimerCount()).toBe(0)
})
