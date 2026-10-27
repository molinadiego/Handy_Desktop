# Especificación — Tipos de personal

## Comportamiento
- El directorio permite clasificar cada registro como empleado, ayudante o subcontratista.
- Empleados existentes migran a tipo `employee`; no se pierden nombres, colores, asignaciones, costos por trabajo ni pagos.
- Los tres tipos pueden asignarse a órdenes, registrar tiempo/costo por trabajo y recibir pagos externos.
- Cambiar tipo o nombre no modifica historial financiero ni asignaciones.
- Los registros de personal no son cuentas de usuario: no hay inicio de sesión, roles ni permisos por tipo.

## Seguridad y errores
- Directorio aislado por workspace; datos locales/offline.
- No inferir que ser subcontratista habilita acceso a órdenes o códigos sensibles. La autorización por usuario queda pendiente.
- Tipo debe ser uno de los tres valores del catálogo; nombre obligatorio.

## Aceptación
- Se puede crear/editar persona y tipo; selección es visible en directorio y formularios de asignación/pago.
- Migración aditiva conserva empleados y asignaciones previas con clasificación `employee`.
- Tipos no cambian permisos ni exponen códigos.
- Pruebas cubren catálogo y compatibilidad de migración.
