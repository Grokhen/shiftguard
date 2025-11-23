import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

interface AppLayoutProps {
  children: ReactNode
  title?: string
  subtitle?: string
}

export function AppLayout({ children, title, subtitle }: AppLayoutProps) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link to="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-white font-semibold">
              SG
            </div>
            <span className="font-semibold text-slate-900">ShiftGuard</span>
          </Link>

          <div className="flex items-center gap-3 text-sm text-slate-500">
            <span className="hidden sm:inline">Usuario</span>
            <div className="h-8 w-8 rounded-full bg-slate-200" />
          </div>
        </div>
      </header>

      <main className="flex-1">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-6">
          {(title || subtitle) && (
            <div className="flex flex-col gap-1">
              {title && (
                <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">{title}</h1>
              )}
              {subtitle && <p className="text-sm text-slate-500 sm:text-base">{subtitle}</p>}
            </div>
          )}

          {children}
        </div>
      </main>
    </div>
  )
}
