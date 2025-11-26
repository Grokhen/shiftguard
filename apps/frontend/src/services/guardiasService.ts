import { authorizedGet } from './apiClient'

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
