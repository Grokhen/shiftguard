import { authorizedGet } from './apiClient'

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
