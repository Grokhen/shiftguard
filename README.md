# ShiftGuard

ShiftGuard es una plataforma interna para coordinar guardias técnicas y gestionar permisos (vacaciones, bajas, etc.) entre delegaciones. El monorepo contiene un backend Express + Prisma y un frontend React + Vite que consumen la misma API.

## Arquitectura general

| Capa | Descripción |
| ---- | ----------- |
| Backend | API REST construida con Express, Prisma y PostgreSQL. El punto de entrada es [apps/backend/src/server.ts](apps/backend/src/server.ts) e incluye módulos para autenticación, usuarios, delegaciones, equipos, guardias y permisos. |
| Frontend | SPA creada con Vite + React + TypeScript. El árbol de rutas principal está en [`App`](apps/frontend/src/App.tsx) y cada rol tiene dashboards específicos como [`TechnicianDashboard`](apps/frontend/src/pages/TechnicianDashboard.tsx) o [`SupervisorDashboard`](apps/frontend/src/pages/SupervisorDashboard.tsx). |

### Características destacadas

- Autenticación JWT y control de acceso por rol (ver [`auth/router`](apps/backend/src/modules/auth/router.ts)).
- Gestión de usuarios: creación desde [`AdminUsuarioNuevoPage`](apps/frontend/src/pages/admin/AdminUsuarioNuevoPage.tsx) y API en [`usuarios/router`](apps/backend/src/modules/usuarios/router.ts).
- Administración de delegaciones y equipos vía UI (por ejemplo [`AdminDelegacionesPage`](apps/frontend/src/pages/admin/AdminDelegacionesPage.tsx)) y rutas como [`delegaciones/router`](apps/backend/src/modules/delegaciones/router.ts).
- Planificación de guardias con asignaciones múltiples (`SupervisorDashboard` + [`guardiasService`](apps/frontend/src/services/guardiasService.ts)).
- Solicitud y aprobación de permisos (`TechnicianDashboard`, `SupervisorDashboard` y [`permisos/router`](apps/backend/src/modules/permisos/router.ts)).

## Requisitos previos

- Node.js `20.19+` o `22.12+` (ver [.nvmrc](.nvmrc))
- PostgreSQL 14+
- npm o pnpm (ejemplos usando `npm`)
- Docker opcional (ver [docker-compose.yml](docker-compose.yml))

## Instalación y dependencias

1. Clonar repositorio y preparar dependencias raíz (para husky, lint, etc. si aplica):
   ```sh
   git clone <repo>
   cd ShiftGuard
   npm install
   ```

2. Backend:
   ```sh
   cd apps/backend
   npm install
   ```
3. Frontend:
   ```sh
   cd apps/frontend
   npm install
   ```

## Configuración de entorno

### Backend (`apps/backend/.env`)
Variables requeridas según [`ENV`](apps/backend/src/config/env.ts):

| Variable | Descripción |
| -------- | ----------- |
| `DATABASE_URL` | Cadena de conexión de PostgreSQL. |
| `JWT_SECRET` | Clave para firmar tokens. |
| `AUTH_PEPPER` | Pepper usado junto a Argon2. |
| `PORT` | (Opcional) Puerto HTTP (por defecto 3001). |
| `CORS_ORIGIN` | (Opcional) Origen permitido por CORS. Si no se define, usa la configuración abierta por defecto de `cors`. |
| `SEED_ADMIN_PASSWORD` | Obligatoria al ejecutar el seed: contraseña explícita de entre 12 y 128 caracteres. No es necesaria para arrancar la API. |

### Frontend (`apps/frontend/.env.local`)
- `VITE_API_BASE_URL=http://localhost:3001` (ver [apps/frontend/src/config.ts](apps/frontend/src/config.ts)).

## Migraciones y datos iniciales

Desde `apps/backend`:

```sh
npm run prisma:generate
npx prisma migrate deploy
npx prisma db seed
```

El seed crea roles, estados/tipos de permisos y un usuario admin (`admin@empresa.local` con la contraseña definida en `SEED_ADMIN_PASSWORD`). Valida `AUTH_PEPPER` y la contraseña antes de escribir, y aplica los datos en una transacción. No imprime contraseñas ni utiliza valores predeterminados. Si el admin ya existe, conserva sus credenciales; repetir el seed no sirve para restablecerlas. Ambos comandos de seed (`npx prisma db seed` y `npm run prisma:seed`) cargan el `.env` del directorio de trabajo.

## Ejecución en desarrollo

1. Backend (modo watch):
   ```sh
   cd apps/backend
   npm run dev
   ```
2. Frontend:
   ```sh
   cd apps/frontend
   npm run dev
   ```
3. Visita `http://localhost:5173` y autentícate con las credenciales seed.

## Scripts útiles

| Contexto | Comando | Descripción |
| -------- | ------- | ----------- |
| Backend | `npm run dev` | Levanta API con hot reload. |
| Backend | `npm run build` / `npm start` | Build y ejecución en producción. |
| Backend | `npx prisma studio` | UI para inspeccionar la base de datos. |
| Frontend | `npm run dev` | Dev server Vite. |
| Frontend | `npm run build` / `npm run preview` | Build y server previo a despliegue. |

*(Revisa los `package.json` correspondientes para comandos adicionales.)*

## Ejemplos de uso

### 1. Autenticación de usuario
```sh
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@empresa.local","password":"<contraseña configurada en el seed>"}'
```
La respuesta incluye `access_token` para consumir el resto de endpoints.

El login admite hasta 10 solicitudes por cuenta y 50 por IP en una ventana de 15 minutos por contador, incluidas las solicitudes correctas. Al superar un límite devuelve 429 y `Retry-After` en segundos. Los contadores caducan sin intervención y son locales al proceso: al reiniciarlo se pierden. Antes de desplegar varias instancias, configurar un límite compartido en la pasarela o un almacén común. Express usa la IP de la conexión; detrás de un proxy, todas sus peticiones comparten el límite de IP hasta configurar una política de proxies de confianza acorde con la infraestructura. No activar confianza indiscriminada en `X-Forwarded-For`.

### 2. Crear usuario desde la UI
- Inicia sesión como admin.
- Navega a `/admin/usuarios/nuevo`.
- Completa el formulario gestionado por [`AdminUsuarioNuevoPage`](apps/frontend/src/pages/admin/AdminUsuarioNuevoPage.tsx); la llamada se delega a [`crearUsuario`](apps/frontend/src/services/usuariosService.ts).

### 3. Planificar guardia (Supervisor)
- El formulario “Crear nueva guardia” en [`SupervisorDashboard`](apps/frontend/src/pages/SupervisorDashboard.tsx) crea la guardia y sus asignaciones en una sola llamada a `crearGuardia`, dentro de una transacción backend.
- Validaciones locales impiden asignar fechas inconsistentes o duplicar roles (ver lógica en `handleCrearGuardia`).

### 4. Solicitar y aprobar permisos
- Técnicos usan el formulario gestionado por [`handleSolicitarPermiso`](apps/frontend/src/pages/TechnicianDashboard.tsx) que llama a [`crearPermiso`](apps/frontend/src/services/permisosService.ts).
- Supervisores deciden solicitudes mediante `decidirPermiso` cuando usan la sección “Permisos pendientes de aprobación”.

## Estructura del monorepo (resumen)

```
apps/
  backend/   → API Express + Prisma
  frontend/  → React + Vite SPA
.vscode/     → Configuración del workspace
docker-compose.yml
package.json
```

## Resolución de problemas

- **`Falta variable de entorno`**: verifica que todas las claves listadas en [`ENV`](apps/backend/src/config/env.ts) estén pobladas.
- **Errores CORS**: confirma que `VITE_API_BASE_URL` apunte al host del backend y que éste tenga `cors()` habilitado (ya incluido en [server.ts](apps/backend/src/server.ts)).
- **Password mismatch al crear usuarios**: la UI valida coincidencia y longitud, pero el backend también exige `password` ≥ 8 caracteres según [`crearUsuarioSchema`](apps/backend/src/modules/usuarios/router.ts).

## Próximos pasos 

- Consultar la [primera tanda de estabilización](docs/estabilizacion-2026-09-05.md): los cambios de sesión requieren un nuevo login para tokens anteriores y están cubiertos por pruebas con persistencia simulada.
- Consultar la [protección del seed y del login](docs/estabilizacion-seed-login-2026-09-05.md), incluidos los límites de operación y las tareas pendientes.
- Añadir integración con PostgreSQL real y pruebas E2E; ejecutar las pruebas existentes con `npm run test --workspace backend`.
- Documentar endpoints detalladamente (OpenAPI) y publicar colección para QA.
- Revisar despliegue con Docker usando [docker-compose.yml](docker-compose.yml) para entornos homogéneos.
