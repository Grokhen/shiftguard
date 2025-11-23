import { Link } from 'react-router-dom'

export function SupervisorDashboard() {
  const tecnicosDeGuardia = [
    { id: 1, nombre: 'Laura Pérez', rolGuardia: 'PRINCIPAL' },
    { id: 2, nombre: 'Carlos López', rolGuardia: 'SECUNDARIO' },
  ]

  const permisosActivos = [
    {
      id: 1,
      nombre: 'Ana Martínez',
      tipo: 'Vacaciones',
      rango: '10/04/2025 — 20/04/2025',
    },
  ]

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-900 sm:text-base">
            Técnicos de guardia hoy
          </h2>
          <Link to="/guardias" className="text-xs font-medium text-blue-600 hover:text-blue-700">
            Ver próximas guardias →
          </Link>
        </div>

        {tecnicosDeGuardia.length === 0 ? (
          <p className="text-sm text-slate-500">No hay guardias activas en tu delegación.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {tecnicosDeGuardia.map((tec) => (
              <li
                key={tec.id}
                className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2"
              >
                <span className="text-slate-800">{tec.nombre}</span>
                <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                  {tec.rolGuardia}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-900 sm:text-base">
            Permisos y vacaciones activos
          </h2>
          <Link to="/permisos" className="text-xs font-medium text-blue-600 hover:text-blue-700">
            Ver listado completo →
          </Link>
        </div>

        {permisosActivos.length === 0 ? (
          <p className="text-sm text-slate-500">No hay permisos activos en tu delegación.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {permisosActivos.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2"
              >
                <div>
                  <p className="font-medium text-slate-800">{p.nombre}</p>
                  <p className="text-xs text-slate-500">
                    {p.tipo} · {p.rango}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
