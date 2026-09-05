# Protección del seed y del login — 5 de septiembre de 2026

Esta tanda continúa la auditoría con cambios acotados al backend, sus pruebas y la documentación. No requiere dependencias nuevas ni migraciones y no se ha desplegado.

## Seed

- Se elimina la contraseña predeterminada. `SEED_ADMIN_PASSWORD` debe definirse explícitamente y tener entre 12 y 128 caracteres; `AUTH_PEPPER` también es obligatorio. Esta validación ocurre antes de calcular el hash o escribir datos.
- El seed carga las variables del entorno y del `.env` del directorio de trabajo, también al ejecutarlo directamente mediante el script npm.
- Los catálogos, la delegación inicial y el admin se escriben en una sola transacción. El hash Argon2id se calcula antes de abrirla.
- Una cuenta ya existente conserva su contraseña, rol, delegación y estado. La contraseña explícita solo se usa al crear el admin.
- La salida muestra el correo de la cuenta, sin contraseñas ni hashes. Los errores de ejecución no imprimen argumentos internos de Prisma. El proceso establece un código de salida fallido y cierra la conexión.

El cambio no modifica cuentas creadas anteriormente con la contraseña predeterminada. Sus administradores deben restablecerla mediante el flujo de cambio de contraseña; volver a ejecutar el seed conserva las credenciales existentes.

## Login

- Hasta 10 solicitudes por cuenta y 50 por IP durante 15 minutos desde el primer intento de cada contador. Se cuentan todas las solicitudes admitidas, también las correctas, sin revelar si existe la cuenta.
- Los límites se comprueban antes de acceder a Prisma o verificar Argon2. Las reservas son síncronas para que las peticiones concurrentes también cuenten.
- El contador de cuenta usa el hash del correo normalizado para compartir el límite entre IPs y variantes de mayúsculas/espacios. La validación y búsqueda del correo para autenticar mantienen su comportamiento anterior.
- Un rechazo devuelve 429 y `Retry-After`. Los rechazos no prolongan la ventana.
- Se mantienen como máximo 10 000 contadores en memoria. Cuando no hay espacio, se rechazan nuevas claves hasta que caduquen las anteriores; no se borran contadores activos para hacer sitio y permitir eludir los límites.

Estos contadores son **locales a cada proceso**, se pierden al reiniciar y no sustituyen un límite compartido para varias réplicas ni protección frente a denegación de servicio en la infraestructura. No modifican `bloqueado_en` ni provocan bloqueos permanentes de cuentas. Express mantiene su política actual de no confiar en cabeceras de reenvío: detrás de un proxy se comparte su contador de IP. La configuración de proxies de confianza debe decidirse con la topología real antes del despliegue.

## Verificación

- 104 pruebas correctas: 80 de rutas, 6 del contrato del cliente, 10 del seed y 8 del limitador.
- Compilación backend correcta con el cliente Prisma generado.
- Las nuevas regresiones comprueban configuración incompleta, ausencia de sustitución de credenciales, fallos del seed, límites entre IPs/cuentas, cabeceras falsificadas, concurrencia, caducidad, capacidad y rechazo antes de consultar la base de datos.
- Prisma y Argon2 se simulan en las pruebas del seed y de rutas. La atomicidad y los conflictos reales de PostgreSQL siguen pendientes de integración.

## Próximos pasos

1. Completar el cambio obligatorio de contraseña: aplicar `requiere_reset` en la API y añadir la pantalla correspondiente. El reset administrativo también debe exigir ese cambio.
2. Añadir integración con PostgreSQL y E2E para los cambios de autorización y planificación ya realizados.
3. Revisar la bandeja de permisos pendientes por delegación, el contrato de fechas y la disponibilidad por ausencias aprobadas.
4. Preparar el límite compartido y la política de proxy para el despliegue real; revisar las actualizaciones de dependencias con permiso de instalación.
