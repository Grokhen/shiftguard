import { authorizedGet } from './apiClient'

export type Equipo = {
  id: number
  nombre_equipo: string
  delegacion_id: number
}

export async function getEquipos(accessToken: string): Promise<Equipo[]> {
  return authorizedGet<Equipo[]>('/api/equipos', accessToken)
}
