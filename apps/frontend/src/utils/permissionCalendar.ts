import type { GuardiaDetalle } from '../services/guardiasService'
import type { ConflictoGuardia, Permiso } from '../services/permisosService'
import { shiftDay } from './shiftCalendar'

type PermissionDays = Pick<Permiso, 'fecha_inicio' | 'fecha_fin'>

export function calendarDay(value: string | null): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '2000-01-01' || value > '2100-12-31') return null
  const date = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : null
}

export function permissionConflictRange(permission: PermissionDays, shift: ConflictoGuardia) {
  const first = shiftDay(shift.fecha_inicio)
  // Guardias exclude their end instant; permisos include both calendar days.
  const last = shiftDay(new Date(new Date(shift.fecha_fin).getTime() - 1).toISOString())
  const desde = first > permission.fecha_inicio.slice(0, 10) ? first : permission.fecha_inicio.slice(0, 10)
  const hasta = last < permission.fecha_fin.slice(0, 10) ? last : permission.fecha_fin.slice(0, 10)
  return desde <= hasta ? { guardiaId: shift.id, desde, hasta } : null
}

export function permissionConflicts(permission: PermissionDays, shifts: ConflictoGuardia[]) {
  return shifts.flatMap(shift => {
    const range = permissionConflictRange(permission, shift)
    return range ? [range] : []
  }).sort((a, b) => a.desde.localeCompare(b.desde))
}

export function permissionCalendarLink(permission: Pick<Permiso, 'id' | 'fecha_inicio' | 'fecha_fin' | 'conflictos_guardias'>) {
  const first = permissionConflicts(permission, permission.conflictos_guardias ?? [])[0]?.desde ?? permission.fecha_inicio.slice(0, 10)
  return `/supervisor/guardias?${new URLSearchParams({ fecha: first, permiso: String(permission.id) })}`
}

export function assignedPermissionConflicts(permission: PermissionDays & Pick<Permiso, 'usuario_id'>, shifts: GuardiaDetalle[]) {
  return permissionConflicts(permission, shifts.filter(shift => shift.Asignaciones.some(a => a.usuario_id === permission.usuario_id)))
}
