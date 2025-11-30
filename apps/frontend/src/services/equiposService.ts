import { authorizedGet, authorizedPost, authorizedPatch } from './apiClient'

export type Equipo = {
  id: number
  nombre_equipo: string
  delegacion_id: number
}

export async function getEquipos(accessToken: string): Promise<Equipo[]> {
  return authorizedGet<Equipo[]>('/api/equipos', accessToken)
}

export type UsuarioBasico = {
  id: number
  nombre: string
  apellidos: string
  email: string
  delegacion_id: number
  activo?: boolean
}

export type MiembroEquipo = {
  equipo_id: number
  usuario_id: number
  Usuario: UsuarioBasico
}

export type EquipoDetalle = Equipo & {
  Miembros: MiembroEquipo[]
}

export async function getEquipoDetalle(
  accessToken: string,
  equipoId: number,
): Promise<EquipoDetalle> {
  const path = `/api/equipos/${equipoId}`
  return authorizedGet<EquipoDetalle>(path, accessToken)
}

export type CrearEquipoInput = {
  nombre_equipo: string
  delegacion_id: number
}

export type ActualizarEquipoInput = {
  nombre_equipo?: string
  delegacion_id?: number
}

export async function crearEquipo(accessToken: string, payload: CrearEquipoInput): Promise<Equipo> {
  return authorizedPost<Equipo>('/api/equipos', accessToken, payload)
}

export async function actualizarEquipo(
  accessToken: string,
  equipoId: number,
  payload: ActualizarEquipoInput,
): Promise<Equipo> {
  const path = `/api/equipos/${equipoId}`
  return authorizedPatch<Equipo>(path, accessToken, payload)
}
