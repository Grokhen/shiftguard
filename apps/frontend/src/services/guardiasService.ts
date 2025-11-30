import { authorizedGet, authorizedPost, authorizedPatch } from './apiClient'

export type Guardia = {
  id: number
  delegacion_id: number
  fecha_inicio: string
  fecha_fin: string
  estado: string
}

export type RolGuardia = {
  id: number
  codigo: string
  nombre: string
}

export type AsignacionGuardia = {
  id: number
  guardia_id: number
  usuario_id: number
  rol_guardia_id: number

  Guardia: Guardia
  RolGuardia: RolGuardia
}

export type ListarMisGuardiasParams = {
  desde?: string
  hasta?: string
}

export async function getMyShifts(
  accessToken: string,
  params?: ListarMisGuardiasParams,
): Promise<AsignacionGuardia[]> {
  const search = new URLSearchParams()

  if (params?.desde) search.set('desde', params.desde)
  if (params?.hasta) search.set('hasta', params.hasta)

  const queryString = search.toString()
  const path = queryString ? `/api/guardias/mias?${queryString}` : '/api/guardias/mias'

  return authorizedGet<AsignacionGuardia[]>(path, accessToken)
}

export type Delegacion = {
  id: number
  nombre: string
  codigo?: string | null
  pais_code?: string | null
  region_code?: string | null
  activo: boolean
}

export type UsuarioGuardia = {
  id: number
  nombre: string
  apellidos: string
  email: string
  delegacion_id: number
  activo?: boolean
}

export type AsignacionGuardiaConUsuario = {
  id: number
  guardia_id: number
  usuario_id: number
  rol_guardia_id: number
  Usuario: UsuarioGuardia
  RolGuardia: RolGuardia
}

export type GuardiaDetalle = Guardia & {
  Delegacion: Delegacion
  Asignaciones: AsignacionGuardiaConUsuario[]
}

export async function getGuardiasDelegacion(
  accessToken: string,
  delegacionId: number,
): Promise<Guardia[]> {
  const path = `/api/guardias/delegacion/${delegacionId}`
  return authorizedGet<Guardia[]>(path, accessToken)
}

export async function getGuardiaDetalle(
  accessToken: string,
  guardiaId: number,
): Promise<GuardiaDetalle> {
  const path = `/api/guardias/${guardiaId}`
  return authorizedGet<GuardiaDetalle>(path, accessToken)
}

export type CrearGuardiaInput = {
  fecha_inicio: string
  fecha_fin: string
  estado?: string
}

export type AsignacionGuardiaPayload = {
  usuario_id: number
  rol_guardia_id: number
}

export type ActualizarGuardiaInput = {
  fecha_inicio?: string
  fecha_fin?: string
  estado?: string
  asignaciones?: AsignacionGuardiaPayload[]
}

export async function crearGuardia(
  accessToken: string,
  input: CrearGuardiaInput,
): Promise<Guardia> {
  return authorizedPost<Guardia>('/api/guardias', accessToken, input)
}

export async function actualizarGuardia(
  accessToken: string,
  guardiaId: number,
  input: ActualizarGuardiaInput,
): Promise<GuardiaDetalle> {
  const path = `/api/guardias/${guardiaId}`
  return authorizedPatch<GuardiaDetalle>(path, accessToken, input)
}
