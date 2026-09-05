# Fechas de permisos — 5 de septiembre de 2026

Los permisos se almacenan como `DATE` en PostgreSQL. La validación anterior usaba `Date.parse`, que puede normalizar días inexistentes y aceptar formatos ambiguos. Los filtros anuales solo comprobaban cuándo empezaba el permiso y construían sus límites con la zona horaria del servidor.

La tanda posterior corrige las [fechas y los rangos de guardias](estabilizacion-guardias-fechas-2026-09-05.md). Este documento conserva el alcance y la verificación de la tanda de permisos.

## Cambios

- El alta de permisos exige días válidos con formato `YYYY-MM-DD`, con año mayor que cero. Se rechazan fechas inexistentes, formatos locales y timestamps con hora o zona horaria. Se permiten permisos de un solo día; el final no puede preceder al inicio.
- Las fechas se convierten a medianoche UTC para Prisma, conservando el día civil indicado por el usuario.
- `anio` admite enteros de 1 a 9999 en `/api/permisos/mios` y `/api/equipos/:id/permisos`. Se aplica la intersección inclusiva del permiso con el año: inicio hasta el 31 de diciembre y fin desde el 1 de enero. Los límites son UTC e independientes del servidor, incluidos los años inferiores a 100.
- El frontend formatea las fechas de permisos como días de calendario, evitando desplazarlas al día anterior en zonas al oeste de UTC. La comprobación de permisos activos incluye todo el primer y último día según el calendario local del navegador.
- Las fechas y horas de guardias mantienen su tratamiento de instantes y su comportamiento previo.

## Verificación

- 189 pruebas correctas: 151 anteriores y 38 nuevas de fechas, filtros anuales y presentación.
- Backend y frontend compilan; lint frontend correcto. Persisten los avisos previos de antigüedad de Browserslist y Baseline.
- Se cubren años bisiestos, días y meses inexistentes, timestamps rechazados, año cero, intervalos invertidos, permisos de un solo día y cruces de año.
- Los contratos de consulta se comprueban tanto en permisos propios como de equipo. Las pruebas de formato y días activos usan `Europe/Madrid`, `America/Los_Angeles` y `Pacific/Kiritimati`.
- Las rutas se prueban con Prisma simulado. Falta la integración con PostgreSQL real; no se ha afirmado validar su persistencia o sus carreras reales.

## Compatibilidad y siguientes pasos

Los clientes de alta de permisos deben enviar `YYYY-MM-DD`; el frontend del repositorio ya lo hacía. Un cliente externo que enviara timestamps tendrá que ajustarse. Las respuestas conservan la serialización anterior de Prisma a medianoche UTC. El nuevo filtro anual incluye permisos que antes se omitían al comenzar fuera del año solicitado.

No se han modificado datos existentes, secretos, dependencias ni migraciones. Una fecha previamente normalizada y guardada no se corrige automáticamente.

Siguen pendientes la integración con PostgreSQL, una validación estricta de timestamps y rangos de guardias, las reglas de disponibilidad frente a ausencias aprobadas, la revocación persistente de sesiones y las actualizaciones revisadas de dependencias. La rama ya está publicada en GitHub y pendiente de revisión e integración en `main`.
