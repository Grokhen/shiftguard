# Planificación anual con frecuencia — 21 de octubre de 2026

- [x] Renombrar la sección del supervisor a «Calendario de guardias».
- [x] Conservar «Ver calendario de guardias» con la vista mensual existente.
- [x] Añadir «Planificar calendario de guardias anual» para el año actual, con los inicios de semana resaltados.
- [x] Seleccionar principal y secundario opcional, con repetición cada N semanas hasta fin de año.
- [x] Validar frecuencia entera entre 1 y el número de semanas naturales del año (53 en 2026).
- [x] Retirar el resaltado de permisos al resolverse su coincidencia con guardias, también entre pestañas.

## Comportamiento

La vista anual permite seleccionar el lunes de una semana y asignarle un técnico principal y, opcionalmente, un secundario. Sin repetición, solo cambia esa semana. Si se marca «Repetir hasta fin de año», una frecuencia de 3 asigna la semana inicial, deja dos sin modificar y repite el turno en la siguiente.

Se utiliza el año actual en Europe/Madrid, validado también por el servidor. No se repite en semanas nuevas del año siguiente. Se conservan completas las semanas naturales compartidas con diciembre/enero, según la regla anterior del proyecto. El primer lunes de la primera semana puede estar en diciembre del año anterior y aparece resaltado en enero.

La vista previa indica el número de semanas y la fecha inicial de la última. Si alguna tiene otros técnicos, hay que marcar expresamente que se reemplazan esas asignaciones. Las semanas intermedias no se modifican. Guardar de nuevo la misma planificación conserva las asignaciones e IDs existentes.

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

## Verificación

- **338 pruebas habituales y 45 de integración PostgreSQL correctas: 383 en total.**
- Integración: persistencia cíclica de una pareja, repetición idempotente, último intervalo del año sin nuevas semanas en enero, rollback real después de eliminar asignaciones, roles/usuarios activos/delegación y dos planificaciones competidoras con aborto y reintento reales.
- Pruebas de fechas: frecuencia de tres semanas durante el cambio de hora, coincidencia entre vista previa y servidor, y cambio de año en Madrid antes que UTC.
- Pruebas del cliente: notificaciones de guardado, cambios entre pestañas, foco y retirada de listeners.
- Tipos de integración, compilaciones backend/frontend y lint frontend correctos. Sin dependencias ni migraciones nuevas. Los esquemas temporales de integración se eliminaron.
- Navegador local: máximo 53 (54 inválido), frecuencia 3 desde el 23 de noviembre con resultado 23 de noviembre y 14 de diciembre; pareja Nerea/Nuevo guardada tras confirmar reemplazo. La solicitud de Alex del 23–24 de noviembre permanece pendiente y pierde el resaltado en la otra pestaña sin pulsar Actualizar.
