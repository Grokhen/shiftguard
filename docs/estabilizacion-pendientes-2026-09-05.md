# Bandeja de permisos pendientes — 5 de septiembre de 2026

La bandeja del supervisor agrupaba consultas por equipo y año actual. Eso omitía a usuarios sin equipo y solicitudes de otros años, y repetía permisos de usuarios con varios equipos.

La [tanda de fechas](estabilizacion-fechas-2026-09-05.md) completa después la validación de días, los filtros anuales y la presentación en distintas zonas horarias. El resto de este documento conserva el alcance de la bandeja.

## Cambios

- Nuevo `GET /api/permisos/pendientes`, reservado a supervisores y administradores. Consulta los permisos directamente, por estado `PENDIENTE`, sin condiciones de membresía o año.
- Un supervisor solo puede consultar su delegación actual. Una petición con `delegacion_id` diferente devuelve 403. El administrador puede consultar todas o filtrar una delegación.
- Solo se admite el filtro opcional `delegacion_id`, entero positivo. Los filtros de año o estado no forman parte de esta bandeja y se rechazan con 400.
- Los resultados incluyen tipo, estado y una selección explícita de datos de usuario: id, nombre, apellidos, correo y delegación. No se cargan hashes ni otros datos de cuenta. Se ordenan por fecha de inicio e id.
- El panel hace una única consulta de pendientes, aunque no existan equipos. La carga deja de depender del selector de equipo.
- Se añade «Actualizar» y se recarga la bandeja después de cada decisión, también si el servidor rechaza una decisión sobre un registro que ya cambió. Se descartan respuestas de cargas sustituidas y se impiden decisiones simultáneas en la misma interfaz.

La sección de permisos activos del equipo conserva su consulta y filtro anteriores. Su contrato de fechas se revisará por separado.

## Verificación

- 151 pruebas correctas: las 134 anteriores más 17 de consulta, autorización, validación y contrato del cliente.
- Compilaciones backend y frontend correctas; lint frontend correcto. Persisten los avisos previos de antigüedad de Browserslist y Baseline.
- Se comprueba que la consulta exige estado pendiente y delegación, selecciona solo datos seguros y no consulta equipos ni aplica límites de año. Se cubren técnicos, supervisores, administradores, ausencia de sesión y cambio obligatorio de contraseña.
- En navegador, con las rutas reales y Prisma sustituido por datos temporales en memoria, se mostraron solicitudes de 2025/2026 y 2027 sin ningún equipo configurado. La aprobación retiró una solicitud; una decisión ajena provocó el aviso correspondiente y la actualización posterior de la lista.
- Sigue pendiente comprobar las consultas y la concurrencia con PostgreSQL real. No se han instalado dependencias, aplicado migraciones ni modificado datos reales.

## Próximos pasos

Revisar el contrato de fechas de permisos y filtros anuales, incluyendo días inexistentes y cruces de año. Completar integración con PostgreSQL y disponibilidad frente a ausencias aprobadas. La rama ya está publicada en GitHub; su revisión e integración en `main` siguen pendientes.
