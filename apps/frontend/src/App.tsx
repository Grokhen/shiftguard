import { Routes, Route, Navigate } from 'react-router-dom'
import { AppLayout } from './components/layout/AppLayout'
import { LoginPage } from './pages/LoginPage'
import { TechnicianDashboard } from './pages/TechnicianDashboard'
import { SupervisorDashboard } from './pages/SupervisorDashboard'
import { AdminDashboard } from './pages/admin/AdminDashboard'
import { AdminUsuariosPage } from './pages/admin/AdminUsuariosPage'
import { AdminUsuarioNuevoPage } from './pages/admin/AdminUsuarioNuevoPage'
import { AdminDelegacionesPage } from './pages/admin/AdminDelegacionesPage'
import { AdminDelegacionNuevaPage } from './pages/admin/AdminDelegacionNuevaPage'
import { AdminEquiposPage } from './pages/admin/AdminEquiposPage'
import { AdminEquipoNuevoPage } from './pages/admin/AdminEquipoNuevoPage'
import { ProtectedRoute } from './components/routing/ProtectedRoute'
import { ROLE_TECNICO, ROLE_SUPERVISOR, ROLE_ADMIN } from './constants/roles'

function App() {
  return (
    <Routes>
      <Route path="/" element={<LoginPage />} />

      <Route
        path="/tecnico"
        element={
          <ProtectedRoute allowedRoles={[ROLE_TECNICO]}>
            <AppLayout title="Panel de técnico" subtitle="Resumen de tus guardias y vacaciones.">
              <TechnicianDashboard />
            </AppLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/supervisor"
        element={
          <ProtectedRoute allowedRoles={[ROLE_SUPERVISOR]}>
            <AppLayout title="Panel de supervisor" subtitle="Guardias y permisos de tu delegación.">
              <SupervisorDashboard />
            </AppLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin"
        element={
          <ProtectedRoute allowedRoles={[ROLE_ADMIN]}>
            <AppLayout
              title="Panel de administración"
              subtitle="Gestión de usuarios, delegaciones y permisos."
            >
              <AdminDashboard />
            </AppLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin/usuarios"
        element={
          <ProtectedRoute allowedRoles={[ROLE_ADMIN]}>
            <AppLayout title="Usuarios" subtitle="Gestión de cuentas de usuario">
              <AdminUsuariosPage />
            </AppLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin/usuarios/nuevo"
        element={
          <ProtectedRoute allowedRoles={[ROLE_ADMIN]}>
            <AppLayout title="Nuevo usuario" subtitle="Alta de un nuevo usuario en el sistema">
              <AdminUsuarioNuevoPage />
            </AppLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin/delegaciones"
        element={
          <ProtectedRoute allowedRoles={[ROLE_ADMIN]}>
            <AppLayout title="Delegaciones" subtitle="Gestión de delegaciones">
              <AdminDelegacionesPage />
            </AppLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin/delegaciones/nueva"
        element={
          <ProtectedRoute allowedRoles={[ROLE_ADMIN]}>
            <AppLayout title="Nueva delegación" subtitle="Crear una nueva delegación en el sistema">
              <AdminDelegacionNuevaPage />
            </AppLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin/equipos"
        element={
          <ProtectedRoute allowedRoles={[ROLE_ADMIN]}>
            <AppLayout
              title="Panel de administración"
              subtitle="Gestión de usuarios, delegaciones y permisos."
            >
              <AdminEquiposPage />
            </AppLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin/equipos/nuevo"
        element={
          <ProtectedRoute allowedRoles={[ROLE_ADMIN]}>
            <AppLayout title="Nuevo equipo" subtitle="Crear un nuevo equipo en el sistema">
              <AdminEquipoNuevoPage />
            </AppLayout>
          </ProtectedRoute>
        }
      />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
