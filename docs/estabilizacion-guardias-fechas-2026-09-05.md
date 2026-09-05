# Fechas y rangos de guardias — 5 de septiembre de 2026

Las guardias representan instantes con hora. La validación anterior usaba `Date.parse`, que aceptaba entradas sin zona horaria y normalizaba algunos días inexistentes. Los filtros `desde` y `hasta` solo comprobaban el inicio de la guardia, de modo que omitían guardias que ya habían empezado y seguían dentro del rango solicitado.

## Cambios

- El alta, la edición y los filtros de guardias exigen fecha y hora ISO válidas con `Z` o un desplazamiento explícito `±HH:MM`. Se aceptan minutos, segundos y fracciones de hasta tres decimales; se rechaza precisión superior para evitar truncarla al convertirla a `Date`. Los años deben estar entre 1 y 9999 tanto en la entrada como tras convertir a UTC.
- Los intervalos de guardias deben tener duración positiva. Se comparan instantes, por lo que dos horas escritas de forma distinta pero equivalentes no forman un intervalo válido. Las ediciones de un solo extremo siguen comprobándose contra el otro extremo almacenado dentro de la transacción.
- `/api/guardias`, `/api/guardias/mias` y `/api/guardias/delegacion/:delegacionId` comparten la validación del rango y aplican su intersección con las guardias. Los límites opcionales corresponden a `fecha_fin > desde` y `fecha_inicio < hasta`. Si se indican ambos, `hasta` debe ser posterior a `desde`; si no se indica ninguno, no se aplica filtro temporal.
- El intervalo incluye el inicio y excluye el final: `[inicio, fin)`. Esto coincide con la comprobación existente de solapes y permite relevos consecutivos. La comprobación de guardias activas de los paneles técnico y supervisor usa el mismo criterio.
- Los filtros mantienen el alcance autorizado: delegación propia en el listado general, asignaciones propias en `/mias`, y supervisores de su delegación o administradores en el listado por delegación.

## Compatibilidad

El formulario del repositorio ya envía `toISOString()` y sigue siendo compatible. Los clientes externos que enviaran fechas sin hora, formatos locales, horas sin zona o más de tres decimales deben ajustarse. Las respuestas conservan la serialización de fechas de Prisma.

Los resultados de consultas con rango cambian: ahora incluyen guardias que empezaron antes pero siguen activas, y excluyen las que únicamente tocan un extremo. Un rango con extremos iguales devuelve 400; no representa una consulta puntual. El listado por delegación ahora aplica los filtros, que antes ignoraba. En parámetros de URL, codificar el signo `+` del desplazamiento, por ejemplo mediante `URLSearchParams`.

## Verificación

- 274 pruebas correctas en ocho archivos: las 189 anteriores y 85 nuevas en `apps/backend/tests/guardia-dates.test.ts`.
- Compilación de backend y frontend y lint frontend correctos. Persisten los avisos previos sobre la antigüedad de los datos de Browserslist y Baseline.
- Se cubren días inexistentes, bisiestos, horas y desplazamientos inválidos, ausencia de zona, años extremos, precisión, intervalos vacíos o invertidos, horas repetidas durante el cambio de horario, escrituras parciales y filtros en los tres listados.
- Las pruebas verifican el alcance por usuario y delegación y la comprobación frontend del relevo en `Europe/Madrid`, `America/Los_Angeles` y `Pacific/Kiritimati`.
- Las rutas se ejecutan con Prisma simulado: se comprueban las condiciones enviadas a Prisma, pero no su ejecución SQL ni la concurrencia real. No se ha realizado una prueba visual adicional de los paneles en esta tanda.

## Siguientes pasos

1. Verificar transacciones, reintentos y rollback con PostgreSQL de pruebas, incluyendo altas y ediciones concurrentes de guardias.
2. Definir y aplicar las reglas de disponibilidad ante permisos aprobados, incluida la zona horaria con la que se relacionan días de permiso e instantes de guardia.
3. Revisar la actualización automática de los paneles al avanzar el reloj: la comprobación del relevo es correcta cuando se evalúa, pero esta tanda no añade refresco periódico.
4. Revisar e integrar la rama `codex/security-stabilization` en `main` con CI. Siguen pendientes la revocación persistente de sesiones, las actualizaciones revisadas de dependencias y la preparación del despliegue.

No se han modificado datos existentes, dependencias, secretos ni migraciones. Las fechas que se hubieran normalizado y guardado antes requieren una revisión de datos aparte.
