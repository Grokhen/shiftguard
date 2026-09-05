# Auditoría de ShiftGuard — 5 de septiembre de 2026

Este informe conserva el diagnóstico del commit auditado. Después se aplicó una [primera tanda de estabilización](C:/Users/lacro/Desktop/Proyectos/ShiftGuard/docs/estabilizacion-2026-09-05.md), que detalla las correcciones, verificaciones y limitaciones pendientes.

**Dictamen:** MVP funcional con una base técnica aprovechable y comprobaciones automáticas que pasan. Recomiendo una fase de estabilización antes de utilizarlo en producción con datos reales. Los principales obstáculos son la autorización de sesiones ya emitidas, el aislamiento entre delegaciones y la integridad de guardias y permisos. Mantendría el monorepo, Express, Prisma y React.

**Alcance y evidencia.** Revisión del checkout local `main`, commit `f857259`, inicialmente sin cambios locales. Se revisaron los routers backend, autenticación, modelo Prisma y migración, flujos frontend, dependencias, CI y documentación. Se ejecutaron compilaciones, lint, pruebas existentes, validación del schema y consultas a npm audit. Además, seis comprobaciones usaron las rutas Express compiladas y Supertest con persistencia simulada en memoria y credenciales sintéticas. No conectaron con una base real.

No se verificaron un despliegue remoto, ejecuciones remotas de GitHub Actions, protección de ramas, instalación limpia ni flujos completos en navegador con PostgreSQL. El comando `docker` no está disponible en este entorno. Esto limita las conclusiones sobre operación y concurrencia real. La única incorporación al repositorio es este informe: no se cambiaron lógica de aplicación, dependencias, secretos ni migraciones.

**Estado comprobado**

| Área | Resultado | Interpretación |
| --- | --- | --- |
| Entorno | Node `22.23.2`, npm `10.9.8` | Compatible con los requisitos declarados; `.nvmrc` fija `22.12.0`. |
| Backend | Compilación TypeScript correcta | El código y el cliente Prisma instalado compilan. |
| Frontend | Compilación TypeScript y Vite correcta | Bundle JS de 305,57 kB, 85,80 kB gzip; no demuestra rendimiento en uso real. |
| Lint raíz | Correcto | El script raíz solo ejecuta lint frontend; no existe un paso equivalente para backend. |
| Tests backend | **45/45 correctos**, un archivo de tests | Vitest + Supertest; Prisma y Argon2 simulados. No prueban rollback o aislamiento real de PostgreSQL. |
| Prisma | Schema válido | No se aplicaron migraciones ni se comprobó el estado de una base desplegada. |
| CI | Workflow presente en `main` | Incluye instalación con `npm ci`, tests backend, ambos builds y lint frontend. |
| Frontend/E2E | No hay suite configurada en el repositorio | Faltan pruebas de navegación, sesión y flujos entre roles. |
| Dependencias | 81 entradas afectadas según npm audit | 49 altas, 26 moderadas, 6 bajas y 0 críticas. |
| Dependencias sin desarrollo | 19 entradas con `--omit=dev` | 16 altas y 3 moderadas; incluye dependencias de ambos workspaces y cadenas transitivas. |

La primera compilación frontend y la primera ejecución de Vitest fallaron por acceso denegado de esbuild a directorios superiores dentro del sandbox. Ambas pasaron al repetir los mismos scripts fuera de esa restricción. Por tanto, no se clasifican como fallos del proyecto. Quedan avisos de antigüedad de los datos de Browserslist y Baseline.

**Lo que ya está bien resuelto**

- Separación backend/frontend y módulos backend por dominio, razonable para este tamaño.
- TypeScript estricto y validaciones Zod en las entradas principales.
- Argon2 con pepper, JWT de 15 minutos y rechazo de usuarios inactivos o bloqueados al iniciar sesión.
- Controles por rol y delegación en las rutas revisadas; helpers compartidos de autorización.
- Selecciones explícitas de campos de usuario en las respuestas revisadas para evitar devolver `password_hash`.
- Roles de usuario por código en frontend y consulta de roles de guardia al backend.
- Creación de guardias y asignaciones en una transacción; reemplazo de asignaciones también transaccional.
- Claves foráneas, índices y unicidad para evitar repetir usuario o rol dentro de una misma guardia.
- CI incorporada y pruebas de autorización y varios casos límite.

**Hallazgos prioritarios.** P1 indica una corrección necesaria antes de producción; P2, un problema relevante de robustez o de flujo. La prioridad expresa impacto y orden recomendado, no una puntuación CVSS.

**1. P1 — Un token conserva privilegios aunque cambie la cuenta.**

En [authRequired.ts](C:/Users/lacro/Desktop/Proyectos/ShiftGuard/apps/backend/src/middlewares/authRequired.ts:33) se verifica el JWT y se copia su contenido a `req.user`. [authz.ts](C:/Users/lacro/Desktop/Proyectos/ShiftGuard/apps/backend/src/utils/authz.ts:15) busca el rol usando el ID del token, sin cargar el estado, rol o delegación actuales del usuario. Dar de baja a alguien, degradar un administrador o trasladar un supervisor no modifica sus permisos efectivos con el token existente hasta su expiración, durante un máximo aproximado de 15 minutos. Cambiar la contraseña tampoco revoca esos tokens.

La comprobación configuró un usuario actualmente inactivo, técnico y de otra delegación. Un JWT previo de administrador obtuvo `200` en `GET /api/usuarios`; no hubo ninguna consulta al usuario actual. Es una reproducción de la decisión de autorización mediante mocks, no un acceso a cuentas reales.

Recomendación: resolver la identidad vigente por `sub` antes de autorizar, rechazar cuentas inactivas/bloqueadas y utilizar rol y delegación actuales. Añadir una versión de sesión o mecanismo equivalente para invalidar tokens al cambiar contraseña o revocar sesiones. Criterio de cierre: el token anterior deja de permitir las acciones afectadas inmediatamente después de cada cambio sensible.

**2. P1 — Trasladar equipos o usuarios puede romper el aislamiento entre delegaciones.**

[La edición de equipos](C:/Users/lacro/Desktop/Proyectos/ShiftGuard/apps/backend/src/modules/equipos/router.ts:127) cambia `delegacion_id` directamente, conservando miembros. [La edición de usuarios](C:/Users/lacro/Desktop/Proyectos/ShiftGuard/apps/backend/src/modules/usuarios/router.ts:209) permite el traslado sin reconciliar equipos o asignaciones. Posteriormente, [la consulta de permisos de equipo](C:/Users/lacro/Desktop/Proyectos/ShiftGuard/apps/backend/src/modules/equipos/router.ts:263) usa los IDs de sus miembros sin comprobar la delegación actual de esos usuarios.

Reproducción con datos simulados: equipo de delegación 1 con un miembro de delegación 1 → administrador mueve el equipo a delegación 2 → supervisor de delegación 2 consulta sus permisos. Ambas peticiones devolvieron `200` y la segunda incluyó un permiso del usuario de delegación 1. El escenario requiere un traslado administrativo previo; no se observó una ruta que permita al supervisor efectuar ese traslado por sí mismo.

Recomendación: inicialmente rechazar traslados que dejen relaciones incompatibles y añadir filtros de delegación a las lecturas como defensa adicional. Diseñar posteriormente un traslado transaccional explícito que trate equipos, guardias futuras e histórico según la política acordada. Criterio de cierre: pruebas de lectura y escritura antes y después de mover tanto un equipo como un usuario.

**3. P1 — Una actualización parcial de guardia acepta fechas invertidas.**

La validación de entrada compara fechas solo cuando ambas llegan en el PATCH. Tras combinar el cambio con las fechas existentes en [guardias/router.ts](C:/Users/lacro/Desktop/Proyectos/ShiftGuard/apps/backend/src/modules/guardias/router.ts:378), falta comprobar nuevamente `fecha_fin > fecha_inicio`. La migración existente tampoco contiene un `CHECK` que lo impida.

Reproducción: una guardia del 5 de septiembre, de 08:00 a 16:00 UTC, recibió únicamente `fecha_inicio = 2026-09-06T08:00:00Z`. La ruta devolvió `200` y entregó a la persistencia un intervalo invertido.

Recomendación: validar las fechas resultantes antes de cualquier escritura y añadir un `CHECK` mediante una migración nueva, previa revisión de datos existentes. Criterio de cierre: PATCH de solo inicio, solo fin, igualdad y fechas válidas; ningún caso inválido debe escribir.

**4. P1 — Las transacciones actuales no garantizan ausencia de solapes ni una única decisión.**

En [la creación de guardias](C:/Users/lacro/Desktop/Proyectos/ShiftGuard/apps/backend/src/modules/guardias/router.ts:295) se consulta el solape antes de entrar en la transacción. La edición repite el patrón. Dos solicitudes pueden observar el mismo hueco y crear guardias incompatibles. La migración no tiene una restricción de exclusión. Esta carrera se identifica por revisión del código; no se ejecutó contra PostgreSQL.

En [la decisión de permisos](C:/Users/lacro/Desktop/Proyectos/ShiftGuard/apps/backend/src/modules/permisos/router.ts:225), la comprobación de `PENDIENTE` y el `update` por ID son operaciones separadas. Se simularon dos lecturas concurrentes del estado pendiente: aprobar y rechazar devolvieron ambos `200` y realizaron dos escrituras.

Recomendación para guardias: preservar la regla actual de solape por delegación mediante una restricción de exclusión de rangos y validación amistosa en API. PostgreSQL permite combinar la igualdad de una clave con la exclusión de intervalos usando GiST y `btree_gist`; requiere una migración nueva y revisar los datos previos. [Documentación oficial de PostgreSQL](https://www.postgresql.org/docs/16/rangetypes.html#RANGETYPES-CONSTRAINT).

Para permisos, efectuar una actualización condicionada al estado pendiente y devolver un conflicto si otra petición ya decidió. Criterio de cierre: pruebas con PostgreSQL real donde dos solicitudes compiten y solo una modificación incompatible prospera.

**5. P1 — Falta completar el endurecimiento de credenciales y errores.**

El [seed](C:/Users/lacro/Desktop/Proyectos/ShiftGuard/apps/backend/src/prisma/seed.ts:93) admite una contraseña administrativa predeterminada y [la escribe en consola](C:/Users/lacro/Desktop/Proyectos/ShiftGuard/apps/backend/src/prisma/seed.ts:117), incluso si procede de `SEED_ADMIN_PASSWORD`. No se ejecutó el seed ni se verificó si una instalación real conserva esa contraseña. El riesgo existe al aprovisionar cuentas y al conservar logs.

No hay limitación de intentos de login en el código de aplicación. `intentos_fallidos` existe en Prisma, pero no se utiliza. Los usuarios nuevos tienen `requiere_reset: true`, aunque el login y la autorización no imponen ese cambio y el frontend no ofrece un flujo propio de cambio de contraseña. El reset administrativo establece ese indicador a `false`.

Además, [errorHandler.ts](C:/Users/lacro/Desktop/Proyectos/ShiftGuard/apps/backend/src/middlewares/errorHandler.ts:14) devuelve `err.message` incluso para errores 500. Una excepción interna sintética llegó íntegra a la respuesta HTTP. Los errores reales de Prisma pueden contener detalles de invocación o esquema; no se ha demostrado exposición de un secreto real.

Recomendación: exigir contraseña explícita para el seed y eliminar su impresión; aplicar limitación de intentos con una política definida; completar el cambio obligatorio; emitir errores 500 genéricos y mapear conflictos y referencias inválidas a respuestas controladas. El tratamiento de intentos repetidos está respaldado por las [recomendaciones de autenticación de OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html#login-throttling).

**6. P2 — La disponibilidad de los asignados no se valida.**

[La validación de asignaciones](C:/Users/lacro/Desktop/Proyectos/ShiftGuard/apps/backend/src/modules/guardias/router.ts:79) comprueba existencia, delegación y duplicados, pero no `activo`, rol de usuario o permisos aprobados que coincidan. El alta individual de asignaciones tiene el mismo límite. La comprobación con un usuario inactivo obtuvo `201`.

Recomendación: rechazar usuarios inactivos desde backend. Acordar si solo se asignan técnicos, qué ausencias bloquean una guardia y qué hacer cuando se aprueba una ausencia después de planificarla. Implementar las reglas en ambas direcciones; filtrar el selector frontend no sustituye la validación backend. `SaldoPermiso` existe, pero no hay lógica de consumo, cálculo o validación de saldos: es una funcionalidad pendiente, no una garantía existente.

**7. P2 — El panel de pendientes no cubre todas las solicitudes de la delegación.**

[SupervisorDashboard](C:/Users/lacro/Desktop/Proyectos/ShiftGuard/apps/frontend/src/pages/SupervisorDashboard.tsx:158) obtiene permisos de cada equipo para el año actual y concatena los resultados. Un técnico sin equipo puede solicitar un permiso, pero no aparecerá en esta bandeja. Un usuario en varios equipos puede aparecer repetido. Una solicitud para el año siguiente queda oculta por el filtro, aunque necesite decidirse ahora. Estos efectos se deducen del código y del modelo de membresía múltiple; no se probaron en navegador.

Recomendación: un endpoint de permisos pendientes por delegación, autorizado en backend, independiente de la pertenencia a equipos y sin un filtro anual implícito. Añadir paginación y filtros explícitos. Criterio de cierre: casos sin equipo, varios equipos y solicitudes de diciembre para enero, mostrados una sola vez.

**8. P2 — Caducidad de sesión y refresco de pantalla incompletos.**

[AuthProvider](C:/Users/lacro/Desktop/Proyectos/ShiftGuard/apps/frontend/src/context/AuthProvider.tsx:21) comprueba la expiración al inicializarse; durante la sesión `isAuthenticated` solo depende de que existan token y usuario. [apiClient](C:/Users/lacro/Desktop/Proyectos/ShiftGuard/apps/frontend/src/services/apiClient.ts:6) transforma un 401 en un error genérico de petición. Pasados 15 minutos, el backend rechaza las operaciones y la interfaz puede seguir mostrando una sesión iniciada.

Recomendación: manejo central del 401 y expiración, retorno coherente al login y conservación controlada del contexto del formulario. Decidir después si hace falta renovación de sesión. El almacenamiento en `localStorage` amplía el impacto de una eventual XSS; no se encontró una XSS propia demostrada en esta revisión.

El panel supervisor tampoco actualiza sus guardias tras crear una, dispara de nuevo la carga global al cambiar equipo y no descarta respuestas de selecciones anteriores. Conviene corregir esos estados antes de dividir la pantalla en componentes y hooks pequeños. El cliente genérico también debe contemplar respuestas 204 si se conecta el cambio de contraseña existente.

**9. P2 — Fechas y estados necesitan un contrato más preciso.**

Los validadores llamados `iso` aceptan cualquier texto que `Date.parse` considere válido. Los filtros anuales de [permisos](C:/Users/lacro/Desktop/Proyectos/ShiftGuard/apps/backend/src/modules/permisos/router.ts:73) y [equipos](C:/Users/lacro/Desktop/Proyectos/ShiftGuard/apps/backend/src/modules/equipos/router.ts:272) usan únicamente `fecha_inicio` y límites construidos en hora local del servidor. Un permiso de diciembre a enero no aparece al consultar el año nuevo; los límites también pueden variar por zona horaria. Las guardias aceptan cualquier texto como estado.

Recomendación: fechas de permisos como fechas civiles estrictas; guardias como instantes con zona explícita; búsqueda por intersección de intervalos cuando el objetivo sea disponibilidad. Definir estados y transiciones admitidas, así como el efecto de una cancelación en la comprobación de solapes. Probar cambios de año y horario de verano. Los códigos de rol de usuario también deberían tratarse como identificadores estables: actualmente su endpoint de edición permite modificarlos libremente y romper las comprobaciones por código.

**Dependencias: prioridad de mantenimiento con evaluación de alcance.**

Los totales de npm audit corresponden a entradas de paquetes afectados, incluidas cadenas transitivas; no equivalen a 81 vulnerabilidades distintas explotables en ShiftGuard. `--omit=dev` tampoco representa por sí solo el contenido exacto de un despliegue.

Se verificaron versiones instaladas: Express `5.1.0`, Prisma `6.19.0`, jsonwebtoken `9.0.2`, jws `3.2.2`, React Router `7.9.6` y Vite `7.2.4`. Tres comprobaciones concretas evitan sobredimensionar el resultado:

- La alerta de jws sobre verificación HMAC excluye expresamente a consumidores de `jws.verify`, incluidos usuarios de jsonwebtoken. El código instalado de jsonwebtoken utiliza esa interfaz. Sigue siendo recomendable actualizar la dependencia, pero esta alerta no demuestra un bypass de autenticación aquí. [Aviso del mantenedor de jws](https://github.com/auth0/node-jws/security/advisories/GHSA-869p-cjfg-cm3x).
- La alerta de React Router sobre `ScrollRestoration` durante SSR no aplica al modo declarativo con `BrowserRouter`, que usa este frontend. Esto no descarta todas las demás alertas de React Router. [Aviso del mantenedor de React Router](https://github.com/remix-run/react-router/security/advisories/GHSA-8v8x-cx79-35w7).
- La alerta de lectura arbitraria por WebSocket de Vite exige exponer el servidor de desarrollo a la red. Los scripts y la configuración revisados no activan `--host` ni `server.host`; una forma distinta de arrancarlo puede cambiar la exposición. El aviso pertenece al servidor de desarrollo. [Aviso del mantenedor de Vite](https://github.com/vitejs/vite/security/advisories/GHSA-p9ff-h696-f583).

Abrir una actualización controlada por grupos, priorizando dependencias de ejecución y herramientas expuestas, y documentar por aviso versión instalada, condición de uso, corrección disponible y riesgo residual. Ejecutar de nuevo tests, builds y audit tras cada grupo. No se instalaron paquetes ni se ejecutó `npm audit fix`; algunas entradas no ofrecieron arreglo automático en la respuesta consultada.

**Preparación operativa y mantenibilidad.**

El repositorio contiene un Compose para PostgreSQL, pero no un despliegue completo de aplicación. Ese Compose usa credenciales locales conocidas y publica el puerto 5433 sin limitarlo a loopback. Antes de producción, definir despliegue frontend/backend, HTTPS, orígenes CORS explícitos, gestión de secretos, aplicación de migraciones y restauración de copias de seguridad. El `/health` actual solo confirma que Express responde; añadir una comprobación de disponibilidad de base de datos diferenciada y cierre ordenado del servidor.

Hay campos de autor/decisor en algunas entidades, pero falta una auditoría de cambios y una fecha de decisión en permisos. Definir eventos y retención, evitando registrar contraseñas, tokens u observaciones sensibles innecesarias. Añadir paginación a listados que hoy cargan todos los registros y medir antes de introducir optimizaciones mayores.

En frontend, revisar asociaciones entre etiquetas y campos y la accesibilidad de los modales, y sustituir `prompt`/`alert` en las decisiones de permisos. Son mejoras acotadas; un rediseño visual no es prioritario. Extraer reglas de negocio a funciones comprobables y reutilizables donde reduzca duplicación; no se justifica introducir microservicios o una nueva arquitectura de persistencia.

La documentación está desactualizada: [next-steps.md](C:/Users/lacro/Desktop/Proyectos/ShiftGuard/docs/next-steps.md:160) propone abrir la PR de CI, aunque su workflow ya está en `main`, y describe como pendientes instrucciones ya presentes en `AGENTS.md`. El [README](C:/Users/lacro/Desktop/Proyectos/ShiftGuard/README.md:117) sigue describiendo la creación de guardia en dos llamadas. Actualizar esas referencias, documentar contratos de API y añadir ejemplos de entorno sin secretos.

**Próximos pasos, en orden recomendado**

| Orden | Cambio acotado | Criterio de finalización |
| --- | --- | --- |
| 1 | Autorización con cuenta actual y revocación de sesiones | Pruebas de baja, bloqueo, cambio de rol/delegación y contraseña con un token ya emitido. |
| 2 | Integridad de traslados y aislamiento de lecturas | Ninguna relación incompatible permite leer o asignar datos de otra delegación; casos de equipo y usuario cubiertos. |
| 3 | Fechas, solapes y decisión única | Validación del PATCH corregida; nuevas restricciones si procede; pruebas concurrentes y de rollback con PostgreSQL de test. |
| 4 | Seed, login, reset y errores; mantenimiento de dependencias en PRs separadas | No se imprimen contraseñas; fallos internos no se reflejan; política de intentos y reset comprobada; audit revisado tras actualizar. |
| 5 | Bandeja completa de pendientes y ciclo de sesión frontend | E2E: alta → login → cambio de contraseña → guardia → permiso → decisión; casos sin equipo, cambio de año y sesión caducada. |
| 6 | Preparar piloto y operación | Entorno reproducible, CI con integración/E2E, datos sintéticos, restauración de backup verificada, trazabilidad mínima y documentación actualizada. |

La incorporación de herramientas o paquetes nuevos en estos pasos deberá respetar la regla del proyecto de obtener permiso explícito para instalar dependencias. Esta auditoría no las instala ni ejecuta los cambios propuestos.

**Primera tarea concreta recomendada:** corregir la autorización con tokens ya emitidos y añadir sus regresiones. Es un cambio delimitado, aprovecha los helpers y tests existentes y reduce directamente el riesgo sobre datos y acciones administrativas. Después, cerrar el aislamiento de traslados y la integridad transaccional antes de ampliar funciones como notificaciones o un calendario avanzado.
