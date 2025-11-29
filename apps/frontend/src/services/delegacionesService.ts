import { authorizedGet, authorizedPost, authorizedPatch } from './apiClient'

export type Delegacion = {
  id: number
  nombre: string
  codigo?: string | null
  pais_code: string
  region_code: string
  activo: boolean
}

export type CrearDelegacionInput = {
  nombre: string
  codigo?: string | null
  pais_code: string
  region_code: string
  activo: boolean
}

export type ActualizarDelegacionInput = {
  nombre?: string
  codigo?: string | null
  pais_code?: string
  region_code?: string
  activo?: boolean
}

export async function getDelegaciones(accessToken: string): Promise<Delegacion[]> {
  const path = '/api/delegaciones'
  return authorizedGet<Delegacion[]>(path, accessToken)
}

export async function crearDelegacion(
  accessToken: string,
  payload: CrearDelegacionInput,
): Promise<Delegacion> {
  const path = '/api/delegaciones'
  return authorizedPost<Delegacion>(path, accessToken, payload)
}

export async function actualizarDelegacion(
  accessToken: string,
  id: number,
  payload: ActualizarDelegacionInput,
): Promise<Delegacion> {
  const path = `/api/delegaciones/${id}`
  return authorizedPatch<Delegacion>(path, accessToken, payload)
}
