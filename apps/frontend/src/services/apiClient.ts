import { API_BASE_URL } from '../config'

async function handleResponse<T>(res: Response, path: string): Promise<T> {
  if (!res.ok) {
    let message = `Error ${res.status} al llamar a ${path}`

    try {
      const data = await res.json()
      if (data?.message) {
        message = data.message
      }
    } catch {
      // mensaje de error genérico
    }

    throw new Error(message)
  }

  return res.json() as Promise<T>
}

export async function authorizedGet<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })

  return handleResponse<T>(res, path)
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

  return handleResponse<T>(res, path)
}
