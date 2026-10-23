# Especificación — Estados y fechas de reportes

Estado: catálogos confirmados por el usuario; transiciones detalladas se implementan en la especificación de cada módulo.

## Órdenes de trabajo

Estados acordados:

- `pending` — aceptada/creada y aún no programada.
- `scheduled` — tiene visita/trabajo programado.
- `in_progress` — trabajo iniciado.
- `completed` — trabajo realizado.
- `cancelled` — trabajo cancelado.

Fechas para reportes:

- Pendiente, programada y en curso: usar fecha programada.
- Realizada: usar fecha de finalización.
- Cancelada: usar fecha de cancelación.
- Rangos interpretados en la zona horaria del workspace, límites desde/hasta inclusivos; almacenamiento UTC.
- Definir en el módulo qué hacer si falta la fecha correspondiente en un registro.

## Presupuestos

Estados acordados:

- `draft` — borrador.
- `sent` — enviado.
- `accepted` — aceptado.
- `rejected` — rechazado.
- `expired` — vencido.
- `cancelled` — cancelado.

Para reportes, el dueño puede elegir como fecha base creación o envío; si elige envío y el presupuesto aún no se envió, no entra en un rango acotado por fecha de envío.

## Facturas

Separar el ciclo de vida del estado de pago para evitar solapamientos:

- Ciclo: `draft` (borrador), `issued` (emitida), `voided` (anulada).
- Pago: `unpaid` (no pagada), `partially_paid` (parcial), `paid` (pagada), calculado a partir del importe y las aplicaciones de pago.
- El reporte usa la fecha de creación de la factura y permite filtrar por cualquier estado de ciclo, estado de pago o combinación.
- Anular conserva el historial y aplica la regla de regresar la orden a “Pendiente de Facturar”.

## Reportes

- Cada reporte puede filtrar por todos los estados, uno o varios estados, un cliente/administradora específico y un rango desde/hasta.
- La lista de opciones debe corresponder a los catálogos de estado de la entidad; no mantener listas divergentes en la UI de reportes.
- Generar salida imprimible/PDF y enviar el PDF por email desde la app con el proveedor configurado por el dueño.
- Los cambios de estado no convierten automáticamente presupuestos, órdenes o facturas; las transiciones siguen requiriendo confirmación explícita.

## Transiciones por definir en las especificaciones de módulo

- Qué transiciones son válidas y quién puede ejecutarlas, incluyendo cancelaciones y reaperturas.
- Momento exacto de registro de fechas `scheduled_at`, `completed_at`, `cancelled_at` y `sent_at`.
- Si se permiten varias fechas programadas/reprogramaciones, conservar historial de cambios.
- Tratamiento de facturas anuladas con pagos aplicados y de presupuestos aceptados que no se convierten en trabajo.
