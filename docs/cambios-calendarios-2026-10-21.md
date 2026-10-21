# Cambios solicitados — 21 de octubre de 2026

Lista de ejecución, en el orden solicitado:

- [x] 1. Predefinir guardias semanales vacías por delegación; incluir semanas que cruzan de año.
- [x] 2. Sustituir el formulario del supervisor por un calendario mensual con consulta por día y edición de técnicos.
- [x] 3. Mostrar al supervisor las observaciones de las solicitudes.
- [ ] 4. Añadir calendario anual del técnico: principal rojo, secundario amarillo y consulta de compañeros de su delegación.
- [ ] 5. Avisar de permisos coincidentes con guardias, recoger sustituto opcional y resaltar el conflicto al supervisor.
- [ ] 6. Añadir Volver a la derecha del título en las secciones de administración.

## Criterios

- Semanas de lunes 00:00 a lunes 00:00, extremo final excluido, en Europe/Madrid. La duración real cambia con el horario de verano.
- La generación se realiza automáticamente al abrir el calendario del supervisor para un año. Es transaccional y repetible; no duplica las semanas compartidas entre años.
- Las guardias previas y sus asignaciones se conservan. No se crean semanas que se solapen con ellas; la interfaz advierte de esos periodos anteriores.
- El técnico consulta únicamente su delegación; solo supervisores/administradores pueden preparar el calendario y modificar asignaciones.
- Proponer sustituto no modifica automáticamente las asignaciones ni implica que el compañero haya aceptado. El supervisor decide y ajusta la guardia.
- La coincidencia se calcula con las asignaciones actuales, usando los días completos del permiso en horario de Madrid.
- No se instalan dependencias. Los cambios se verifican y se publican en commits pequeños en la rama de estabilización.

## Verificación por pasos

1. Generación: 303 pruebas habituales y 37 de integración PostgreSQL correctas. La nueva carrera fuerza dos lecturas del calendario antes de insertar: hay un aborto real, un reintento y 53 semanas finales sin duplicados. Tipos de integración y compilación backend correctos. Esquema temporal eliminado; la base de demostración no se usa para estas pruebas.
2. Calendario mensual: lint y compilación frontend correctos. Navegador local: abrir desde supervisor, cambiar de mes, seleccionar una semana vacía y guardar principal/secundario en una sola petición. El calendario marca los siete días y muestra los nombres guardados. Los selectores consultan técnicos activos de toda la delegación, incluidos los que no pertenecen a equipos.
3. Observaciones: la bandeja muestra el texto de la solicitud, conserva saltos de línea y presenta «Sin observaciones» cuando está vacío. Se renderiza como texto React, sin interpretar HTML.
