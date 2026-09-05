# Primera tanda de estabilización — 5 de septiembre de 2026

La primera tanda corrige autorización de sesiones, traslados entre delegaciones y varias reglas de integridad de la auditoría. Los cambios están en el checkout local; no se han desplegado.

La [segunda tanda](estabilizacion-seed-login-2026-09-05.md) elimina las credenciales predeterminadas del seed y añade límites de solicitudes al login. El resto de este documento conserva el alcance y la verificación de la primera tanda.

**Cambios aplicados**

- Cada petición autenticada consulta la cuenta activa y no bloqueada. Si cambian su rol, código de rol o delegación respecto al token, exige un nuevo login. La autorización usa los datos comprobados de la cuenta.
- Los JWT nuevos incluyen `passwordVersion`, derivado de `password_actualizada_en` en milisegundos. Tanto el cambio propio como el reset administrativo actualizan ese valor e invalidan tokens anteriores. Un login inmediatamente después del cambio funciona incluso dentro del mismo segundo.
- El cambio propio de contraseña comprueba que el hash no haya cambiado durante la operación. Las actualizaciones concurrentes incompatibles devuelven 409.
- El frontend cierra la sesión al caducar el token o recibir un 401 asociado al token de esa sesión. Los 403 mantienen la sesión y una respuesta de una sesión antigua se identifica con su token. El cliente admite respuestas 204 sin intentar leer JSON.
- Se rechazan traslados de equipos con miembros de otra delegación y de usuarios con equipos o guardias vigentes/futuras incompatibles. Las asignaciones históricas se conservan. El administrador puede seguir viendo miembros inconsistentes para corregirlos; los supervisores no reciben datos de usuarios de otra delegación en los detalles revisados ni en los permisos del equipo.
- Los traslados, altas de miembros y escrituras de guardias/asignaciones ejecutan lectura, validación y escritura en una transacción `Serializable`. Los conflictos P2034 reintentan toda la operación hasta tres veces; agotados los intentos, se devuelve 409. La validación de solapes ya está dentro de la transacción.
- Los PATCH parciales de guardias validan el intervalo resultante. Al cambiar fechas también se comprueban sus asignados existentes. Las altas, reemplazos y asignaciones individuales rechazan usuarios inactivos.
- La decisión de un permiso incluye su estado anterior y la delegación autorizada en la condición del UPDATE. Si otra petición ya cambió el registro, devuelve 409.
- Los errores 500 no devuelven mensajes internos. Los errores conocidos de duplicados, referencias inválidas y registros inexistentes se traducen a respuestas controladas.
- CI genera explícitamente el cliente Prisma antes de los tests. Durante esta tanda se regeneró el cliente local para comprobar los tipos correspondientes al schema real.

**Verificación**

- 85 pruebas correctas: 79 de rutas backend y 6 del contrato entre la API y el cliente frontend, ejecutadas con la infraestructura Vitest existente.
- Compilación backend con el cliente Prisma generado: correcta.
- Compilación frontend y lint frontend: correctos. Persisten avisos de antigüedad de los datos de Browserslist y Baseline.
- Las regresiones cubren tokens desactualizados, cambio de contraseña y login inmediato, traslados incompatibles, fechas parciales, asignados inactivos, reintentos tras conflictos y dos decisiones concurrentes simuladas.
- Se utilizan mocks de Prisma; todavía no se han verificado rollback, aislamiento o carreras reales con PostgreSQL, ni el ciclo completo en navegador.

**Consideraciones al desplegar**

Los tokens emitidos antes de este cambio no contienen `passwordVersion`: los usuarios deberán iniciar sesión de nuevo. Desplegar backend y frontend juntos permite gestionar ese rechazo en la interfaz. No se requieren migraciones de schema para esta tanda.

El middleware comprueba el estado actual de la cuenta. No incorpora una lista persistente de revocación para logout ni una versión independiente de sesión: si un administrador revierte un cambio de estado/rol/delegación antes de que caduque un token, ese token puede volver a coincidir con la cuenta. Los cambios de contraseña sí invalidan por versión. Una revocación persistente de sesiones sigue pendiente.

Las transacciones protegen las escrituras que pasan por estas rutas. No sustituyen restricciones de base de datos frente a otros escritores. Tampoco corrigen automáticamente inconsistencias previas ni definen reglas de disponibilidad por ausencias aprobadas.

No se instalaron dependencias, no se modificaron secretos o archivos `.env`, y no se aplicaron migraciones. Las alertas de dependencias de la auditoría siguen pendientes de actualización revisada.

**Siguiente bloque recomendado**

1. Ejecutar regresiones de integración en PostgreSQL de test: dos guardias para el mismo intervalo, dos decisiones, traslado frente a incorporación/asignación y rollback al fallar una asignación. Evaluar una migración nueva con `CHECK` de fechas y exclusión de solapes, revisando antes los datos existentes.
2. Eliminar la contraseña predeterminada y la impresión de contraseña del seed; completar limitación de intentos y cambio obligatorio de contraseña con su pantalla. Incorporar revocación persistente de sesiones si se necesita logout/revocación administrativa definitiva.
3. Resolver la bandeja de pendientes por delegación, el contrato de fechas y estados y la disponibilidad frente a ausencias. Añadir E2E de los flujos por rol.
4. Actualizar dependencias por grupos con autorización explícita para instalar, y preparar trazabilidad, despliegue y recuperación de copias de seguridad.
