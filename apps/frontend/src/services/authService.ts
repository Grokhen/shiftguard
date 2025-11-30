import { API_BASE_URL } from '../config'

export type LoginResponse = {
  access_token: string
}

type ApiError = {
  message?: string
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  })

  if (!res.ok) {
    let errorMessage = 'Error al iniciar sesión'

    try {
      const data: ApiError = await res.json()
      if (data?.message) {
        errorMessage = data.message
      }
    } catch {
      // si no se puede parsear el JSON, devuelve mensaje genérico
    }

    throw new Error(errorMessage)
  }

  const data = (await res.json()) as LoginResponse
  return data
}
