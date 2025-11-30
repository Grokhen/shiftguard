import React, { useEffect, useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import {
  getDelegaciones,
  actualizarDelegacion,
  type Delegacion,
} from '../../services/delegacionesService'

type DelegacionEditModalProps = {
  delegacion: Delegacion
  accessToken: string
  onClose: () => void
  onUpdated: (updated: Delegacion) => void
}

function DelegacionEditModal({
  delegacion,
  accessToken,
  onClose,
  onUpdated,
}: DelegacionEditModalProps) {
  const [nombre, setNombre] = useState(delegacion.nombre)
  const [codigo, setCodigo] = useState(delegacion.codigo ?? '')
  const [paisCode, setPaisCode] = useState(delegacion.pais_code)
  const [regionCode, setRegionCode] = useState(delegacion.region_code)
  const [activo, setActivo] = useState(delegacion.activo)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)

    try {
      const payload: Parameters<typeof actualizarDelegacion>[2] = {
        nombre: nombre.trim(),
        codigo: codigo.trim() === '' ? null : codigo.trim(),
        pais_code: paisCode.trim(),
        region_code: regionCode.trim(),
        activo,
      }

      const updated = await actualizarDelegacion(accessToken, delegacion.id, payload)
      onUpdated(updated)
      onClose()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al guardar cambios'
      setError(message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-4 shadow-lg sm:p-6">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900 sm:text-lg">Editar delegación</h2>
            <p className="text-xs text-slate-500 sm:text-sm">
              Modifica los datos de la delegación y guarda los cambios.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
          >
            <span className="sr-only">Cerrar</span>✕
          </button>
        </div>

        {error && (
          <div className="mb-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 sm:text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="block text-xs font-medium text-slate-700">Nombre</label>
              <input
                type="text"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-medium text-slate-700">Código (opcional)</label>
              <input
                type="text"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
                placeholder="Ej: MAD_NORTE"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="block text-xs font-medium text-slate-700">País (código)</label>
              <input
                type="text"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                value={paisCode}
                onChange={(e) => setPaisCode(e.target.value)}
                required
                placeholder="Ej: ES"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-medium text-slate-700">Región (código)</label>
              <input
                type="text"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                value={regionCode}
                onChange={(e) => setRegionCode(e.target.value)}
                required
                placeholder="Ej: MAD"
              />
            </div>
          </div>

          <div className="flex items-center justify-between gap-4">
            <label className="flex items-center gap-2 text-xs text-slate-700 sm:text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                checked={activo}
                onChange={(e) => setActivo(e.target.checked)}
              />
              Delegación activa
            </label>
          </div>

          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 sm:text-sm"
              disabled={saving}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-60 sm:text-sm"
              disabled={saving}
            >
              {saving ? 'Guardando…' : 'Guardar cambios'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export function AdminDelegacionesPage() {
  const { accessToken } = useAuth()
  const [delegaciones, setDelegaciones] = useState<Delegacion[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [editingDelegacion, setEditingDelegacion] = useState<Delegacion | null>(null)

  useEffect(() => {
    if (!accessToken) return

    async function loadData(token: string) {
      setLoading(true)
      setError(null)
      try {
        const data = await getDelegaciones(token)
        setDelegaciones(data)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Error al cargar delegaciones'
        setError(message)
      } finally {
        setLoading(false)
      }
    }

    loadData(accessToken)
  }, [accessToken])

  function handleDelegacionUpdated(updated: Delegacion) {
    setDelegaciones((prev) => prev.map((d) => (d.id === updated.id ? updated : d)))
  }

  if (!accessToken) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-500 shadow-sm">
        No hay token de acceso. Vuelve a iniciar sesión.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-900 sm:text-base">Delegaciones</h2>
          {loading && <span className="text-xs text-slate-500 sm:text-sm">Cargando…</span>}
        </div>

        {error && (
          <div className="mb-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 sm:text-sm">
            {error}
          </div>
        )}

        {!loading && delegaciones.length === 0 && !error && (
          <p className="text-sm text-slate-500">No hay delegaciones registradas por el momento.</p>
        )}

        {delegaciones.length > 0 && (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
                  <th className="px-3 py-2 font-medium">Nombre</th>
                  <th className="px-3 py-2 font-medium">Código</th>
                  <th className="px-3 py-2 font-medium">País</th>
                  <th className="px-3 py-2 font-medium">Región</th>
                  <th className="px-3 py-2 font-medium">Estado</th>
                  <th className="px-3 py-2 font-medium text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {delegaciones.map((deleg) => (
                  <tr
                    key={deleg.id}
                    className="border-b border-slate-100 text-xs text-slate-700 last:border-0 sm:text-sm"
                  >
                    <td className="px-3 py-2">{deleg.nombre}</td>
                    <td className="px-3 py-2">{deleg.codigo ?? '-'}</td>
                    <td className="px-3 py-2">{deleg.pais_code}</td>
                    <td className="px-3 py-2">{deleg.region_code}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium sm:text-xs ${
                          deleg.activo
                            ? 'bg-green-50 text-green-700'
                            : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {deleg.activo ? 'Activa' : 'Inactiva'}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => setEditingDelegacion(deleg)}
                        className="text-xs font-medium text-blue-600 hover:text-blue-700 hover:underline sm:text-sm"
                      >
                        Editar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {editingDelegacion && accessToken && (
        <DelegacionEditModal
          delegacion={editingDelegacion}
          accessToken={accessToken}
          onClose={() => setEditingDelegacion(null)}
          onUpdated={handleDelegacionUpdated}
        />
      )}
    </div>
  )
}
