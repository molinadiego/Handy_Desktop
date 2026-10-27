# Especificación — Gastos del negocio

## Comportamiento
- Registrar gastos generales o vinculados opcionalmente a una orden.
- Cada registro contiene concepto, categoría (fijo, recurrente, variable, viaje, peaje, combustible, repuestos, otro), fecha/hora local, importe positivo, moneda principal del workspace, proveedor opcional, nota opcional y comprobante opcional.
- La fecha se guarda en UTC; importe y moneda quedan como snapshot.
- Los gastos son internos: no se muestran en documentos del cliente y no alteran precio acordado, presupuestos, facturas ni cobros.
- Registros append-only: no se eliminan ni modifican en este alcance para preservar el historial. Correcciones requerirán ajuste auditable.
- Comprobante opcional PDF/JPEG/PNG/WebP, hasta 5 MiB, guardado en SQLite local.

## Offline, permisos y errores
- SQLite local, disponible sin conexión y aislado por workspace.
- Backend valida moneda, orden vinculada del workspace, categoría, fecha UTC, importe y archivo.
- Concepto obligatorio; rechazar importe cero/negativo, fecha inválida, tipos/archivos no admitidos o mayores al límite.

## Aceptación
- Se pueden crear y consultar gastos generales o vinculados a una orden, con categoría, proveedor, nota y comprobante.
- El historial conserva moneda/fecha original y persiste al reiniciar.
- Crear gasto no actualiza campos financieros de la orden.
- Pruebas cubren aislamiento de workspace/orden, importe, fecha UTC, moneda y comprobante.
