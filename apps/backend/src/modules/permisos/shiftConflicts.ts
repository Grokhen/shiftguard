import { prisma } from '../../prisma'
import { permissionShiftRange } from '../../utils/shiftCalendar'

type RequestPeriod = { usuario_id: number; delegacion_id: number; fecha_inicio: string; fecha_fin: string }

// One bounded batch query for the inbox, also used for single-request preflight.
// Recompute from current assignments so calendar edits cannot leave stale flags.
export async function permissionShiftConflicts(periods: RequestPeriod[]) {
  if (!periods.length) return []
  const ranges = periods.map(p => ({ ...p, ...permissionShiftRange(p.fecha_inicio, p.fecha_fin) }))
  const assignments = await prisma.asignacionGuardia.findMany({
    where: { OR: ranges.map(p => ({ usuario_id: p.usuario_id, Guardia: {
      delegacion_id: p.delegacion_id, fecha_inicio: { lt: p.hasta }, fecha_fin: { gt: p.desde },
    } })) },
    select: { usuario_id: true, Guardia: { select: { id: true, delegacion_id: true, fecha_inicio: true, fecha_fin: true } } },
  })
  return ranges.map(p => assignments.filter(a => a.usuario_id === p.usuario_id &&
    a.Guardia.delegacion_id === p.delegacion_id && a.Guardia.fecha_inicio < p.hasta && a.Guardia.fecha_fin > p.desde)
    .map(a => ({ id: a.Guardia.id, fecha_inicio: a.Guardia.fecha_inicio, fecha_fin: a.Guardia.fecha_fin })))
}
