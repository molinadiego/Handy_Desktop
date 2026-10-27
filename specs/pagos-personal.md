# Especificación — Pagos externos al personal

## Comportamiento
- Registrar pagos que el negocio ya realizó fuera de HandySystem a un empleado del directorio.
- Guardar empleado, fecha/hora local (UTC), importe positivo en moneda snapshot del workspace, nota opcional y orden opcional.
- Opcionalmente aplicar el pago a un registro de costo `por trabajo` del mismo empleado. Aceptar pagos parciales y no permitir exceder el saldo pendiente de ese costo.
- En un pago aplicado a costo por trabajo, usar la moneda snapshot del costo; para pagos generales/orden, usar moneda actual del workspace.
- Historial append-only: no borrar ni editar pagos. No procesar transferencias, tarjetas, nómina ni calcular impuestos.
- Mostrar los pagos internos solo en la pantalla de pagos del personal; no incluirlos en documentos del cliente.

## Offline, permisos y errores
- SQLite local y workspace aislado; sin red ni integración bancaria.
- Validar empleado/orden/costo en el mismo workspace, costo de empleado, fecha UTC, importe > 0 y moneda coincidente.
- Rechazar aplicaciones que excedan saldo; registrar pagos generales sin costo vinculado es válido.

## Criterios de aceptación
- Registrar un pago externo general, por orden o aplicado a un costo por trabajo.
- Permitir varios pagos parciales y mostrar saldo restante del costo enlazado.
- Preservar moneda/fecha, historial y nota al reiniciar.
- Pagos no cambian orden, costo original, precio cobrado al cliente ni factura.
- Pruebas cubren aislamiento, montos positivos, monedas y aplicación parcial/sobrepago.
