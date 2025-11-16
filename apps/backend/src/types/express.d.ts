import 'express'
import type { AuthPayload } from '../middlewares/authRequired'

declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload
    }
  }
}

export {}
