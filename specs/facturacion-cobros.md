# Especificación — Facturas y cobros

## Facturas
- Crear un borrador desde una orden realizada con importe positivo confirmado y presupuesto aprobado si existe.
- El subtotal parte del importe acordado y suma solo trabajos adicionales aprobados explícitamente. No suma horas, materiales ni pagos al personal automáticamente. Un porcentaje de impuesto configurable por workspace se aplica automáticamente a borradores nuevos; el porcentaje e importe quedan en snapshot. Cambiar la tasa no altera borradores existentes ni facturas emitidas y no hay cálculo fiscal por jurisdicción.
- Destinatario, contacto, dirección, descripción, moneda y subtotal quedan como snapshot. La impresión/PDF distingue borrador, emitida y anulada; referencia interna no pretende ser numeración fiscal oficial.
- Emitir es acción explícita; una orden admite como máximo una factura borrador/emitida a la vez. Tras anular se conserva historial y se puede crear otra factura para la orden.
- Anular exige motivo. Asignaciones de pagos externos a esa factura se revierten con motivo derivado de la anulación y quedan auditables como liberadas; no se supone ni registra reembolso. El dinero permanece en el historial de pagos sin aplicar hasta que se distribuya de nuevo.
- El estado de ciclo (`draft`/`issued`/`voided`) se presenta separado del estado de cobro. Una factura emitida se muestra como no pagada, parcialmente pagada o pagada según sus asignaciones activas y saldo; el estado no se cambia a `paid` ni se procesa dinero.

## Cobros
- Registrar pagos externos, nunca procesar tarjeta/transferencia desde la app.
- Cada pago guarda importe positivo, fecha UTC, moneda snapshot y nota opcional.
- Aplicación manual a una o varias facturas emitidas de la misma moneda. Admite pagos parciales y saldo no aplicado; no permitir asignar por encima del pago ni del saldo de factura.
- Pagos y aplicaciones son historial auditable; las aplicaciones solo se revierten al anular una factura, conservando importe y motivo. Reaplicar requiere acción explícita.
- Pago de una moneda distinta a la factura no se convierte; solo puede asignarse a facturas en la misma moneda.
- El listado permite buscar por destinatario/referencia/dirección y filtrar por tipo de cliente; las vistas de pendientes no incluyen facturas totalmente pagadas.
- Cada factura emitida con saldo ofrece un acceso directo a registrar un cobro externo y preasigna la factura; se conserva la distribución manual multipago.

## Offline, permisos y errores
- Local-first y aislamiento por workspace; sin proveedor externo.
- No borrar facturas/pagos. Cambiar precios base no altera factura histórica.
- Validar orden elegible, importe, moneda, impuesto no negativo, estado, motivo de anulación y saldo en transacción.

## Criterios de aceptación
- Borrador/emisión/PDF/void auditables y facturas previas intactas.
- Importes acordado/subtotal, impuesto calculado desde la tasa configurada, facturado, cobrado y saldo se muestran separadamente.
- El porcentaje y el importe de impuesto se muestran en factura y PDF; se guardan en el snapshot.
- Cobros parciales se pueden distribuir manualmente a varias facturas de la misma moneda.
- Anular conserva factura y aplicaciones con motivo; orden vuelve a disponible para facturar y pago queda no aplicado.
- La interfaz muestra el estado de ciclo y el estado de cobro de forma diferenciada.
- [x] La tasa global de impuesto se aplica a nuevos borradores y se muestra junto al importe en tarjeta y PDF; los documentos existentes conservan sus snapshots.
- [x] Listado filtrable y cobro externo iniciado desde la factura sin eliminar el registro general de aplicaciones manuales.
- Pruebas cubren transiciones, pagos parciales, sobrepago, multi-factura, moneda, void/reallocation y no mutación del acuerdo original.
