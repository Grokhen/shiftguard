import { Prisma } from '@prisma/client'
import { prisma } from '../prisma'
import { httpError } from './httpError'

// Retry the entire read/validate/write operation after a serialization conflict.
export async function serializableTransaction<T>(
  work: (tx: Prisma.TransactionClient) => Promise<T>,
) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await prisma.$transaction(work, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      })
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2034') {
        throw error
      }
      if (attempt === 2) {
        throw httpError('Los datos han cambiado. Vuelve a intentar la operación.', 409)
      }
      // Let the competing commit finish before taking a fresh snapshot. Immediate
      // retries can otherwise exhaust all attempts while that commit is pending.
      await new Promise(resolve => setTimeout(resolve, 20 * (attempt + 1)))
    }
  }
  throw new Error('No se pudo completar la transacción')
}
