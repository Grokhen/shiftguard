import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { crearDelegacion, type CrearDelegacionInput } from '../../services/delegacionesService'

export function AdminDelegacionNuevaPage() {
  const { accessToken } = useAuth()
  const navigate = useNavigate()

  const [nombre, setNombre] = useState('')
  const [codigo, setCodigo] = useState('')
  const [paisCode, setPaisCode] = useState('')
  const [regionCode, setRegionCode] = useState('')
  const [activo, setActivo] = useState(true)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!accessToken) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-500 shadow-sm">
        No hay token de acceso. Vuelve a iniciar sesión.
      </div>
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!accessToken) {
      setError('No hay token de acceso. Vuelve a iniciar sesión.')
      return
    }

    if (!nombre.trim() || !paisCode.trim() || !regionCode.trim()) {
      setError('Nombre, país y región son obligatorios.')
      return
    }

    const payload: CrearDelegacionInput = {
      nombre: nombre.trim(),
      codigo: codigo.trim() === '' ? null : codigo.trim(),
      pais_code: paisCode.trim(),
      region_code: regionCode.trim(),
      activo,
    }

    setSaving(true)
    try {
      await crearDelegacion(accessToken, payload)
      navigate('/admin/delegaciones')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al crear delegación'
      setError(message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-xl">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <h2 className="mb-2 text-base font-semibold text-slate-900 sm:text-lg">Nueva delegación</h2>
        <p className="mb-4 text-xs text-slate-500 sm:text-sm">
          Crea una nueva delegación definiendo su código, país y región.
        </p>

        {error && (
          <div className="mb-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 sm:text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
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
              onClick={() => navigate('/admin/delegaciones')}
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
              {saving ? 'Creando…' : 'Crear delegación'}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}
