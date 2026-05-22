# ShiftGuard - Proximos pasos recomendados

Este documento lista las siguientes tareas sugeridas para continuar el proyecto despues del traspaso.

## Estado de partida

- `main` contiene la primera PR de hardening inicial.
- `main` tambien contiene la PR `codex/guard-role-and-authz-cleanup`:
  - roles de guardia por codigo;
  - creacion atomica de guardias con asignaciones;
  - autorizacion compartida;
  - CORS configurable.
- La rama `codex/backend-tests-foundation` introduce una base inicial de tests backend.
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

Tareas pendientes:

- Cubrir delegaciones, roles de usuario y equipos con mas profundidad.
- Anadir edge cases de permisos no pendientes, estados invalidos y tipos invalidos.
- Decidir si se anaden tests de integracion con PostgreSQL real para flujos criticos.
- Anadir CI para ejecutar tests y builds en cada PR.

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

- Subir Node local/CI a `20.19+` o `22.12+` para Vite.
- Revisar vulnerabilidades reportadas por `npm audit`.
- No ejecutar `npm audit fix` a ciegas; revisar cambios antes.
- Considerar `.nvmrc` o `engines` para fijar version de Node.
- Crear workflow CI con build backend, lint frontend y build frontend.

## Cambios propuestos para AGENTS.md

No se han aplicado todavia. Propuesta:

- Actualizar comandos para incluir scripts raiz actuales: `npm run build`, `npm run lint`, `npm run build:backend`, `npm run build:frontend`, `npm run lint:frontend`.
- Anadir que la autorizacion compartida vive en `apps/backend/src/utils/authz.ts`.
- Anadir que frontend debe usar codigos de rol, no IDs sembrados.
- Anadir que guardias deben crearse con asignaciones en una sola llamada cuando sea posible.
- Anadir nota de Node recomendado para frontend: Vite requiere `20.19+` o `22.12+`.
- Anadir que no se debe ejecutar `npm audit fix` sin revisar.

## Siguiente tarea concreta

Completar el flujo Git de la rama de tests backend y abrir PR contra `main`.

Despues del merge:

1. Crear CI con tests backend y builds.
2. Ampliar tests backend para equipos, delegaciones y roles.
3. Valorar tests de integracion con PostgreSQL de test.
