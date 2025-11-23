import { Routes, Route, Navigate } from 'react-router-dom'
import { AppLayout } from './components/layout/AppLayout'
import { LoginPage } from './pages/LoginPage'
import { TechnicianDashboard } from './pages/TechnicianDashboard'
import { SupervisorDashboard } from './pages/SupervisorDashboard'
import { AdminDashboard } from './pages/AdminDashboard'

function App() {
  return (
    <Routes>
      <Route path="/" element={<LoginPage />} />

      <Route
        path="/tecnico"
        element={
          <AppLayout title="Panel de técnico" subtitle="Resumen de tus guardias y vacaciones.">
            <TechnicianDashboard />
          </AppLayout>
        }
      />

      <Route
        path="/supervisor"
        element={
          <AppLayout title="Panel de supervisor" subtitle="Guardias y permisos de tu delegación.">
            <SupervisorDashboard />
          </AppLayout>
        }
      />

      <Route
        path="/admin"
        element={
          <AppLayout
            title="Panel de administración"
            subtitle="Gestión de usuarios, delegaciones y permisos."
          >
            <AdminDashboard />
          </AppLayout>
        }
      />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
