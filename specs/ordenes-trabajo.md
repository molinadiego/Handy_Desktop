# Especificación — Órdenes de trabajo

Estado: flujo order-first implementado en backend/UI y probado automáticamente; migración compatible ejecutada en la base local y preservó el presupuesto existente. Falta validación manual en Tauri. Asignación de empleados, materiales y adjuntos queda pendiente.

## Flujo y creación

- El dueño registra la orden recibida por llamada/mensaje como primer registro del trabajo.
- Al capturar una orden, los selectores de cliente/administradora y propiedad permiten buscar registros existentes. Si no hay coincidencia, se pueden preparar altas inline y confirmarlas en la misma transacción de la orden.
- La propiedad nueva debe asociarse a un cliente/administradora existente o creado inline; si falla cualquier inserción, no queda ningún registro parcial.
- No existe entidad de solicitud ni dependencia de ella en el flujo operativo o el modelo de datos.
- Si se requiere precio previo, crear presupuesto desde la orden y mantenerlo vinculado a ella.
- Un presupuesto no asociado que cambia de estado crea una orden vinculada con el estado correspondiente; nunca duplicar una orden ya asociada.
- Orden con presupuesto enviado: `pending_approval`. Aceptar el presupuesto actualiza la orden a `accepted`; la programación de la visita es una acción explícita posterior.
- También se puede marcar un borrador `accepted` explícitamente si la aprobación se recibió sin registrar un envío desde la app; en ese caso, no se inicia el cómputo de vencimiento.
- Cancelar el presupuesto por no aprobación cancela también la orden mediante una acción confirmada, conservando ambos registros. No se usa un estado `rejected` separado.
- Si el presupuesto vence tras 15 días corridos desde `sent_at`, marcarlo `expired` y solicitar decisión explícita al dueño: cancelar la orden o preparar/enviar una nueva versión. No cancelar automáticamente.
- Sin presupuesto, la orden puede programarse al acordar la visita; requiere fecha/hora de inicio y fin. La ventana de 4 horas es habitual y editable, no un valor forzado.
- La orden puede editarse y cancelarse; estados terminales conservan historial y cancelación registra fecha/motivo.
- El presupuesto aceptado no crea otra orden: ya está vinculado a la orden original y solo habilita que se acepte/programe explícitamente.
- Para administradoras, la administradora sigue siendo el cliente facturable y el tenant se conserva solo para acceso/coordinación.

## Estados acordados

- `pending` — creada, aún sin fecha de trabajo confirmada.
- `pending_approval` — presupuesto vinculado enviado y esperando respuesta.
- `accepted` — presupuesto aprobado; la visita todavía puede no estar programada.
- `scheduled` — trabajo programado.
- `in_progress` — trabajo iniciado.
- `completed` — trabajo realizado.
- `cancelled` — trabajo cancelado.

Cambios de estado son acciones explícitas. Programar exige fecha; completar y cancelar registran su fecha. Los estados terminales conservan su historial.

## Datos de primera implementación

- Presupuesto/versión opcional y relacionada.
- Cliente/administradora y propiedad; snapshots de destinatario, contacto, tenant y dirección.
- Descripción/alcance, modalidad (precio fijo o tiempo y materiales), importe estimado/acordado y moneda.
- Fecha/hora programada de inicio y fin, fecha real de inicio, finalización y cancelación.
- Prioridad, instrucciones de acceso y campos opcionales `lockbox_code`/`gate_code`.
- Los códigos de acceso solo se muestran a roles autorizados; no se incluyen en PDF/documentos de cliente. No se duplican innecesariamente en el snapshot imprimible del presupuesto.
- Asignación a empleados/materiales queda en los submódulos de ejecución posteriores; no bloquear la creación inicial.

## Criterios de aceptación

- [x] Crear orden directamente desde llamada/mensaje sin entidad previa.
- [x] Buscar y vincular cliente/administradora y propiedad existentes desde el formulario de orden.
- [x] Crear cliente/administradora y propiedad inline al guardar la orden, de forma transaccional y sin registros parciales.
- [x] Crear presupuesto vinculado a orden; aceptación cambia la orden a `accepted` y nunca crea una segunda orden.
- [x] Cancelar explícitamente presupuesto no aprobado y orden asociada conservando ambos historiales.
- [x] Vencimiento a 15 días corridos desde envío; pedir decisión del dueño, sin cancelación automática.
- [x] Programar órdenes con inicio y fin; permitir editar y confirmar cancelación.
- [ ] Una orden de administradora queda facturable a la administradora y mantiene datos del tenant solo para acceso.
- [x] La orden conserva snapshots de destinatario/dirección y no reescribe registros históricos.
- [ ] Probar manualmente las dos rutas de creación, programación, inicio, finalización y cancelación en Tauri.

## Pendientes

- Definir si se permite reabrir una orden cancelada (por defecto, crear otra orden enlazada; no reabrir historial terminal).
- Definir prioridad, duración/horas, equipos/asignaciones y acciones para trabajos adicionales.
