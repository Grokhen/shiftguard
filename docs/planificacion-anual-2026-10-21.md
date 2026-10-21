# Planificación anual con frecuencia — 21 de octubre de 2026

- [x] Renombrar la sección del supervisor a «Calendario de guardias».
- [x] Conservar «Ver calendario de guardias» con la vista mensual existente.
- [x] Añadir «Planificar calendario de guardias anual» para el año actual o el siguiente, con los inicios de semana resaltados.
- [x] Seleccionar principal y secundario opcional, con repetición cada N semanas hasta fin de año.
- [x] Validar frecuencia entera entre 1 y el número de semanas naturales del año (53 en 2026).
- [x] Retirar el resaltado de permisos al resolverse su coincidencia con guardias, también entre pestañas.

## Comportamiento

La vista anual permite seleccionar el lunes de una semana y asignarle un técnico principal y, opcionalmente, un secundario. Sin repetición, solo cambia esa semana. Si se marca «Repetir hasta fin de año», una frecuencia de 3 asigna la semana inicial, deja dos sin modificar y repite el turno en la siguiente.

Los inicios de semana con al menos un técnico asignado se muestran en verde y con el texto «Asignada»; los vacíos, en violeta y con «Vacía». Una leyenda explica ambos estados. El indicador se actualiza con los datos recargados después de guardar, también para las series repetidas, y permite abrir las semanas ya asignadas para revisarlas o cambiarlas.

Se puede elegir el año actual en Europe/Madrid o el siguiente, validado también por el servidor. Cada serie termina en el año elegido y no se repite en semanas nuevas del posterior. Se conservan completas las semanas naturales compartidas con diciembre/enero, según la regla anterior del proyecto. El primer lunes de la primera semana puede estar en diciembre del año anterior y aparece resaltado en enero. Preparar cualquiera de los dos años conserva las asignaciones de esa semana compartida.

La vista previa indica el número de semanas, la fecha inicial y el final de la última semana (el lunes siguiente). Por ejemplo, una sola semana desde el 05/01/2026 muestra hasta el 12/01/2026. Si alguna tiene otros técnicos, hay que marcar expresamente que se reemplazan esas asignaciones. Las semanas intermedias no se modifican. Guardar de nuevo la misma planificación conserva las asignaciones e IDs existentes.

Toda la serie se valida y se escribe en una transacción serializable. Solo se admiten técnicos activos de la delegación del supervisor. Si falta una semana o está ocupada por una guardia anterior de otras fechas, no se guarda ninguna parte de la serie. Las guardias previas se revisan desde la vista mensual.

## API

`POST /api/guardias/calendario/planificar`, reservado a supervisor/admin de la delegación de la guardia:

```json
{
  "anio": 2026,
  "guardia_id": 123,
  "principal_id": 20,
  "secundario_id": 21,
  "frecuencia_semanas": 3,
  "reemplazar_existentes": false
}
```

Los IDs son ilustrativos y se obtienen de las consultas existentes. `secundario_id` y `frecuencia_semanas` son opcionales. Sin frecuencia, solo se programa la semana seleccionada. La respuesta informa `programadas` y `actualizadas`; si existen asignaciones distintas y no se ha confirmado reemplazarlas, devuelve 409 con `CALENDAR_ASSIGNMENTS_EXIST` sin escrituras parciales.

## Actualización de conflictos

La bandeja sigue calculando las coincidencias desde las asignaciones actuales. Al guardar desde cualquiera de los dos calendarios se emite una notificación local y entre pestañas. El panel vuelve a consultar también al recuperar el foco/visibilidad y cada 30 segundos mientras permanece visible, para recoger cambios de otras sesiones. Las actualizaciones en segundo plano conservan la lista visible y descartan respuestas anteriores.

El nombre del sustituto queda como propuesta de la solicitud. Resolver el conflicto requiere retirar al solicitante de todas las guardias que coincidan con sus días de permiso; entonces desaparecen el color y el aviso de conflicto, conservando las observaciones y el nombre propuesto.

«Revisar calendario de guardias» enlaza al calendario mensual con la fecha de la primera coincidencia y el ID de la solicitud. Selecciona el día afectado y muestra sus técnicos con el botón «Modificar técnicos». El calendario vuelve a consultar la bandeja autorizada para mostrar el permiso, las fechas y el sustituto propuesto; no toma esos datos de la URL. Si hay varias guardias, ofrece botones para saltar a cada intervalo afectado, también en otros meses o años. Los días coincidentes se resaltan en naranja con «Conflicto», calculados desde las asignaciones actuales y los días inclusivos del permiso, respetando el final exclusivo de cada guardia. Al guardar se actualizan las marcas y la solicitud; al recargar se conserva el contexto. Si la solicitud ya no está pendiente o no está disponible, lo indica sin mostrar información anterior.

La navegación añade seis pruebas: selección del primer día coincidente, orden de varias guardias, cambio de mes/año, cambio de hora en Madrid, final exclusivo y retirada del resaltado al sustituir al solicitante. También rechaza fechas inválidas de la URL. Verificada en local con la solicitud del 15–16 de noviembre: se abre noviembre, se selecciona el 15, se resalta solo ese día y se permite editar la guardia del 9–15 sin guardar cambios en los datos de demo.

## Verificación

- **341 pruebas habituales y 46 de integración PostgreSQL: 387 en total.**
- Planificación del año siguiente: persistencia de la serie, conservación de asignaciones al preparar el año actual y rechazo de años posteriores. El límite de años cambia según el calendario de Madrid, también antes del cambio de año en UTC.
- Integración: persistencia cíclica de una pareja, repetición idempotente, último intervalo del año sin nuevas semanas en enero, rollback real después de eliminar asignaciones, roles/usuarios activos/delegación y dos planificaciones competidoras con aborto y reintento reales.
- Pruebas de fechas: frecuencia de tres semanas durante el cambio de hora, coincidencia entre vista previa y servidor, y cambio de año en Madrid antes que UTC.
- Pruebas del cliente: notificaciones de guardado, cambios entre pestañas, foco y retirada de listeners.
- Tipos de integración, compilaciones backend/frontend y lint frontend correctos. Sin dependencias ni migraciones nuevas. Los esquemas temporales de integración se eliminaron.
- Navegador local: máximo 53 (54 inválido), frecuencia 3 desde el 23 de noviembre con resultado 23 de noviembre y 14 de diciembre; pareja Nerea/Nuevo guardada tras confirmar reemplazo. La solicitud de Alex del 23–24 de noviembre permanece pendiente y pierde el resaltado en la otra pestaña sin pulsar Actualizar.

La primera ejecución CI detectó que los reintentos inmediatos podían agotar el límite antes de terminar el commit competidor. Se añaden esperas de 20 y 40 ms únicamente para `P2034`, conservando el máximo de tres intentos y el 409 al agotarlos. Las carreras verifican entre tres y seis transacciones para dos peticiones (al menos un reintento y como máximo tres intentos por petición), manteniendo todas las comprobaciones de respuestas, persistencia y ausencia de cambios parciales. Dos pruebas con reloj controlado verifican las esperas y que otros errores no se reintentan.
