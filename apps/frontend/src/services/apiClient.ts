import { API_BASE_URL } from '../config'
import { notifySessionInvalidated } from '../utils/session'

type ApiError = {
  error?: string
  message?: string
}

async function handleResponse<T>(res: Response, path: string, token: string): Promise<T> {
  if (res.status === 401) notifySessionInvalidated(token)
  if (!res.ok) {
    let message = `Error ${res.status} al llamar a ${path}`

    try {
      const data = (await res.json()) as ApiError
      message = data?.error ?? data?.message ?? message
    } catch {
      // mensaje de error genérico
    }

    throw new Error(message)
  }

  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export async function authorizedGet<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })

  return handleResponse<T>(res, path, token)
}

export async function authorizedPost<T>(path: string, token: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  })

  return handleResponse<T>(res, path, token)
}

export async function authorizedPatch<T>(path: string, token: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  })

  return handleResponse<T>(res, path, token)
}

export async function authorizedDelete(path: string, token: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })

  await handleResponse<void>(res, path, token)
}
