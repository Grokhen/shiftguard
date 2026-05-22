# ShiftGuard - Resumen de traspaso

Este documento resume el estado del proyecto para poder continuar el trabajo en una nueva conversacion sin perder contexto.

## Objetivo de la aplicacion

ShiftGuard es una aplicacion interna para coordinar guardias tecnicas y gestionar permisos de personas tecnicas entre delegaciones.

## Problema que resuelve

La aplicacion busca centralizar:

- Planificacion de guardias por delegacion.
- Asignacion de tecnicos a guardias con roles de guardia.
- Solicitud y aprobacion de permisos como vacaciones, bajas, asuntos propios o formacion.
- Gestion administrativa de usuarios, roles, delegaciones y equipos.

## Tipo de usuarios

- Tecnicos: consultan sus guardias y solicitan permisos.
- Supervisores: gestionan guardias, revisan equipos y deciden solicitudes de permisos de su delegacion.
- Administradores: gestionan usuarios, delegaciones, equipos y roles.

## Roles existentes

Roles de usuario sembrados por el seed:

- `TECNICO`
- `SUPERVISOR`
- `ADMIN`

Roles de guardia sembrados por el seed:

- `PRINCIPAL`
- `SECUNDARIO`

Decision tomada: el frontend no debe depender de IDs numericos de roles. Para roles de usuario se usa `roleCode` en el JWT. Para roles de guardia se consultan desde backend por codigo.

## Funcionalidades principales

- Login con JWT.
- Rutas protegidas por rol.
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
- Seed inicial con roles, tipos de permiso, estados de permiso, roles de guardia, delegacion inicial y usuario admin.

## MVP definido

El MVP actual cubre:

- Autenticacion basica.
- Separacion de experiencia por rol.
- Gestion administrativa basica.
- Creacion y consulta de guardias.
- Asignacion de tecnicos a guardias.
- Solicitud y decision de permisos.
- Persistencia en PostgreSQL con Prisma.

## Funcionalidades dejadas para futuras versiones

- Ampliar tests automatizados de backend y anadir tests frontend/E2E.
- OpenAPI o documentacion formal de endpoints.
- Refresh tokens o estrategia de sesion mas completa.
- Recuperacion de password.
- Auditoria de acciones administrativas.
- Notificaciones.
- Calendario avanzado de guardias y permisos.
- Reglas complejas de disponibilidad.
- Constraints o estrategia fuerte contra solapes de guardias a nivel de base de datos.
- Despliegue completo con backend/frontend, no solo base de datos.

## Stack tecnologico elegido

- Monorepo con npm workspaces.
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
  - Morgan.
- Frontend:
  - React 19;
  - Vite 7;
  - TypeScript;
  - React Router 7;
  - Tailwind CSS.
- Base de datos:
  - PostgreSQL;
  - Prisma migrations.
- Calidad:
  - TypeScript;
  - ESLint;
  - Prettier.
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

Patron actual:

- Backend con routers de dominio que contienen validacion, autorizacion, acceso a datos y logica de negocio.
- Se empezo a extraer autorizacion compartida a `apps/backend/src/utils/authz.ts`.
- No existe todavia una capa formal de servicios/casos de uso/repositorios.

Direccion recomendada:

- Mantener cambios pequenos.
- Extraer logica compartida cuando reduzca duplicacion real.
- Antes de introducir una arquitectura mas pesada, cubrir flujos criticos con tests.

## Estructura de carpetas

- `apps/backend`: API Express, Prisma, config, middlewares, routers y seed.
- `apps/backend/prisma`: schema y migraciones.
- `apps/backend/src/config`: variables de entorno.
- `apps/backend/src/middlewares`: auth y error handler.
- `apps/backend/src/modules`: routers de dominios.
- `apps/backend/src/utils`: helpers compartidos, actualmente autorizacion.
- `apps/frontend`: SPA React/Vite.
- `apps/frontend/src/pages`: pantallas por rol y paginas admin.
- `apps/frontend/src/services`: cliente API y servicios por recurso.
- `apps/frontend/src/context`: autenticacion.
- `apps/frontend/src/components`: layout y rutas protegidas.
- `apps/frontend/src/constants`: codigos de rol.
- `apps/frontend/src/utils`: utilidades de fecha y JWT.
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
- Centralizar helpers de autorizacion en `apps/backend/src/utils/authz.ts`.
- Corregir rutas `/api/usuarios/me` antes de `/:id`.
- Crear guardias con asignaciones en una sola llamada y dentro de una transaccion.
- Usar `CORS_ORIGIN` opcional para restringir CORS por entorno.
- Mantener `PORT` opcional con default `3001`.
- Mantener los cambios en PRs pequenas y verificables.

## Decisiones pendientes

- Estrategia de tests de integracion backend con base de datos real.
- Framework de testing frontend/E2E.
- Estrategia para refresh tokens o renovacion de sesion.
- Politica de bloqueo por intentos fallidos.
- Politica de CORS en produccion.
- Estrategia definitiva para evitar solapes concurrentes de guardias.
- Si se introduce capa de servicios/casos de uso.
- Si se documentan endpoints con OpenAPI.
- Como gestionar auditoria de acciones.

## Riesgos tecnicos

- Hay una base inicial de tests backend con Vitest y Supertest, usando mocks de Prisma y Argon2.
- Falta cobertura de integracion contra PostgreSQL real y tests frontend/E2E.
- La logica de negocio sigue bastante mezclada con routers.
- La prevencion de solapes de guardia vive principalmente en codigo de aplicacion.
- Algunas operaciones de permisos y guardias necesitan mas cobertura de edge cases.
- `npm ci` reporta vulnerabilidades existentes en dependencias.
- Vite recomienda Node `20.19+`; el entorno usado tenia Node `20.11.1`, aunque el build compilo.
- `packages/*` esta declarado en workspaces, pero no hay paquetes compartidos.

## Riesgos de seguridad

- JWT se guarda en `localStorage`, sensible ante XSS.
- No hay refresh token ni invalidacion de tokens emitidos.
- Login ya rechaza usuarios inactivos/bloqueados, pero aun no gestiona intentos fallidos.
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
- Ejecutar build/lint antes de cerrar una tanda.
- Trabajar con ramas y commits frecuentes.
- Evitar exponer datos sensibles.
- Preferir codigos estables frente a IDs sembrados en frontend.

## Estado actual de implementacion

Estado de Git local al preparar este traspaso:

- Rama actual: `codex/guard-role-and-authz-cleanup`.
- `main` ya contiene la PR anterior `codex/recommendations-hardening`.
- La rama actual contiene una segunda tanda ya publicada con:
  - creacion atomica de guardias con asignaciones;
  - roles de guardia obtenidos desde backend;
  - autorizacion centralizada;
  - CORS configurable.

Commits relevantes ya mergeados en `main`:

- `docs: add project summary and agent guidance`
- `fix(backend): harden auth and user data responses`
- `fix(app): use role codes and improve client errors`
- `fix(backend): satisfy strict transaction typings`

Commits relevantes de la rama actual:

- `fix(guardias): create shifts with role-code assignments`
- `refactor(backend): centralize role authorization helpers`
- `chore(backend): make cors origin configurable`

Rama actual publicada:

- `codex/guard-role-and-authz-cleanup`
- PR sugerida: `https://github.com/Grokhen/shiftguard/pull/new/codex/guard-role-and-authz-cleanup`

## Archivos importantes creados o modificados

Creados:

- `AGENTS.md`
- `docs/project-summary.md`
- `apps/backend/src/utils/authz.ts`

Modificados en las tandas recientes:

- `package.json`
- `README.md`
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
```

Frontend:

```sh
cd apps/frontend
npm run dev
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
```

Tests:

```sh
cd apps/backend
npm test
```

Nota: los tests backend actuales usan mocks y no requieren PostgreSQL de test.

## Verificacion ejecutada

En las ultimas tandas se ejecuto:

```sh
npm_config_cache=/private/tmp/npm-cache-shiftguard-clean npm run build:backend
npm_config_cache=/private/tmp/npm-cache-shiftguard-clean npm run lint:frontend
npm_config_cache=/private/tmp/npm-cache-shiftguard-clean npm run build:frontend
npm run test --workspace backend
```

Resultado: correcto.

Avisos conocidos:

- Vite avisa que Node `20.11.1` esta por debajo de `20.19+`, pero el build termina.
- `baseline-browser-mapping` y Browserslist reportan datos antiguos.
- `npm ci` reporto vulnerabilidades existentes en dependencias.

## Siguiente tarea recomendada

La siguiente tarea recomendada es ampliar la cobertura automatizada y preparar integracion continua:

- anadir tests de integracion backend contra una base PostgreSQL de test;
- ampliar cobertura de administracion, equipos y edge cases de permisos;
- anadir CI con `npm run test --workspace backend`, build backend, lint frontend y build frontend;
- mantener los tests existentes de auth, autorizacion, guardias y permisos como red de seguridad.

Antes de seguir con nuevas funcionalidades, conviene asegurar estos flujos para que las siguientes refactorizaciones sean seguras.
