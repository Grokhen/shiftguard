import { authorizedGet, authorizedPost, authorizedPatch } from './apiClient'
import type { UsuarioBasico } from './equiposService'

export type Usuario = Omit<UsuarioBasico, 'activo'> & {
  activo: boolean
  rol_id: number
  requiere_reset?: boolean
  ultimo_login?: string | null
  password_actualizada_en?: string | null
  fecha_creacion?: string
  fecha_actualizacion?: string
}

export type UsuarioFilters = {
  delegacionId?: number
  rolId?: number
  activo?: boolean
}

export type CrearUsuarioInput = {
  nombre: string
  apellidos: string
  email: string
  password: string
  rol_id: number
  delegacion_id: number
  activo: boolean
}

export type ActualizarUsuarioInput = {
  nombre?: string
  apellidos?: string
  email?: string
  password?: string
  rol_id?: number
  delegacion_id?: number
  activo?: boolean
}

function buildUsuarioQuery(filters?: UsuarioFilters): string {
  if (!filters) return ''

  const params = new URLSearchParams()

  if (filters.delegacionId != null) {
    params.append('delegacion_id', String(filters.delegacionId))
  }

  if (filters.rolId != null) {
    params.append('rol_id', String(filters.rolId))
  }

  if (typeof filters.activo === 'boolean') {
    params.append('activo', String(filters.activo))
  }

  const query = params.toString()
  return query ? `?${query}` : ''
}

export async function getUsuarios(
  accessToken: string,
  filters?: UsuarioFilters,
): Promise<Usuario[]> {
  const query = buildUsuarioQuery(filters)
  const path = `/api/usuarios${query}`
  return authorizedGet<Usuario[]>(path, accessToken)
}

export async function crearUsuario(
  accessToken: string,
  payload: CrearUsuarioInput,
): Promise<Usuario> {
  const path = '/api/usuarios'
  return authorizedPost<Usuario>(path, accessToken, payload)
}

export async function actualizarUsuario(
  accessToken: string,
  id: number,
  payload: ActualizarUsuarioInput,
): Promise<Usuario> {
  const path = `/api/usuarios/${id}`
  return authorizedPatch<Usuario>(path, accessToken, payload)
}
