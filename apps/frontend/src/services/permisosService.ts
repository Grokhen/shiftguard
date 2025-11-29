import { authorizedGet, authorizedPost } from './apiClient'

export type TipoPermiso = {
  id: number
  codigo: string
  nombre: string
}

export type EstadoPermiso = {
  id: number
  codigo: string
  nombre: string
}

export type Permiso = {
  id: number
  usuario_id: number
  tipo_id: number
  estado_id: number
  fecha_inicio: string
  fecha_fin: string
  observaciones: string | null

  Tipo: TipoPermiso
  Estado: EstadoPermiso
}

export type ListarMisPermisosParams = {
  anio?: number
  tipo_id?: number
  estado_id?: number
}

export async function getMyPermisos(
  accessToken: string,
  params?: ListarMisPermisosParams,
): Promise<Permiso[]> {
  const search = new URLSearchParams()

  if (params?.anio != null) search.set('anio', String(params.anio))
  if (params?.tipo_id != null) search.set('tipo_id', String(params.tipo_id))
  if (params?.estado_id != null) search.set('estado_id', String(params.estado_id))

  const queryString = search.toString()
  const path = queryString ? `/api/permisos/mios?${queryString}` : '/api/permisos/mios'

  return authorizedGet<Permiso[]>(path, accessToken)
}

export async function getTiposPermiso(accessToken: string): Promise<TipoPermiso[]> {
  return authorizedGet<TipoPermiso[]>('/api/permisos/tipos', accessToken)
}

export type CrearPermisoInput = {
  tipo_id: number
  fecha_inicio: string
  fecha_fin: string
  observaciones?: string
}

export async function crearPermiso(
  accessToken: string,
  input: CrearPermisoInput,
): Promise<Permiso> {
  return authorizedPost<Permiso>('/api/permisos', accessToken, input)
}

export type UsuarioPermiso = {
  id: number
  nombre: string
  apellidos: string
  email: string
  delegacion_id: number
}

export type PermisoEquipo = Permiso & {
  Usuario: UsuarioPermiso
}

export async function getPermisosEquipo(
  accessToken: string,
  equipoId: number,
  anio?: number,
): Promise<PermisoEquipo[]> {
  const search = new URLSearchParams()
  if (anio != null) search.set('anio', String(anio))

  const qs = search.toString()
  const path = qs ? `/api/equipos/${equipoId}/permisos?${qs}` : `/api/equipos/${equipoId}/permisos`

  return authorizedGet<PermisoEquipo[]>(path, accessToken)
}
