# ShiftGuard - Proximos pasos recomendados

Este documento lista las siguientes tareas sugeridas para continuar el proyecto despues del traspaso.

## Estado de partida

- `main` contiene la primera PR de hardening inicial.
- La rama `codex/guard-role-and-authz-cleanup` contiene la segunda tanda:
  - roles de guardia por codigo;
  - creacion atomica de guardias con asignaciones;
  - autorizacion compartida;
  - CORS configurable.
- No hay tests automatizados reales.
- La verificacion manual de build/lint paso correctamente.

## Prioridad 1 - Tests automatizados backend

Objetivo: proteger la seguridad y reglas de negocio ya corregidas.

Tareas:

- Elegir runner de tests backend.
- Anadir configuracion de test sin romper scripts existentes.
- Crear tests para `auth/router`:
  - login correcto;
  - credenciales invalidas;
  - usuario inactivo;
  - usuario bloqueado.
- Crear tests para autorizacion:
  - admin requerido en usuarios/delegaciones/roles;
  - supervisor/admin requerido en guardias/equipos/permisos.
- Crear tests para aislamiento por delegacion:
  - supervisor no puede ver/modificar recursos de otra delegacion;
  - admin si puede operar globalmente.
- Crear tests para guardias:
  - creacion con asignaciones;
  - rechazo de solapes;
  - rechazo de usuarios de otra delegacion;
  - rechazo de roles repetidos.
- Crear tests para permisos:
  - tecnico solicita permiso;
  - supervisor decide permiso de su delegacion;
  - supervisor no decide permiso de otra delegacion.

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

Empezar por tests backend de autenticacion y autorizacion.

Primer paso sugerido:

1. Elegir runner de tests.
2. Anadir script `test` real al backend.
3. Crear pruebas del login y de `authRequired`.
4. Ejecutar build backend para confirmar que la configuracion no rompe TypeScript.
