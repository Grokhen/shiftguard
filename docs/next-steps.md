# ShiftGuard - Proximos pasos recomendados

Este documento lista las siguientes tareas sugeridas para continuar el proyecto despues del traspaso.

## Estado de partida

- `main` contiene la primera PR de hardening inicial.
- `main` tambien contiene la PR `codex/guard-role-and-authz-cleanup`:
  - roles de guardia por codigo;
  - creacion atomica de guardias con asignaciones;
  - autorizacion compartida;
  - CORS configurable.
- `main` tambien contiene la PR `codex/backend-tests-foundation`, con base inicial de tests backend.
- La rama `codex/add-ci-workflow` introduce CI para PRs y pushes a `main`.
- La verificacion de tests/build backend paso correctamente.

## Prioridad 1 - Ampliar tests automatizados backend

Objetivo: proteger la seguridad y reglas de negocio ya corregidas.

Ya cubierto en la base inicial:

- Vitest y Supertest configurados en backend.
- Express separado en `src/app.ts` para poder importar la app sin levantar el listener de produccion.
- Tests para `auth/router`:
  - login correcto;
  - credenciales invalidas;
  - usuario inactivo;
  - usuario bloqueado.
- Tests para autorizacion:
  - admin requerido en usuarios;
  - supervisor/admin requerido en guardias;
  - aislamiento por delegacion en guardias.
- Tests para guardias:
  - creacion con asignaciones;
  - rechazo de solapes;
  - rechazo de usuarios de otra delegacion;
  - rechazo de roles repetidos.
- Tests para permisos:
  - tecnico solicita permiso;
  - supervisor decide permiso de su delegacion;
  - supervisor no decide permiso de otra delegacion.
- Tests para rutas administrativas y equipos:
  - admin requerido en delegaciones;
  - admin requerido en roles de usuario;
  - listado de equipos aislado por delegacion para supervisores;
  - filtro global de equipos para admin;
  - rechazo de lectura y miembros de equipos de otra delegacion.
- Tests para mutaciones administrativas:
  - creacion y edicion protegida de delegaciones;
  - edicion de roles de usuario;
  - creacion y edicion protegida de equipos;
  - rechazo de equipos con delegacion inexistente.
- Tests para edge cases de permisos:
  - rechazo de decision sobre permisos no pendientes;
  - rechazo de vuelta a estado `PENDIENTE`;
  - rechazo de estados de decision inexistentes.
- Tests para miembros de equipo y permisos por equipo:
  - borrado de miembros dentro de la delegacion del supervisor;
  - rechazo de borrado de miembros en equipos de otra delegacion;
  - permisos por equipo con y sin miembros;
  - filtro anual de permisos por equipo;
  - rechazo de consulta de permisos de equipos de otra delegacion.
- Tests para solicitudes de permisos:
  - rechazo de tipos de permiso inexistentes;
  - rechazo de decision sobre permisos inexistentes.

Tareas pendientes:

- Decidir si se anaden tests de integracion con PostgreSQL real para flujos criticos.
- Mantener CI como puerta de entrada para tests y builds en cada PR.

## Prioridad 2 - Robustez de guardias

Objetivo: reducir riesgo de carreras y estados inconsistentes.

Tareas:

- Revisar si PostgreSQL puede aplicar una restriccion fuerte contra solapes por delegacion.
- Si no se introduce constraint, considerar transacciones con aislamiento mas estricto en creacion/edicion.
- Validar edge cases de fechas y zonas horarias.
- Decidir si `estado` de guardia debe ser enum o tabla.

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

Objetivo: estabilizar ejecucion local y CI.

Tareas:

- Node local fijado en `.nvmrc` a `22.12.0`; usar `nvm use` antes de builds frontend.
- CI usa Node 22 para evitar incompatibilidades con Vite.
- Revisar vulnerabilidades reportadas por `npm audit`.
- No ejecutar `npm audit fix` a ciegas; revisar cambios antes.
- `engines` declara Node `^20.19.0 || >=22.12.0` y npm `>=10`.
- Mantener workflow CI con tests backend, build backend, lint frontend y build frontend.

## Cambios propuestos para AGENTS.md

No se han aplicado todavia. Propuesta:

- Actualizar comandos para incluir scripts raiz actuales: `npm run build`, `npm run lint`, `npm run build:backend`, `npm run build:frontend`, `npm run lint:frontend`.
- Anadir que la autorizacion compartida vive en `apps/backend/src/utils/authz.ts`.
- Anadir que frontend debe usar codigos de rol, no IDs sembrados.
- Anadir que guardias deben crearse con asignaciones en una sola llamada cuando sea posible.
- Anadir nota de Node recomendado para frontend: Vite requiere `20.19+` o `22.12+`.
- Anadir que no se debe ejecutar `npm audit fix` sin revisar.

## Siguiente tarea concreta

Completar el flujo Git de la rama de CI y abrir PR contra `main`.

Despues del merge:

1. Valorar tests de integracion con PostgreSQL de test.
2. Actualizar Node local con `nvm use` y repetir builds frontend sin avisos de version.
3. Definir siguiente bloque funcional: robustez de guardias, seguridad de sesion o auditoria.
