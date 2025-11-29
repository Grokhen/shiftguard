import { authorizedGet, authorizedPatch } from './apiClient'

export type RolUsuario = {
  id: number
  codigo: string
  nombre: string
}

export type ActualizarRolUsuarioInput = {
  codigo?: string
  nombre?: string
}

export async function getRolesUsuario(accessToken: string): Promise<RolUsuario[]> {
  const path = '/api/roles-usuario'
  return authorizedGet<RolUsuario[]>(path, accessToken)
}

export async function actualizarRolUsuario(
  accessToken: string,
  id: number,
  payload: ActualizarRolUsuarioInput,
): Promise<RolUsuario> {
  const path = `/api/roles-usuario/${id}`
  return authorizedPatch<RolUsuario>(path, accessToken, payload)
}
