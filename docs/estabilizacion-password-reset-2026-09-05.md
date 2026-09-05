# Cambio obligatorio de contraseña — 5 de septiembre de 2026

Esta tanda aplica el campo existente `requiere_reset` y completa el flujo entre API e interfaz. No modifica Prisma ni necesita migraciones, dependencias nuevas o cambios de secretos.

## Comportamiento

- El login incluye `requiresPasswordChange` en el JWT para dirigir al usuario a `/cambiar-password`.
- En cada petición autenticada, la API comprueba `requiere_reset` en la cuenta actual. Mientras esté activo, todas las rutas protegidas devuelven 403 con `code: PASSWORD_CHANGE_REQUIRED`, salvo la lectura del perfil propio y el cambio de contraseña propio. La restricción se aplica también a administradores y a tokens anteriores sin el nuevo indicador.
- Las excepciones se registran expresamente en las dos rutas de usuario. Conservan la comprobación de firma, caducidad, cuenta activa/no bloqueada y versión de contraseña; no permiten consultar o modificar otras cuentas.
- Un reset administrativo activa el cambio obligatorio e invalida las sesiones anteriores. El PATCH administrativo admite `requiere_reset: true`; enviar `false` devuelve 400. Solo un cambio propio válido elimina la obligación.
- El cambio propio exige conocer la contraseña actual y elegir una distinta de al menos 8 caracteres. Se mantiene la comprobación del hash al escribir para evitar sobrescribir otro cambio concurrente.
- La interfaz valida confirmación y diferencia de contraseñas, muestra errores de la API y cierra la sesión afectada tras guardar. El login muestra el aviso de éxito; una respuesta tardía de una sesión antigua no debe cerrar otra sesión.
- Si se activa la obligación durante una sesión, el cliente reconoce el 403 específico y redirige al formulario. Los demás 403 conservan su comportamiento. Una entrada directa al panel con un JWT marcado también redirige.
- El enlace «Cambiar contraseña» permite usar el mismo formulario voluntariamente desde los paneles.

## Verificación

- 134 pruebas automatizadas correctas: se añaden 23 de cambio obligatorio y 7 del contrato del cliente a las 104 existentes.
- Compilaciones backend y frontend correctas; lint frontend correcto. Persisten los avisos previos sobre la antigüedad de Browserslist y Baseline.
- Regresiones para técnico, supervisor y administrador; restricciones en todos los módulos; activación posterior al login; contraseña incorrecta o idéntica; conflicto al escribir; cuentas bloqueadas/inactivas; reset administrativo e invalidación del token anterior.
- Verificación adicional en navegador con el frontend y las rutas reales del backend, sustituyendo únicamente Prisma por cuentas temporales en memoria. Se usó Argon2 real. Se comprobó login restringido, entrada directa al panel, confirmación incorrecta, contraseña actual incorrecta, guardado, aviso de éxito, nuevo login y activación posterior de la obligación.
- La comprobación visual y de interacción no sustituye una suite E2E automatizada ni prueba la persistencia o las carreras reales en PostgreSQL. Los servidores temporales de verificación se detienen al finalizar.

## Despliegue y próximos pasos

Desplegar backend y frontend juntos. Las cuentas que ya tengan `requiere_reset: true` deberán completar el formulario al entrar. Si desconocen su contraseña actual, un administrador debe restablecerla. No se reescriben cuentas existentes ni se cambia su contraseña mediante el seed.

El siguiente bloque recomendado es la integración con PostgreSQL para probar transacciones y concurrencia. Después, revisar la bandeja de permisos pendientes por delegación, el contrato de fechas y los solapes con ausencias aprobadas. La revocación persistente de sesiones, el límite de login compartido entre instancias y las actualizaciones revisadas de dependencias siguen pendientes.
