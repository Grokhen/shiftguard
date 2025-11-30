import { Link } from 'react-router-dom'

export function AdminDashboard() {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <section className="flex flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-2 text-sm font-semibold text-slate-900 sm:text-base">Usuarios</h2>
        <p className="mb-4 text-sm text-slate-500">
          Alta, baja y edición de usuarios, roles y delegaciones asignadas.
        </p>
        <div className="mt-auto flex flex-col gap-2 text-sm">
          <Link
            to="/admin/usuarios"
            className="rounded-lg bg-blue-600 px-3 py-2 text-center font-medium text-white hover:bg-blue-700"
          >
            Ver usuarios
          </Link>
          <Link
            to="/admin/usuarios/nuevo"
            className="rounded-lg border border-blue-100 px-3 py-2 text-center font-medium text-blue-600 hover:bg-blue-50"
          >
            Crear usuario
          </Link>
        </div>
      </section>

      <section className="flex flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-2 text-sm font-semibold text-slate-900 sm:text-base">Delegaciones</h2>
        <p className="mb-4 text-sm text-slate-500">
          Gestión de delegaciones y su estado (activo/inactivo).
        </p>
        <div className="mt-auto flex flex-col gap-2 text-sm">
          <Link
            to="/admin/delegaciones"
            className="rounded-lg bg-blue-600 px-3 py-2 text-center font-medium text-white hover:bg-blue-700"
          >
            Ver delegaciones
          </Link>
          <Link
            to="/admin/delegaciones/nueva"
            className="rounded-lg border border-blue-100 px-3 py-2 text-center font-medium text-blue-600 hover:bg-blue-50"
          >
            Crear delegación
          </Link>
        </div>
      </section>

      <section className="flex flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-2 text-sm font-semibold text-slate-900 sm:text-base">Equipos</h2>
        <p className="mb-4 text-sm text-slate-500">
          Creación y gestión de equipos, y asignación de usuarios.
        </p>
        <div className="mt-auto flex flex-col gap-2 text-sm">
          <Link
            to="/admin/equipos"
            className="rounded-lg bg-blue-600 px-3 py-2 text-center font-medium text-white hover:bg-blue-700"
          >
            Ver equipos
          </Link>
          <Link
            to="/admin/equipos/nuevo"
            className="rounded-lg border border-blue-100 px-3 py-2 text-center font-medium text-blue-600 hover:bg-blue-50"
          >
            Crear equipo
          </Link>
        </div>
      </section>
    </div>
  )
}
