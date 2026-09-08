# Flujos autenticados de API — 8 de septiembre de 2026

La integración anterior comprobaba transacciones y autorizaciones con JWT generados en las fixtures. Esta tanda añade nueve pruebas que obtienen todas sus sesiones mediante `POST /api/auth/login` y recorren los flujos con Express, Argon2 y PostgreSQL reales.

## Alcance

`apps/backend/integration/auth-flows.test.ts` comprueba:

1. El administrador creado por el seed puede entrar. Repetir el seed con otra contraseña conserva sus credenciales, sus datos y su sesión; la contraseña propuesta en la segunda ejecución no permite el acceso.
2. Alta de un técnico y un supervisor, primer login restringido, cambio obligatorio de contraseña, nuevo login, solicitud de vacaciones, decisión y lectura del resultado por el técnico. Se ejecuta tanto con aprobación como con rechazo. El técnico no puede decidir su propia solicitud y el pendiente desaparece de la bandeja tras la decisión.
3. Un restablecimiento de contraseña por el administrador invalida el token y la contraseña anteriores. La contraseña temporal exige otro cambio; los intentos con contraseña actual incorrecta o sin modificarla dejan intactos el hash, la versión y el requisito de cambio. Completar la recuperación invalida también la sesión y la contraseña temporales.
4. Activar `requiere_reset` después del login restringe incluso una sesión de administrador ya emitida. Se permite consultar el perfil y cambiar la contraseña; modificar el perfil no permite desactivar el requisito.
5. Cambiar el rol, trasladar de delegación o desactivar una cuenta invalida su token anterior. Un nuevo login aplica el rol y la delegación actuales; una cuenta desactivada tampoco puede entrar. El traslado cambia los equipos visibles por la API sin exponer los de la delegación anterior.
6. Dos cambios de contraseña leen el mismo hash antes de escribir. Uno recibe 204 y el otro 409. Solo persiste una contraseña; la anterior y la perdedora no permiten entrar, y las dos sesiones previas quedan invalidadas.

Se comprueba el almacenamiento del hash con el pepper configurado, la actualización de la versión de contraseña y la ausencia de `password_hash` en las respuestas de alta, perfil, restablecimiento y bandeja de pendientes. Los roles, tipos y estados se obtienen por sus códigos desde los catálogos de la API.

## Ejecución y aislamiento

Estas pruebas forman parte de la suite de integración existente:

```sh
npm run typecheck:integration --workspace backend
npm run test:integration --workspace backend
```

La segunda orden exige `TEST_DATABASE_URL` explícita hacia una base local `shiftguard_test`. El ejecutor valida el destino, crea un esquema aleatorio, aplica las migraciones y elimina ese esquema al terminar. Ver el [informe de integración](integracion-postgresql-2026-09-05.md).

El seed se ejecuta dentro de ese esquema con una contraseña aleatoria mantenida en memoria. Los demás usuarios y delegaciones de estos flujos se crean por la API. Las pruebas mantienen activos el limitador de login, las validaciones y los middlewares de autenticación; la barrera de concurrencia solo retrasa la entrega de dos lecturas reales del hash. Las contraseñas de prueba no se guardan en archivos de entorno.

## Verificación

- Commit `c81b121`, verificado en [CI, ejecución 18](https://github.com/Grokhen/shiftguard/actions/runs/34269407893).
- **324 pruebas correctas**: 288 habituales y 36 de integración. Las nueve nuevas se suman a las 27 de PostgreSQL de la tanda anterior.
- CI confirma los flujos con Argon2 y PostgreSQL 16, el conflicto entre los cambios de contraseña y la eliminación del esquema temporal `shiftguard_it_7eb93537cef6448fadfaa42cb53496c8`.
- También pasan generación de Prisma, tipos de integración, compilaciones backend/frontend y lint frontend.
- Localmente pasan las 288 pruebas habituales, los tipos de integración, el formato del archivo nuevo y la compilación backend con Node 22.23.2. La ejecución contra PostgreSQL se verificó en CI porque esta sesión no tiene `TEST_DATABASE_URL` definida.

## Límites y siguiente paso

La cobertura atraviesa las rutas HTTP y PostgreSQL. Las pantallas React y la navegación del usuario requieren todavía pruebas E2E con navegador. Esta tanda no añade dependencias ni cambia el comportamiento de producción, las migraciones o las reglas de disponibilidad ante ausencias aprobadas.

La rama sigue pendiente de revisión e integración en `main`; estos cambios no despliegan la aplicación.
