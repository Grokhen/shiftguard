# Integración con PostgreSQL — 5 de septiembre de 2026

Las pruebas anteriores simulaban Prisma y verificaban las consultas y respuestas de la API, sin demostrar persistencia, rollback ni conflictos reales. Esta tanda añade una suite separada que ejecuta las rutas Express y Prisma contra PostgreSQL 16.

## Aislamiento y ejecución

- `npm run test --workspace backend` conserva la suite habitual, sin conexión a PostgreSQL.
- `npm run typecheck:integration --workspace backend` comprueba los tipos de las pruebas de integración y sus imports del backend.
- `npm run test:integration --workspace backend` exige `TEST_DATABASE_URL`, con protocolo PostgreSQL, host loopback y base `shiftguard_test`. Rechaza parámetros adicionales y nunca toma `DATABASE_URL` como alternativa ni carga el `.env` de desarrollo para elegir la base.
- La base debe existir y el usuario necesita permisos para crear y eliminar sus esquemas. Cada ejecución crea `shiftguard_it_<UUID>`, aplica las migraciones existentes con `prisma migrate deploy` y elimina únicamente ese esquema al terminar, también ante fallos de migraciones o pruebas. No ejecuta reset de bases ni utiliza el seed de usuarios.
- Una interrupción forzada del proceso puede dejar el esquema temporal pendiente de limpieza. Su nombre se imprime al arrancar; comprobar ese nombre concreto antes de limpiarlo manualmente.
- Vitest usa una configuración independiente y comprueba el entorno del ejecutor antes de importar las rutas. Las pruebas de integración no se descubren desde la suite habitual.

Para ejecutar localmente, preparar una instancia de pruebas con una base vacía `shiftguard_test` y establecer `TEST_DATABASE_URL` en la sesión del terminal. No guardarla en un `.env` real del repositorio. Por ejemplo, una URL local tendrá la forma `postgresql://<usuario>:<contraseña>@127.0.0.1:55432/shiftguard_test`.

CI arranca un servicio PostgreSQL 16 temporal con comprobación de salud, ejecuta ambas suites y las comprobaciones habituales de compilación y lint. Las credenciales del servicio son exclusivas de ese entorno efímero. El workflow se ejecuta en PRs dirigidas a `main` y en pushes a `main` o `codex/**`, para poder validar una rama antes de abrir su PR.

## Casos de integración

1. Persistencia de instantes UTC, guardias adyacentes y creación conjunta de sus asignaciones.
2. Rollback del alta cuando PostgreSQL rechaza las asignaciones después de insertar la guardia.
3. Rollback de fechas, estado y asignaciones anteriores cuando falla un reemplazo después del UPDATE y DELETE.
4. Dos altas concurrentes con el mismo intervalo: se fuerza que ambas lean antes de escribir, se comprueba el reintento de la transacción abortada por PostgreSQL y que solo una guardia persista.
5. Dos ediciones concurrentes que intentan mover guardias diferentes al mismo intervalo: solo una se aplica; la otra conserva sus fechas y asignaciones.
6. Intersección real de rangos en los tres listados de guardias, incluidos los extremos, guardias ya comenzadas y aislamiento por usuario/delegación.

Las pruebas de rollback instalan y retiran una restricción CHECK únicamente en el esquema temporal para provocar un error real de escritura. Las carreras usan una barrera tras las dos primeras consultas de solapes: controla su orden, pero las consultas, el aislamiento, los commits, los abortos y los reintentos se ejecutan contra PostgreSQL. No se sustituyen los resultados de Prisma por datos simulados.

## Verificación

- 288 pruebas de la suite habitual correctas, incluidas 14 nuevas sobre aislamiento del destino de integración.
- Tipos de integración y compilación backend correctos.
- El ejecutor rechaza la ausencia de `TEST_DATABASE_URL` antes de intentar una conexión.
- Los ocho casos de integración pasan con PostgreSQL 16 en [CI, ejecución 13](https://github.com/Grokhen/shiftguard/actions/runs/33980717516), sobre el commit `76e91b2`. En total: 288 pruebas habituales y ocho de integración correctas.
- CI confirma la aplicación de la migración inicial en un esquema nuevo y su eliminación al terminar. Las altas y ediciones concurrentes ejecutan tres transacciones para dos peticiones: la operación abortada se reintenta y vuelve a validar el solape.
- También pasan en CI la generación de Prisma, los tipos de integración, ambas compilaciones y el lint frontend. Persisten los avisos previos de antigüedad de los datos de navegadores.

En este equipo Docker está instalado en la sesión del usuario, pero el intento de inicio no ha dejado un motor accesible. No se han instalado dependencias ni modificado la configuración de Windows para remediarlo.

## Pendientes

Ampliar esta suite a traslados de usuarios/equipos y decisiones concurrentes de permisos. Definir las reglas de disponibilidad ante ausencias aprobadas y la actualización temporal de los paneles. La rama sigue pendiente de revisión e integración en `main`; añadir estas pruebas no despliega la aplicación.
