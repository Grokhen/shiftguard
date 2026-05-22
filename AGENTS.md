# AGENTS.md

Instrucciones para futuras tareas de Codex en este proyecto.

## Contexto

ShiftGuard es un monorepo con:

- Backend en `apps/backend`: Express, TypeScript, Prisma y PostgreSQL.
- Frontend en `apps/frontend`: React, Vite, TypeScript y Tailwind CSS.

## Reglas de trabajo

- No instalar dependencias sin permiso explicito.
- No cambiar arquitectura de forma amplia sin justificarlo primero.
- Mantener cambios pequenos y enfocados.
- No tocar migraciones existentes salvo que la tarea lo requiera claramente.
- No modificar secretos ni crear valores reales de `.env`.
- Si hay cambios locales ajenos, no revertirlos.
- Antes de cambiar logica sensible, revisar rutas, validaciones, roles y modelo Prisma.

## Comandos utiles

Backend:

```sh
cd apps/backend
npm run dev
npm run build
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
```

Frontend:

```sh
cd apps/frontend
npm run dev
npm run build
npm run lint
```

Base de datos local:

```sh
docker compose up -d
```

## Zonas sensibles

- Autenticacion JWT y passwords en `apps/backend/src/modules/auth`.
- Autorizacion por rol y delegacion en routers backend.
- Respuestas que incluyan usuarios: evitar exponer `password_hash`.
- Rutas de guardias y permisos: revisar solapes, transacciones y delegacion.
- IDs de roles hardcodeados en frontend.
- Prisma schema y migraciones.

## Verificacion recomendada

Segun el cambio, ejecutar:

- Backend: `npm run build`.
- Frontend: `npm run lint` y `npm run build`.
- Si se toca Prisma: `npm run prisma:generate` y revisar migraciones.
- Si se toca seguridad/autorizacion: anadir o actualizar tests antes de cerrar.

## Prioridades tecnicas

- Mantener seguridad de datos de usuario.
- Evitar exposicion de hashes de password.
- Reutilizar patrones existentes antes de introducir abstracciones nuevas.
- Preferir validaciones Zod en backend y mensajes coherentes en frontend.
- Evitar cambios visuales grandes si la tarea no los pide.
