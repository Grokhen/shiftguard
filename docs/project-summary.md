# ShiftGuard - Analisis del proyecto

Nota: este analisis se preparo a partir del repositorio remoto `Grokhen/shiftguard`, ya que la carpeta local estaba vacia en el momento de la revision.

## Resumen del proyecto

ShiftGuard parece ser una aplicacion interna para coordinar guardias tecnicas, equipos, delegaciones y permisos como vacaciones, bajas medicas, formacion y asuntos propios.

La aplicacion distingue tres perfiles principales:

- Tecnico: consulta sus guardias y solicita permisos.
- Supervisor: revisa guardias de su delegacion, consulta equipos y decide permisos.
- Administrador: gestiona usuarios, roles, delegaciones y equipos.

El proyecto esta organizado como un monorepo con una API REST en Express y una SPA en React.

## Stack detectado

- Monorepo con npm workspaces.
- Backend: Node.js, TypeScript, Express 5, Prisma, PostgreSQL, Zod, JWT, Argon2, Helmet, CORS y Morgan.
- Frontend: React 19, Vite 7, TypeScript, React Router 7 y Tailwind CSS.
- Base de datos: PostgreSQL con Prisma migrations.
- Calidad: TypeScript, ESLint y Prettier.
- Docker: `docker-compose.yml` levanta solo PostgreSQL.

## Estructura del repositorio

- `apps/backend`: API Express, configuracion, middlewares, routers por dominio, Prisma schema, migraciones y seed.
- `apps/backend/src/modules`: rutas de `auth`, `usuarios`, `delegaciones`, `equipos`, `guardias`, `permisos` y `rolesUsuario`.
- `apps/frontend`: aplicacion React/Vite.
- `apps/frontend/src/pages`: pantallas principales por rol y paginas de administracion.
- `apps/frontend/src/services`: cliente HTTP y servicios por recurso.
- `apps/frontend/src/context`: contexto de autenticacion.
- `apps/frontend/src/components`: layout y rutas protegidas.
- `apps/frontend/src/utils`: utilidades de fecha y JWT.
- `packages/*`: declarado como workspace, aunque no se detectaron paquetes.

## Como ejecutar el proyecto

Comandos detectados o inferidos:

```sh
npm install
docker compose up -d
```

Backend:

```sh
cd apps/backend
npm install
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
npm run dev
```

Frontend:

```sh
cd apps/frontend
npm install
npm run dev
```

Variables de entorno esperadas en backend:

- `DATABASE_URL`
- `JWT_SECRET`
- `AUTH_PEPPER`
- `PORT`
- `SEED_ADMIN_PASSWORD` opcional para el seed inicial

Variable esperada en frontend:

- `VITE_API_BASE_URL=http://localhost:3001`

Scripts detectados:

- Raiz: `dev:backend`, `build:backend`, `start:backend`, `dev:frontend`, `build:frontend`.
- Backend: `dev`, `build`, `start`, `test`, `prisma:generate`, `prisma:migrate`, `prisma:seed`.
- Frontend: `dev`, `build`, `lint`, `preview`.

Riesgo observado: los scripts raiz de backend apuntan a `--workspace=@app/backend`, pero el paquete backend se llama `backend`; probablemente esos scripts fallan hasta corregir el nombre del workspace.

## Arquitectura actual

La arquitectura es sencilla y directa:

- `apps/backend/src/server.ts` crea la app Express, aplica middlewares globales y monta routers bajo `/api`.
- Cada router contiene validacion de entrada, autorizacion, consultas Prisma y parte de la logica de negocio.
- No hay capa separada de servicios, casos de uso o repositorios.
- Prisma se expone como cliente global desde `apps/backend/src/prisma.ts`.
- `apps/frontend/src/main.tsx` monta React, `AuthProvider` y `BrowserRouter`.
- `apps/frontend/src/App.tsx` define rutas por rol usando `ProtectedRoute`.
- Los servicios frontend encapsulan las llamadas HTTP al backend.

Puntos de entrada principales:

- Backend: `apps/backend/src/server.ts`.
- Frontend: `apps/frontend/src/main.tsx`.
- Rutas frontend: `apps/frontend/src/App.tsx`.
- Prisma schema: `apps/backend/prisma/schema.prisma`.
- Seed: `apps/backend/src/prisma/seed.ts`.

## Modelo de datos / persistencia

La persistencia usa PostgreSQL mediante Prisma.

Entidades principales:

- `Delegacion`
- `RolUsuario`
- `Usuario`
- `Equipo`
- `MiembroEquipo`
- `TipoPermiso`
- `EstadoPermiso`
- `Permiso`
- `SaldoPermiso`
- `Guardia`
- `RolGuardia`
- `AsignacionGuardia`

El seed crea roles de usuario, tipos y estados de permiso, roles de guardia, una delegacion inicial y un usuario administrador.

Hay indices y claves unicas importantes para emails, codigos, equipos por delegacion, saldos por usuario/anio/tipo y asignaciones de guardia.

## Seguridad

Buenas practicas presentes:

- Password hashing con Argon2 y pepper.
- JWT con expiracion corta.
- Validacion de entrada con Zod.
- Helmet activado.
- Separacion basica por roles en backend.
- Restricciones de delegacion en varias rutas de equipos y guardias.

Riesgos detectados:

- Algunas respuestas pueden exponer `password_hash` al devolver entidades `Usuario` completas.
- El login no comprueba `activo`, `bloqueado_en`, `intentos_fallidos` ni `requiere_reset`.
- `POST /api/guardias` esta autenticado, pero no valida explicitamente supervisor/admin.
- La decision de permisos valida rol, pero debe revisarse que siempre limite por delegacion cuando el usuario no sea admin.
- `cors()` esta abierto a cualquier origen.
- El token se guarda en `localStorage`, lo que aumenta impacto ante XSS.
- El seed puede usar una password admin por defecto si no se define `SEED_ADMIN_PASSWORD`.
- El `errorHandler` usa `err.status`, mientras que varios routers asignan `statusCode`; algunos errores esperados podrian terminar como 500.

## Testing y calidad

No se detectaron tests automatizados.

Calidad disponible:

- Frontend: `npm run lint`.
- Frontend build: `tsc -b && vite build`.
- Backend build: `tsc -p tsconfig.json`.
- Backend test: placeholder que falla (`Error: no test specified`).
- Hay configuracion de ESLint y Prettier, pero no se detecto un script raiz unificado de lint/test.

Faltan tests especialmente para:

- Login y autenticacion.
- Autorizacion por rol.
- Aislamiento por delegacion.
- Creacion y modificacion de guardias.
- Solicitud y decision de permisos.
- Validacion de datos y errores.

## Riesgos antes de modificar

- Roles hardcodeados por ID en frontend (`1`, `2`, `3`), dependientes del seed.
- Roles de guardia hardcodeados por ID en `SupervisorDashboard`.
- Rutas `/api/usuarios/me` y `/api/usuarios/me/password` parecen estar definidas despues de `/:id`, lo que puede hacer que `/:id` las intercepte.
- Creacion de guardia y asignacion de tecnicos no es transaccional; puede quedar una guardia creada sin asignaciones.
- La actualizacion de guardia borra y recrea asignaciones sin transaccion.
- La prevencion de solapes de guardia vive en codigo de aplicacion, no como restriccion fuerte en base de datos.
- Hay duplicacion de helpers de autorizacion (`ensureAdmin`, `ensureSupervisorOrAdmin`, lookup de rol).
- El frontend espera `message` en errores, pero el backend suele devolver `{ error }`.
- No hay tests que protejan flujos criticos.

## Recomendaciones

Prioridad alta:

- Evitar que el backend devuelva `password_hash` en cualquier respuesta.
- Corregir el orden de rutas de `usuarios` para que `/me` y `/me/password` funcionen.
- Corregir scripts raiz de backend para usar el nombre real del workspace.
- Restringir creacion de guardias a supervisor/admin.
- Verificar delegacion al decidir permisos.
- Unificar formato de errores backend/frontend.

Prioridad media:

- Centralizar autorizacion por rol en helpers/middlewares reutilizables.
- Reemplazar IDs hardcodeados de roles por codigos o datos obtenidos del backend.
- Envolver operaciones compuestas de guardias en transacciones.
- Configurar CORS por entorno.
- Anadir checks de usuario activo/bloqueado en login.

Prioridad baja:

- Documentar endpoints con OpenAPI o similar.
- Crear scripts raiz unificados para `build`, `lint`, `test` y `typecheck`.
- Extraer logica compleja de dashboards frontend a hooks o componentes menores.

## Siguiente paso recomendado

La primera modificacion razonable seria preparar el terreno sin cambiar funcionalidad: anadir `AGENTS.md`, corregir scripts raiz y crear una base minima de verificacion. Despues, abordar el riesgo de seguridad mas claro: eliminar exposicion de `password_hash` y cubrirlo con pruebas de API.
