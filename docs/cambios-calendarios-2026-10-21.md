# Cambios solicitados — 21 de octubre de 2026

Lista de ejecución, en el orden solicitado:

- [x] 1. Predefinir guardias semanales vacías por delegación; incluir semanas que cruzan de año.
- [x] 2. Sustituir el formulario del supervisor por un calendario mensual con consulta por día y edición de técnicos.
- [x] 3. Mostrar al supervisor las observaciones de las solicitudes.
- [x] 4. Añadir calendario anual del técnico: principal rojo, secundario amarillo y consulta de compañeros de su delegación.
- [x] 5. Avisar de permisos coincidentes con guardias, recoger sustituto opcional y resaltar el conflicto al supervisor.
- [x] 6. Añadir Volver a la derecha del título en las secciones de administración.

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
4. Calendario anual: 305 pruebas habituales correctas, lint y compilación frontend correctos. Navegador local: doce meses, próximas asignaciones y selección de la semana del 23 de noviembre con ambos nombres y roles. Las marcas distinguen P/rojo y S/amarillo; al seleccionar un día, el foco y la vista regresan al detalle. Se reutiliza la consulta por delegación, sin habilitar escrituras al técnico.
5. Conflictos: 316 pruebas habituales y 40 de integración PostgreSQL correctas. Se verifica confirmación obligatoria, sustituto opcional, conservación de observaciones, aislamiento de usuarios/delegaciones, límite de 200 caracteres, límites inclusivos/exclusivos y revalidación después de una comprobación inicial sin asignaciones. La bandeja consulta los conflictos en una sola consulta adicional, y el aviso desaparece cuando cambia la asignación. Cliente Prisma regenerado; tipos, compilaciones y lint correctos.

   Navegador local: permiso del 23–24 de noviembre, aviso previo, propuesta «Nerea Prueba local», confirmación y solicitud resaltada en la bandeja con las observaciones completas. Se deja pendiente para probarlo manualmente. La migración nueva `20261021131500_permission_substitute` añade solo una columna nullable; no cambia las migraciones anteriores. Aplicada en la base de demostración, conservando sus datos.
6. Administración: «Volver» a la derecha del título en usuarios, delegaciones y equipos, y sus formularios de alta. Navegador local: cada alta vuelve a su listado y cada listado vuelve al menú de administración. Lint y compilación frontend correctos.

## Contratos nuevos

| Ruta | Alcance y comportamiento |
| --- | --- |
| `POST /api/guardias/calendario` | Supervisor/admin, `{ anio }` entre 2000 y 2100; prepara semanas vacías solo en su delegación. No acepta cambiar la delegación del token. |
| `GET /api/guardias/calendario?anio=2026` | Cualquier usuario autenticado, solo su delegación. Incluye asignaciones y datos de compañeros seleccionados sin credenciales. |
| `GET /api/guardias/tecnicos` | Supervisor/admin; técnicos activos de su delegación, pertenezcan o no a equipos. |
| `POST /api/permisos/comprobar-guardias` | Fechas `YYYY-MM-DD`; comprueba únicamente las asignaciones del usuario autenticado y su delegación. |
| `POST /api/permisos` | Si existe coincidencia y falta `confirmar_conflicto_guardias: true`, devuelve 409 con código `SHIFT_CONFLICT` y las guardias. `sustituto_nombre` es opcional, máximo 200 caracteres. Revalida aunque el cliente haya hecho la comprobación previa. Los clientes externos deben gestionar esta nueva confirmación. |
| `GET /api/permisos/pendientes` | Conserva su autorización y añade `conflictos_guardias` calculados con las asignaciones actuales. `sustituto_nombre` no se elimina al decidir la solicitud. |

Total local: **356 pruebas correctas**, 316 habituales y 40 de integración. También pasan generación de Prisma, tipos de integración, compilaciones backend/frontend y lint frontend. Los esquemas temporales de integración se eliminaron. Persisten únicamente los avisos previos sobre datos de navegadores y la configuración de seed de Prisma obsoleta.
