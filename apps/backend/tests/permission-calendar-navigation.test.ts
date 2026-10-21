import { describe, expect, it } from 'vitest'
import { assignedPermissionConflicts, calendarDay, permissionCalendarLink, permissionConflicts } from '../../frontend/src/utils/permissionCalendar'
import type { GuardiaDetalle } from '../../frontend/src/services/guardiasService'

const permission = { id: 7, usuario_id: 20, fecha_inicio: '2026-11-03T00:00:00.000Z', fecha_fin: '2026-11-05T00:00:00.000Z' }
const shift = { id: 3, fecha_inicio: '2026-11-01T23:00:00.000Z', fecha_fin: '2026-11-08T23:00:00.000Z' }

describe('permission conflict calendar navigation', () => {
  it('opens the first affected day of the permission rather than the start of its guard duty', () => {
    expect(permissionCalendarLink({ ...permission, conflictos_guardias: [shift] }))
      .toBe('/supervisor/guardias?fecha=2026-11-03&permiso=7')
    expect(permissionConflicts(permission, [shift])).toEqual([{ guardiaId: 3, desde: '2026-11-03', hasta: '2026-11-05' }])
  })

  it('orders multiple conflicts and opens the affected month when leave starts in an earlier month', () => {
    const later = { id: 4, fecha_inicio: '2026-12-06T23:00:00Z', fecha_fin: '2026-12-13T23:00:00Z' }
    const longLeave = { ...permission, fecha_inicio: '2026-10-31', fecha_fin: '2026-12-09' }
    expect(permissionCalendarLink({ ...longLeave, conflictos_guardias: [later, shift] }))
      .toBe('/supervisor/guardias?fecha=2026-11-02&permiso=7')
    expect(permissionConflicts(longLeave, [later, shift]).map(r => r.desde)).toEqual(['2026-11-02', '2026-12-07'])
  })

  it('keeps shared December/January days and excludes the Monday on which a shift ends', () => {
    const shared = { ...shift, fecha_inicio: '2026-12-27T23:00:00Z', fecha_fin: '2027-01-03T23:00:00Z' }
    expect(permissionConflicts({ fecha_inicio: '2027-01-01', fecha_fin: '2027-01-04' }, [shared]))
      .toEqual([{ guardiaId: 3, desde: '2027-01-01', hasta: '2027-01-03' }])
    expect(permissionConflicts({ fecha_inicio: '2027-01-04', fecha_fin: '2027-01-05' }, [shared])).toEqual([])
  })

  it('uses Madrid calendar days across daylight saving changes', () => {
    const spring = { ...shift, fecha_inicio: '2026-03-22T23:00:00Z', fecha_fin: '2026-03-29T22:00:00Z' }
    expect(permissionConflicts({ fecha_inicio: '2026-03-28', fecha_fin: '2026-03-30' }, [spring]))
      .toEqual([{ guardiaId: 3, desde: '2026-03-28', hasta: '2026-03-29' }])
  })

  it('removes highlighting after the requester is replaced while ignoring colleagues shifts', () => {
    const detail: GuardiaDetalle = { ...shift, delegacion_id: 8, estado: 'PLANIFICADA',
      Delegacion: { id: 8, nombre: 'Bilbao' }, Asignaciones: [{ id: 1, guardia_id: shift.id, usuario_id: 20, rol_guardia_id: 11,
        Usuario: { id: 20, nombre: 'Alex', apellidos: 'Prueba', email: 'demo@example.test', delegacion_id: 8 },
        RolGuardia: { id: 11, codigo: 'PRINCIPAL', nombre: 'Principal' } }] }
    expect(assignedPermissionConflicts(permission, [detail])).toHaveLength(1)
    const replacement = { ...detail, Asignaciones: detail.Asignaciones.map(a => ({ ...a, usuario_id: 21 })) }
    expect(assignedPermissionConflicts(permission, [replacement])).toEqual([])
    expect(assignedPermissionConflicts(permission, [{ ...detail, Asignaciones: [] }])).toEqual([])
  })

  it('ignores malformed and out-of-range query dates without passing invalid dates to the calendar', () => {
    for (const date of [null, '', '2026-02-30', '2026-13-01', '2026-11-03T00:00:00Z', '1999-12-31', '2101-01-01']) {
      expect(calendarDay(date)).toBeNull()
    }
    expect(calendarDay('2028-02-29')).toBe('2028-02-29')
  })
})
