# Especificación — Tiempo y costo de personal

## Alcance y comportamiento
- Desde el editor de una orden existente, el dueño agrega entradas manuales de tiempo por empleado.
- Cada entrada permite elegir `por hora` o `por trabajo`; incluye empleado y nota opcional del turno/trabajo.
- `Por hora`: requiere inicio/fin localizados con la zona horaria del workspace; se almacenan en UTC y la duración se calcula en minutos enteros (máximo 24 horas por entrada).
- `Por trabajo`: requiere fecha e importe que el empleado cobró al negocio; no requiere ni calcula horas. Se almacena timestamp UTC, importe en unidades menores y snapshot de moneda del workspace.
- El importe `por trabajo` es costo interno del negocio: no se muestra al cliente ni se incluye en presupuesto/factura/PDF del cliente.
- Se puede registrar tiempo de cualquier empleado del directorio aunque no hubiera quedado asignado previamente; no se alteran asignaciones ni estados de la orden.
- Las entradas son append-only: no se editan ni eliminan en este alcance. Se muestra historial y total de horas por orden; los importes por trabajo se muestran por entrada y no se suman entre monedas distintas.
- Evitar traslapes de entradas `por hora` del mismo empleado, incluso si corresponden a órdenes diferentes. Los registros `por trabajo` no ocupan un intervalo horario.
- Registrar horas no cambia automáticamente el precio acordado/fijo, el presupuesto ni el estado. No implementa nómina, pagos, tarifas ni cobro automático de tiempo/materiales.

## Offline, permisos y errores
- SQLite local, aislado por workspace y orden; disponible sin conexión.
- No hay cuentas/permisos por empleado: el registro lo realiza el usuario local actual.
- Rechazar empleado/orden fuera del workspace, fechas inválidas, fin no posterior al inicio, entrada mayor a 24 horas, importe no positivo o traslape horario del empleado.
- Notas opcionales con máximo de 500 caracteres.

## Criterios de aceptación
- Desde una orden existente se puede elegir modo por hora/por trabajo y guardar los datos correspondientes; nota opcional se conserva en ambos modos.
- Al reabrir la orden, las entradas y el total persisten y se muestran en la zona horaria configurada.
- No es posible guardar tiempos por hora traslapados para un empleado; el rechazo conserva todos los datos existentes.
- Costo por trabajo queda separado del importe del cliente, conserva moneda histórica y nunca se muestra en documentos del cliente.
- Entradas nuevas no modifican `agreed_amount_minor`, `price_confirmed`, estado ni timestamps del ciclo de la orden.
- Pruebas cubren duración, orden temporal, límite de 24 horas, solapamiento y aislamiento del workspace.
