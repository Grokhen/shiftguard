# ShiftGuard - Resumen de traspaso

Este documento resume el estado actual de ShiftGuard para continuar el trabajo en una nueva conversacion sin perder contexto.

## Objetivo de la aplicacion

ShiftGuard es una aplicacion interna para coordinar guardias tecnicas y gestionar permisos de personas tecnicas entre delegaciones.

## Problema que resuelve

La aplicacion centraliza:

- planificacion de guardias por delegacion;
- asignacion de tecnicos a guardias con roles de guardia;
- solicitud y aprobacion de permisos como vacaciones, bajas, asuntos propios o formacion;
- gestion administrativa de usuarios, roles, delegaciones y equipos.

## Tipo de usuarios

- Tecnicos: consultan sus guardias y solicitan permisos.
- Supervisores: gestionan guardias, revisan equipos y deciden solicitudes de permisos de su delegacion.
- Administradores: gestionan usuarios, roles, delegaciones, equipos y miembros.

## Roles existentes

Roles de usuario sembrados por el seed:

- `TECNICO`
- `SUPERVISOR`
- `ADMIN`

Roles de guardia sembrados por el seed:

- `PRINCIPAL`
- `SECUNDARIO`

Decision tomada: el frontend no debe depender de IDs numericos sembrados. Para roles de usuario usa `roleCode` en el JWT. Para roles de guardia consulta los roles desde backend y trabaja por codigo.

## Funcionalidades principales

- Login con JWT.
- Rutas protegidas por autenticacion, rol y delegacion.
- Dashboard de tecnico:
  - consulta de guardias propias;
  - consulta de permisos propios;
  - solicitud de permisos.
- Dashboard de supervisor:
  - consulta de guardias activas;
  - consulta de equipos;
  - consulta y decision de permisos pendientes;
  - creacion de guardias con asignaciones.
- Panel de administrador:
  - gestion de usuarios;
  - gestion de delegaciones;
  - gestion de equipos y miembros.
- Seed inicial con roles de usuario, tipos de permiso, estados de permiso, roles de guardia, delegacion inicial y usuario admin.

## MVP definido

El MVP actual cubre:

- autenticacion basica;
- separacion de experiencia por rol;
- gestion administrativa basica;
- creacion y consulta de guardias;
- asignacion de tecnicos a guardias;
- solicitud y decision de permisos;
- persistencia en PostgreSQL con Prisma;
- CI basico para tests backend, build backend, lint frontend y build frontend.

## Funcionalidades dejadas para futuras versiones

- Tests de integracion backend contra PostgreSQL real.
- Tests frontend y E2E.
- OpenAPI o documentacion formal de endpoints.
- Refresh tokens o estrategia de sesion mas completa.
- Recuperacion de password.
- Auditoria de acciones administrativas y decisiones sensibles.
- Notificaciones.
- Calendario avanzado de guardias y permisos.
- Reglas complejas de disponibilidad.
- Constraints o estrategia fuerte contra solapes concurrentes de guardias a nivel de base de datos.
- Despliegue completo con backend/frontend, no solo base de datos local.

## Stack tecnologico elegido

- Monorepo con npm workspaces.
- Node fijado con `.nvmrc` en `22.12.0`.
- Backend:
  - Node.js;
  - TypeScript;
  - Express 5;
  - Prisma;
  - PostgreSQL;
  - Zod;
  - JWT;
  - Argon2;
  - Helmet;
  - CORS;
  - Morgan;
  - Vitest y Supertest para tests.
- Frontend:
  - React 19;
  - Vite 7;
  - TypeScript;
  - React Router 7;
  - Tailwind CSS.
- Calidad/CI:
  - TypeScript;
  - ESLint;
  - Prettier;
  - GitHub Actions en `.github/workflows/ci.yml`.
- Infra local:
  - `docker-compose.yml` levanta PostgreSQL.

## Arquitectura propuesta y actual

Arquitectura actual:

- API REST Express en `apps/backend`.
- SPA React/Vite en `apps/frontend`.
- Persistencia mediante Prisma y PostgreSQL.
- Routers backend separados por dominio.
- Servicios frontend por recurso API.
- Estado de autenticacion frontend en `AuthProvider`.
- App Express separada en `apps/backend/src/app.ts`; `server.ts` solo levanta el listener.

Patron actual:

- Backend con routers de dominio que contienen validacion, autorizacion, acceso a datos y logica de negocio.
- Autorizacion compartida extraida a `apps/backend/src/utils/authz.ts`.
- No existe todavia una capa formal de servicios/casos de uso/repositorios.

Direccion recomendada:

- Mantener cambios pequenos.
- Extraer logica compartida solo cuando reduzca duplicacion real o mejore seguridad.
- Antes de introducir una arquitectura mas pesada, cubrir flujos criticos con tests.

## Estructura de carpetas

- `apps/backend`: API Express, Prisma, config, middlewares, routers, seed y tests.
- `apps/backend/prisma`: schema y migraciones.
- `apps/backend/src/app.ts`: construccion de la app Express importable en tests.
- `apps/backend/src/server.ts`: arranque HTTP de produccion/desarrollo.
- `apps/backend/src/config`: variables de entorno.
- `apps/backend/src/middlewares`: auth y error handler.
- `apps/backend/src/modules`: routers por dominio.
- `apps/backend/src/utils`: helpers compartidos, actualmente autorizacion.
- `apps/backend/tests`: tests backend con Vitest/Supertest y mocks.
- `apps/frontend`: SPA React/Vite.
- `apps/frontend/src/pages`: pantallas por rol y paginas admin.
- `apps/frontend/src/services`: cliente API y servicios por recurso.
- `apps/frontend/src/context`: autenticacion.
- `apps/frontend/src/components`: layout y rutas protegidas.
- `apps/frontend/src/constants`: codigos de rol.
- `apps/frontend/src/utils`: utilidades de fecha y JWT.
- `.github/workflows`: CI.
- `docs`: documentacion de proyecto y traspaso.

## Modelo de datos / entidades principales

Entidades Prisma principales:

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

Relaciones importantes:

- Un usuario pertenece a una delegacion y tiene un rol.
- Un equipo pertenece a una delegacion.
- `MiembroEquipo` une usuarios y equipos.
- Un permiso pertenece a un usuario, tipo y estado.
- Una guardia pertenece a una delegacion.
- `AsignacionGuardia` une guardia, usuario y rol de guardia.

## Decisiones tecnicas tomadas

- Mantener monorepo npm workspaces.
- Usar Prisma como ORM y fuente del modelo de datos.
- Usar Zod para validar entradas en backend.
- Usar Argon2 con `AUTH_PEPPER` para passwords.
- Usar JWT con expiracion corta.
- Incluir `roleCode` en el JWT para que frontend no dependa de IDs de roles de usuario.
- Consultar roles de guardia desde backend para evitar IDs hardcodeados en frontend.
- No devolver `password_hash` en respuestas API.
- Corregir rutas `/api/usuarios/me` antes de `/:id`.
- Centralizar helpers de autorizacion en `apps/backend/src/utils/authz.ts`.
- Crear guardias con asignaciones en una sola llamada y dentro de una transaccion.
- Usar `CORS_ORIGIN` opcional para restringir CORS por entorno.
- Mantener `PORT` opcional con default `3001`.
- Separar `app.ts` de `server.ts` para testear Express sin levantar el listener de aplicacion.
- Usar Vitest y Supertest para tests backend.
- Los tests backend actuales mockean Prisma y Argon2; no requieren PostgreSQL.
- CI usa Node 22 y ejecuta tests/build/lint.
- `.nvmrc` fija Node `22.12.0`; `package.json` declara engines `node: ^20.19.0 || >=22.12.0` y `npm: >=10`.
- Mantener cambios en PRs pequenas y verificables.

## Decisiones pendientes

- Estrategia de tests de integracion backend con PostgreSQL real.
- Framework y estrategia de tests frontend/E2E.
- Estrategia para refresh tokens o renovacion de sesion.
- Politica de bloqueo por intentos fallidos.
- Politica definitiva de CORS en produccion.
- Estrategia fuerte contra solapes concurrentes de guardias.
- Si se introduce capa de servicios/casos de uso.
- Si se documentan endpoints con OpenAPI.
- Como gestionar auditoria de acciones.
- Si `estado` de guardia debe seguir como string, enum o tabla.

## Riesgos tecnicos

- La logica de negocio sigue bastante mezclada con routers.
- Falta cobertura de integracion contra PostgreSQL real.
- Falta cobertura frontend/E2E.
- La prevencion de solapes de guardia vive principalmente en codigo de aplicacion.
- Algunas operaciones de permisos y guardias todavia necesitan edge cases con base real.
- `npm ci`/`npm audit` reportan vulnerabilidades existentes en dependencias; no ejecutar `npm audit fix` a ciegas.
- `packages/*` esta declarado en workspaces, pero no hay paquetes compartidos.

## Riesgos de seguridad

- JWT se guarda en `localStorage`, sensible ante XSS.
- No hay refresh token ni invalidacion de tokens emitidos.
- Login rechaza usuarios inactivos/bloqueados, pero aun no gestiona intentos fallidos ni bloqueo automatico.
- Seed puede usar password admin por defecto si no se define `SEED_ADMIN_PASSWORD`.
- Falta auditoria de acciones administrativas y decisiones de permisos.
- Falta revisar dependencias vulnerables con criterio.

## Buenas practicas acordadas

- No instalar dependencias sin permiso explicito.
- No tocar migraciones salvo que sea necesario.
- No modificar secretos ni crear `.env` con valores reales.
- Mantener cambios pequenos y justificados.
- Usar `rg` para buscar.
- Usar `apply_patch` para editar archivos manualmente.
- No revertir cambios ajenos.
- Ejecutar tests/build/lint segun el area tocada.
- Trabajar con ramas y commits frecuentes.
- Evitar exponer datos sensibles.
- Preferir codigos estables frente a IDs sembrados.
- No ejecutar `npm audit fix` sin revisar impacto.

## Estado actual de implementacion

Estado Git al preparar este traspaso:

- `origin/main` contiene hasta `Merge pull request #12 from Grokhen/codex/pin-node-version`.
- Rama local actual: `codex/update-agent-guidance`.
- La rama actual contiene `docs: update agent project guidance` y este refresh de traspaso si se commitea.
- Worktree usado para esta actualizacion: sin cambios de codigo de aplicacion.

PRs/tandas ya fusionadas en `main`:

- `codex/recommendations-hardening`: hardening inicial de auth, usuarios y roles por codigo.
- `codex/guard-role-and-authz-cleanup`: roles de guardia por codigo, guardias atomicas con asignaciones, authz compartida y CORS configurable.
- `codex/backend-tests-foundation`: base de tests backend.
- `codex/add-ci-workflow`: CI.
- `codex/backend-admin-tests`: tests de catalogos admin y equipos.
- `codex/backend-admin-mutation-tests`: tests de mutaciones admin y edge cases de permisos.
- `codex/backend-team-permission-tests`: tests de miembros de equipo y permisos por equipo.
- `codex/pin-node-version`: `.nvmrc`, engines y docs de Node.

Cobertura backend actual:

- 45 tests con Vitest/Supertest.
- Login correcto, credenciales invalidas, usuario inactivo y usuario bloqueado.
- Token requerido, token invalido y usuario autenticado sin `password_hash`.
- Autorizacion admin-only.
- Autorizacion supervisor/admin.
- Aislamiento por delegacion en guardias, equipos y permisos.
- Creacion de guardias con asignaciones en transaccion.
- Rechazo de solapes, usuarios de otra delegacion y roles de guardia repetidos.
- Solicitud y decision de permisos.
- Edge cases de permisos no pendientes, estado pendiente, estados/tipos inexistentes y permiso inexistente.
- Mutaciones admin de delegaciones, roles y equipos.
- Miembros de equipo y permisos por equipo.

## Archivos importantes creados o modificados

Creados o especialmente importantes:

- `AGENTS.md`
- `.nvmrc`
- `.github/workflows/ci.yml`
- `docs/project-summary.md`
- `docs/next-steps.md`
- `apps/backend/src/app.ts`
- `apps/backend/src/utils/authz.ts`
- `apps/backend/tests/auth-and-authz.test.ts`
- `apps/backend/tests/setupEnv.ts`
- `apps/backend/vitest.config.mts`

Modificados en las tandas recientes:

- `package.json`
- `package-lock.json`
- `README.md`
- `apps/backend/package.json`
- `apps/backend/package-lock.json`
- `apps/backend/src/config/env.ts`
- `apps/backend/src/server.ts`
- `apps/backend/src/middlewares/authRequired.ts`
- `apps/backend/src/middlewares/errorHandler.ts`
- `apps/backend/src/modules/auth/router.ts`
- `apps/backend/src/modules/usuarios/router.ts`
- `apps/backend/src/modules/delegaciones/router.ts`
- `apps/backend/src/modules/equipos/router.ts`
- `apps/backend/src/modules/guardias/router.ts`
- `apps/backend/src/modules/permisos/router.ts`
- `apps/backend/src/modules/rolesUsuario/router.ts`
- `apps/frontend/src/constants/roles.ts`
- `apps/frontend/src/utils/jwt.ts`
- `apps/frontend/src/components/routing/ProtectedRoute.tsx`
- `apps/frontend/src/components/layout/AppLayout.tsx`
- `apps/frontend/src/pages/LoginPage.tsx`
- `apps/frontend/src/pages/SupervisorDashboard.tsx`
- `apps/frontend/src/services/apiClient.ts`
- `apps/frontend/src/services/authService.ts`
- `apps/frontend/src/services/guardiasService.ts`

## Comandos de instalacion y ejecucion

Usar primero la version de Node del proyecto:

```sh
nvm use
```

Instalacion:

```sh
npm install
```

Base de datos local:

```sh
docker compose up -d
```

Backend:

```sh
cd apps/backend
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
npm run dev
npm run build
npm run test
```

Frontend:

```sh
cd apps/frontend
npm run dev
npm run lint
npm run build
```

Comandos desde raiz:

```sh
npm run dev:backend
npm run dev:frontend
npm run build:backend
npm run build:frontend
npm run lint:frontend
npm run build
npm run lint
npm run test --workspace backend
```

CI:

```sh
npm ci
npm run test --workspace backend
npm run build:backend
npm run lint:frontend
npm run build:frontend
```

## Verificacion ejecutada recientemente

En las ultimas tandas se ejecuto:

```sh
npm run test --workspace backend
npm run build:backend
npm run lint:frontend
npm run build:frontend
```

Resultado: correcto. El build frontend bajo Node `20.11.1` avisaba por version, pero el proyecto ya fija `.nvmrc` en `22.12.0`.

Avisos conocidos:

- `baseline-browser-mapping` y Browserslist reportan datos antiguos.
- `npm ci`/`npm audit` reportan vulnerabilidades existentes.

## Estado de AGENTS.md

`AGENTS.md` existe y esta alineado con las decisiones actuales:

- no instalar dependencias sin permiso;
- trabajar con cambios pequenos;
- usar Node segun `.nvmrc`;
- no ejecutar `npm audit fix` sin revisar;
- revisar auth, roles, delegacion y Prisma antes de tocar logica sensible;
- usar `authz.ts` para autorizacion compartida;
- evitar IDs hardcodeados de roles;
- mantener guardias/asignaciones en transaccion cuando se escriban juntas.

No se proponen cambios adicionales en `AGENTS.md` en este traspaso.

## Siguiente tarea recomendada

Antes de nuevas funcionalidades, elegir explicitamente una de estas lineas:

1. Tests de integracion backend con PostgreSQL real para auth, guardias y permisos.
2. Robustez de guardias: estrategia contra solapes concurrentes y validacion de fechas/zonas horarias.
3. Seguridad de sesion: refresh tokens, expiracion/logout, intentos fallidos y bloqueo automatico.
4. Auditoria: registrar quien crea/modifica guardias, decide permisos y cambia usuarios.

Recomendacion pragmatica: empezar por tests de integracion backend con PostgreSQL real o por robustez de guardias, porque protegen reglas criticas antes de refactorizar o ampliar funcionalidad.
