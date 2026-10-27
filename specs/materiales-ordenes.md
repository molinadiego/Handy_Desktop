# Especificación — Materiales por orden

## Comportamiento
- En una orden existente se agregan registros de materiales utilizados.
- Cada registro guarda únicamente material, cantidad utilizada decimal, costo total y precio unitario del material en moneda principal del workspace.
- Precio al cliente es referencia informativa; no aumenta automáticamente importe acordado, factura ni cobro. Trabajos adicionales siguen requiriendo motivo y aprobación explícita mediante su flujo correspondiente.
- Los registros son append-only en este alcance: no se editan ni eliminan. No se captura uso previsto/utilizado, unidad, sobrantes, comprobantes ni notas.
- El costo unitario y precio unitario quedan con snapshot de la moneda al registrar.

## Seguridad, permisos y offline
- Workspace/order aislados y validados en backend; opera sin conexión.
- No se publican costos ni comprobantes en vistas/PDF destinados al cliente.
- Rechazar cantidades no finitas/no positivas, unidades vacías o largas, sobrante inválido, importes negativos, moneda no configurada, archivo no admitido/mayor a 5 MiB y registros fuera del workspace.

## Criterios de aceptación
- Agregar materiales utilizados con los cuatro campos acordados y ver historial al reabrir.
- El costo/precio guardan moneda histórica; ningún registro modifica automáticamente precio fijo/importes de orden.
- Pruebas cubren validación de cantidades, sobrante, permisos/workspace, archivo y conservación de importe de la orden.
