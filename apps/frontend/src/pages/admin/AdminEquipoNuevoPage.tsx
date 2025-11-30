import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { getDelegaciones, type Delegacion } from '../../services/delegacionesService'
import { crearEquipo, type CrearEquipoInput } from '../../services/equiposService'

export function AdminEquipoNuevoPage() {
  const { accessToken } = useAuth()
  const navigate = useNavigate()

  const [delegaciones, setDelegaciones] = useState<Delegacion[]>([])
  const [loadingDelegaciones, setLoadingDelegaciones] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [nombreEquipo, setNombreEquipo] = useState('')
  const [delegacionId, setDelegacionId] = useState<number | ''>('')

  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!accessToken) return

    async function loadDelegaciones(token: string) {
      setLoadingDelegaciones(true)
      setError(null)

      try {
        const data = await getDelegaciones(token)
        setDelegaciones(data)
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Error al cargar delegaciones disponibles'
        setError(message)
      } finally {
        setLoadingDelegaciones(false)
      }
    }

    loadDelegaciones(accessToken)
  }, [accessToken])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!accessToken) {
      setError('No hay token de acceso. Vuelve a iniciar sesión.')
      return
    }

    if (!nombreEquipo.trim() || delegacionId === '') {
      setError('Nombre de equipo y delegación son obligatorios.')
      return
    }

    const payload: CrearEquipoInput = {
      nombre_equipo: nombreEquipo.trim(),
      delegacion_id: delegacionId,
    }

    setSaving(true)
    try {
      await crearEquipo(accessToken, payload)
      navigate('/admin/equipos')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al crear equipo'
      setError(message)
    } finally {
      setSaving(false)
    }
  }

  if (!accessToken) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-500 shadow-sm">
        No hay token de acceso. Vuelve a iniciar sesión.
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-xl">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <h2 className="mb-2 text-base font-semibold text-slate-900 sm:text-lg">Nuevo equipo</h2>
        <p className="mb-4 text-xs text-slate-500 sm:text-sm">
          Crea un nuevo equipo asignándolo a una delegación.
        </p>

        {error && (
          <div className="mb-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 sm:text-sm">
            {error}
          </div>
        )}

        {loadingDelegaciones ? (
          <p className="text-sm text-slate-500">Cargando delegaciones…</p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <label className="block text-xs font-medium text-slate-700">Nombre del equipo</label>
              <input
                type="text"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                value={nombreEquipo}
                onChange={(e) => setNombreEquipo(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-medium text-slate-700">Delegación</label>
              <select
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                value={delegacionId === '' ? '' : delegacionId}
                onChange={(e) =>
                  setDelegacionId(e.target.value === '' ? '' : Number(e.target.value))
                }
                required
              >
                <option value="">Selecciona una delegación</option>
                {delegaciones.map((deleg) => (
                  <option key={deleg.id} value={deleg.id}>
                    {deleg.nombre}
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => navigate('/admin/equipos')}
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
                {saving ? 'Creando…' : 'Crear equipo'}
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  )
}
