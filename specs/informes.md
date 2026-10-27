# Especificación — Informes básicos

## Alcance y comportamiento
- Sección Informes con categorías: órdenes, presupuestos, facturas/cobros, gastos y pagos al personal.
- Filtros por rango desde/hasta inclusivo, estados en órdenes/presupuestos/facturas, categoría en gastos y tipo de cliente cuando el registro tenga orden/cliente asociado. “Todos” incluye generales sin orden.
- Fecha aplicada: órdenes programadas/en curso → fecha programada; realizadas → fecha de finalización; canceladas → fecha de cancelación; estados sin hito → creación. Presupuestos permiten elegir creación o envío (sin fecha de envío no entran al filtro por envío). Facturas → creación; gastos/pagos → su fecha de operación.
- Importes respetan moneda snapshot. Totales se agrupan por moneda, sin conversión cambiaria.
- Vista imprimible conserva filtros y resumen; no se genera PDF automáticamente fuera del diálogo de impresión.

## Offline y errores
- Datos derivados de SQLite local; no agrega proveedores ni requiere red.
- Rango inválido (desde posterior a hasta) se rechaza/limpia con aviso.
- La selección de tipo de cliente excluye gastos/pagos generales sin orden; “Todos” los incluye.
- Los informes no modifican registros financieros.

## Aceptación
- Filtros inclusivos usan fecha local del workspace para cada hito definido.
- Estados completos y categorías se pueden seleccionar individualmente o todos.
- Totales por moneda no mezclan monedas.
- Impresión refleja tipo, fechas, cliente, estados/categorías y totales seleccionados.
- Pruebas cubren límites de fechas, estado/hito, zona horaria y total por moneda.
