# Memoria del proyecto

Actualizada el 21 de octubre de 2026.

## Estado publicado

- Rama de trabajo: `codex/security-stabilization`. Pendiente de revisión e integración en `main`; publicar la rama no despliega la aplicación.
- El planificador anual distingue los inicios de semana asignados (verde, «Asignada») de los vacíos (violeta, «Vacía»), con leyenda y actualización tras guardar. Verificado con lint, compilación frontend y navegador local.
- `254d610` añade planificación de guardias del año actual o siguiente, con validación en el servidor según Europe/Madrid.
- `75cb3e9` corrige el resumen del periodo: una semana desde el 05/01/2026 muestra hasta el 12/01/2026.
- Verificación del cambio funcional: 341 pruebas habituales y 46 de integración PostgreSQL, 387 en total; tipos de integración, compilaciones y lint correctos. [CI correcta](https://github.com/Grokhen/shiftguard/actions/runs/39627178075).

## Funcionalidad disponible

- Semanas naturales vacías, de lunes 00:00 al lunes siguiente en Madrid, incluyendo los días adyacentes de diciembre/enero. Preparar años contiguos conserva las asignaciones de la semana compartida.
- Supervisor: calendario mensual para consultar/modificar técnicos y planificador anual con principal, secundario opcional y repetición cada N semanas hasta acabar el año elegido. Las asignaciones distintas requieren confirmación expresa para reemplazarlas.
- Técnico: próximas guardias, calendario anual y consulta de compañeros de su delegación. Solicitar permisos con coincidencias requiere confirmación y permite proponer un sustituto.
- Supervisor: observaciones y propuesta de sustituto visibles; el resaltado de conflicto desaparece cuando el solicitante deja de estar asignado a las guardias coincidentes. Actualización entre pestañas, al recuperar el foco y cada 30 segundos mientras el panel está visible.
- Administración: enlaces «Volver» en las secciones.

Detalle y evidencias en [planificación anual](planificacion-anual-2026-10-21.md), [cambios de calendarios](cambios-calendarios-2026-10-21.md) e [integración PostgreSQL](integracion-postgresql-2026-09-05.md).

## Propuesta pendiente: historial y protección de excepciones

El usuario ha planteado conservar los cambios sobre la planificación original para evitar perder sustituciones por vacaciones, bajas u otras incidencias. Se ha propuesto lo siguiente; **todavía no está implementado y falta concretar el alcance**:

- Modificar una semana o una serie desde el planificador.
- Pedir motivo al cambiar asignaciones existentes.
- Historial desplegable por guardia con asignaciones anteriores/nuevas, autor, fecha y motivo.
- Conservar por defecto las semanas ajustadas manualmente al replanificar una serie; sustituirlas solo tras seleccionarlas expresamente.

Actualmente la confirmación de reemplazo abarca las semanas objetivo con asignaciones distintas; no distingue excepciones manuales ni guarda historial. No presentar esas protecciones propuestas como disponibles.

## Entorno local y comprobaciones

- Demo frontend: `http://127.0.0.1:5173`; API: `http://127.0.0.1:3001`. PostgreSQL 16 en el contenedor local `shiftguard-demo`, publicado solo en loopback, puerto 55432. Conservar los datos de prueba existentes.
- Los lanzadores locales están ignorados en `node_modules/.cache`; no son entregables versionados ni deben usarse como configuración de despliegue. Las credenciales de infraestructura se obtienen en ejecución; no guardarlas en esta memoria ni en archivos `.env` reales.
- Integración exclusivamente con `TEST_DATABASE_URL` hacia `shiftguard_test`, esquema aleatorio eliminado al finalizar. Nunca usar la base de demo/desarrollo como sustituto ni ejecutar `migrate reset`.
- No instalar dependencias sin permiso explícito. Mantener commits pequeños y publicar los cambios autorizados.
- No cerrar programáticamente el navegador ni sus pestañas, incluidas las de prueba.
