# ShiftGuard - Proximos pasos recomendados

Este documento lista las siguientes tareas sugeridas para continuar el proyecto despues del traspaso. No implica aprobacion para implementar funcionalidades; elegir y aprobar una tarea antes de avanzar.

## Estado de partida

- `main` contiene las PRs de hardening, guardias/autorizacion, tests backend, CI y pin de Node.
- Rama local actual de trabajo: `codex/update-agent-guidance`.
- `AGENTS.md` esta alineado con las reglas actuales del proyecto.
- Node esta fijado con `.nvmrc` en `22.12.0`.
- CI ejecuta:
  - `npm ci`;
  - `npm run test --workspace backend`;
  - `npm run build:backend`;
  - `npm run lint:frontend`;
  - `npm run build:frontend`.
- Tests backend actuales: 45 tests con Vitest/Supertest y mocks de Prisma/Argon2.

## Ya cubierto

### Hardening inicial

- Login rechaza usuarios inactivos y bloqueados.
- JWT incluye `roleCode`.
- Frontend usa codigos de rol en vez de IDs sembrados.
- Respuestas de usuarios evitan exponer `password_hash`.
- Ruta `/api/usuarios/me` queda antes de `/:id`.

### Guardias y autorizacion

- Roles de guardia consultados desde backend.
- Creacion/actualizacion de guardias con asignaciones en una sola llamada cuando aplica.
- Escritura de guardias y asignaciones en transaccion.
- Autorizacion compartida en `apps/backend/src/utils/authz.ts`.
- CORS configurable con `CORS_ORIGIN`.

### Tests backend

- Infra con Vitest y Supertest.
- `apps/backend/src/app.ts` permite importar Express sin levantar el listener de produccion.
- Tests de auth:
  - login correcto;
  - credenciales invalidas;
  - usuario inactivo;
  - usuario bloqueado;
  - token requerido;
  - token invalido;
  - usuario autenticado sin `password_hash`.
- Tests de autorizacion:
  - rutas admin-only;
  - supervisor/admin;
  - aislamiento por delegacion.
- Tests de guardias:
  - creacion con asignaciones;
  - rechazo de solapes;
  - rechazo de usuarios de otra delegacion;
  - rechazo de roles repetidos.
- Tests de permisos:
  - tecnico solicita permiso;
  - supervisor decide permiso de su delegacion;
  - supervisor no decide permiso de otra delegacion;
  - rechazo de permisos no pendientes;
  - rechazo de vuelta a `PENDIENTE`;
  - rechazo de estados/tipos inexistentes;
  - rechazo de decision sobre permiso inexistente.
- Tests de administracion/equipos:
  - admin requerido en delegaciones y roles de usuario;
  - creacion/edicion protegida de delegaciones, roles y equipos;
  - listado de equipos aislado por delegacion;
  - miembros de equipo;
  - permisos por equipo con filtro anual.

### CI y entorno

- Workflow `.github/workflows/ci.yml`.
- Node 22 en CI.
- `.nvmrc` con `22.12.0`.
- `engines` en `package.json`.

## Prioridad 1 - Tests de integracion backend

Objetivo: validar reglas criticas contra PostgreSQL real, no solo con mocks.

Tareas sugeridas:

- Definir estrategia de base de datos de test:
  - base PostgreSQL separada;
  - schema limpio por suite;
  - seed minimo de roles, delegaciones, tipos/estados de permiso y roles de guardia.
- Crear helpers de fixtures para:
  - roles;
  - delegaciones;
  - usuarios por rol;
  - guardias;
  - permisos;
  - equipos y miembros.
- Cubrir primero:
  - login real con Argon2;
  - creacion de guardia con asignaciones;
  - rechazo de solapes;
  - rechazo de usuarios de otra delegacion;
  - decision de permisos por supervisor de su delegacion;
  - bloqueo de decision de permisos de otra delegacion.

Notas:

- No tocar migraciones existentes salvo necesidad clara.
- No usar una base de datos de desarrollo compartida para tests destructivos.

## Prioridad 2 - Robustez de guardias

Objetivo: reducir riesgo de carreras y estados inconsistentes.

Tareas:

- Revisar si PostgreSQL puede aplicar una restriccion fuerte contra solapes por delegacion.
- Valorar exclusion constraints/rangos de tiempo si encaja con Prisma y migraciones.
- Si no se introduce constraint, considerar transacciones con aislamiento mas estricto.
- Validar edge cases de fechas y zonas horarias.
- Decidir si `estado` de guardia debe ser string, enum o tabla.

## Prioridad 3 - Seguridad de sesion

Objetivo: mejorar el ciclo de vida de autenticacion.

Tareas:

- Definir estrategia de refresh token o renovacion de sesion.
- Definir politica de expiracion y logout.
- Implementar intentos fallidos y bloqueo automatico.
- Definir si se mantiene `localStorage` o se migra a cookies `httpOnly`.
- Revisar `SEED_ADMIN_PASSWORD` para evitar password por defecto en entornos no locales.

## Prioridad 4 - Auditoria y trazabilidad

Objetivo: dejar rastro de cambios sensibles.

Tareas:

- Registrar quien crea/modifica guardias.
- Registrar quien aprueba/rechaza permisos y cuando.
- Registrar altas/bajas/cambios de usuarios.
- Definir tabla de auditoria o campos especificos por entidad.

## Prioridad 5 - Documentacion de API

Objetivo: facilitar QA, frontend y mantenimiento.

Tareas:

- Elegir formato OpenAPI.
- Documentar endpoints existentes.
- Documentar errores comunes.
- Documentar payloads por rol.
- Publicar ejemplos de curl o coleccion para QA.

## Prioridad 6 - Calidad frontend

Objetivo: reducir complejidad de pantallas grandes.

Tareas:

- Extraer partes de `SupervisorDashboard` a componentes o hooks:
  - guardias activas;
  - permisos activos;
  - permisos pendientes;
  - formulario de creacion de guardia.
- Anadir tests de componentes principales.
- Evitar `alert` y `prompt` para decisiones de permisos; migrar a modal controlado.
- Revisar estados de carga/error de roles de guardia.

## Prioridad 7 - Dependencias y entorno

Objetivo: mantener el entorno estable.

Tareas:

- Usar `nvm use` antes de builds frontend.
- Revisar vulnerabilidades reportadas por `npm audit`.
- No ejecutar `npm audit fix` a ciegas.
- Mantener CI como puerta de entrada para PRs.

## Siguiente tarea concreta recomendada

Pedir aprobacion para una de estas opciones:

1. Crear tests de integracion backend con PostgreSQL real.
2. Revisar robustez de guardias contra solapes concurrentes.
3. Disenar seguridad de sesion antes de implementar refresh tokens o bloqueo por intentos.

Recomendacion: empezar por la opcion 1 si se quiere una red de seguridad mas realista antes de tocar reglas de negocio; empezar por la opcion 2 si preocupa mas el riesgo de solapes concurrentes en produccion.
