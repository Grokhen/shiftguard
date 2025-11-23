import { Link } from 'react-router-dom'

export function TechnicianDashboard() {
  const nextShift = {
    fecha: 'Viernes, 14 marzo 2025',
    horario: '18:00 — 08:00',
    delegacion: 'Delegación Norte',
    rol: 'PRINCIPAL',
    estado: 'PUBLICADA',
  }

  const vacacionesAprobadas = [{ id: 1, rango: '01/08/2025 — 15/08/2025', tipo: 'Vacaciones' }]

  const vacacionesPendientes = [
    { id: 2, rango: '02/05/2025 — 05/05/2025', tipo: 'Asuntos propios' },
  ]

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-900 sm:text-base">
            Tu siguiente guardia
          </h2>
          <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">
            {nextShift.estado}
          </span>
        </div>

        <div className="space-y-1 text-sm">
          <p className="font-medium text-slate-900">{nextShift.fecha}</p>
          <p className="text-slate-600">{nextShift.horario}</p>
          <p className="text-slate-500">
            {nextShift.delegacion} · Rol: {nextShift.rol}
          </p>
        </div>

        <div className="mt-4">
          <Link
            to="/guardias/mias"
            className="text-sm font-medium text-blue-600 hover:text-blue-700"
          >
            Ver todas mis guardias →
          </Link>
        </div>
      </section>

      {}
      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <h3 className="mb-3 text-sm font-semibold text-slate-900 sm:text-base">
            Vacaciones / permisos aprobados
          </h3>
          {vacacionesAprobadas.length === 0 ? (
            <p className="text-sm text-slate-500">No tienes vacaciones ni permisos aprobados.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {vacacionesAprobadas.map((v) => (
                <li
                  key={v.id}
                  className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2"
                >
                  <span className="text-slate-700">{v.rango}</span>
                  <span className="text-xs font-medium text-slate-500">{v.tipo}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <h3 className="mb-3 text-sm font-semibold text-slate-900 sm:text-base">
            Pendiente de aprobación
          </h3>
          {vacacionesPendientes.length === 0 ? (
            <p className="text-sm text-slate-500">No tienes solicitudes pendientes.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {vacacionesPendientes.map((v) => (
                <li
                  key={v.id}
                  className="flex items-center justify-between rounded-lg bg-amber-50 px-3 py-2"
                >
                  <div>
                    <p className="text-slate-800">{v.rango}</p>
                    <p className="text-xs text-slate-500">{v.tipo}</p>
                  </div>
                  <span className="text-xs font-medium text-amber-700">PENDIENTE</span>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-3">
            <Link
              to="/permisos/mios"
              className="text-xs font-medium text-blue-600 hover:text-blue-700"
            >
              Ver todos mis permisos →
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
