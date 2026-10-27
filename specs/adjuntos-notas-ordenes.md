# Especificación breve — Fotos y notas de órdenes

## Alcance y comportamiento
- En una orden se pueden adjuntar fotos existentes (JPEG, PNG, WebP) y registrar notas de texto.
- Los datos quedan en SQLite local, aislados por `workspace_id` y orden; disponibles sin conexión.
- Cada foto conserva nombre, tipo, tamaño y fecha de captura/importación; se muestra como vista previa.
- Cada nota conserva autor local genérico (no hay roles implementados) y fecha UTC. Las notas no se editan ni eliminan en este alcance.
- El selector de archivo limita cada foto a 5 MiB; no se incorpora captura desde cámara ni procesamiento externo.
- El contenido se guarda como data URL en SQLite por simplicidad y para mantener consistencia transaccional local. No se exporta ni se comparte con presupuestos/PDF.

## Permisos, errores y seguridad
- La aplicación actualmente tiene un workspace local fijo y no tiene autenticación; no se presenta este control como autorización por rol.
- Rechazar extensiones/MIME no admitidos y archivos vacíos o mayores a 5 MiB; mostrar errores claros y conservar la orden.
- Las notas/fotos no deben incluirse en documentos de cliente automáticamente. Los códigos de acceso no se replican en notas.

## Criterios de aceptación
- Desde editar una orden se puede guardar una nota y adjuntar JPEG/PNG/WebP hasta 5 MiB.
- Se ven notas y miniaturas al reabrir la orden y después de reiniciar la app.
- La información no requiere red; no se cargan contenidos completos en listados de órdenes.
- La migración es aditiva y conserva datos existentes.
- Validar build, pruebas de migración y validación de MIME/tamaño.
