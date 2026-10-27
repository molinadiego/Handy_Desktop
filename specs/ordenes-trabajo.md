# Especificación — Órdenes de trabajo

Estado: flujo order-first y ejecución implementados; migración compatible preserva documentos existentes. Tareas operativas por orden y asignaciones parciales implementadas con migración 0035. Falta validación manual en Tauri. Las asignaciones generales de personal se conservan para agenda, pero no conceden por sí solas acceso de usuario.

## Flujo y creación

- El dueño registra la orden recibida por llamada/mensaje como primer registro del trabajo.
- Al capturar una orden, los selectores de cliente/administradora y propiedad permiten buscar registros existentes. Si no hay coincidencia, se pueden preparar altas inline y confirmarlas en la misma transacción de la orden.
- La propiedad nueva debe asociarse a un cliente/administradora existente o creado inline; si falla cualquier inserción, no queda ningún registro parcial.
- No existe entidad de solicitud ni dependencia de ella en el flujo operativo o el modelo de datos.
- El presupuesto puede originarse desde la orden o capturarse independientemente; al cambiar estado si aún no tiene orden, se crea y vincula una.
- Un presupuesto no asociado que cambia de estado crea una orden vinculada con el estado correspondiente; nunca duplicar una orden ya asociada.
- Orden con presupuesto enviado: `pending_approval`. Aceptar el presupuesto actualiza la orden a `accepted`; la programación de la visita es una acción explícita posterior.
- También se puede marcar un borrador `accepted` explícitamente si la aprobación se recibió sin registrar un envío desde la app; en ese caso, no se inicia el cómputo de vencimiento.
- Cancelar el presupuesto por no aprobación cancela también la orden mediante una acción confirmada, conservando ambos registros. No se usa un estado `rejected` separado.
- Si el presupuesto vence tras 15 días corridos desde `sent_at`, marcarlo `expired` y solicitar decisión explícita al dueño: cancelar la orden o preparar/enviar una nueva versión. No cancelar automáticamente.
- Sin presupuesto, la orden puede programarse al acordar la visita; requiere fecha/hora de inicio y fin. La ventana de 4 horas es habitual y editable, no un valor forzado.
- La orden puede editarse y cancelarse con confirmación visible y motivo obligatorio; estados terminales conservan historial.
- Se puede marcar `completed` directamente desde `pending`, `accepted` o `scheduled`, sin pasar por `in_progress`; se registra `completed_at` y no se inventa `started_at`.
- Una orden directa sin presupuesto requiere ingresar y confirmar explícitamente un importe mayor que cero antes de finalizar; no se considera el cero del formulario como precio.
- Al finalizar una orden se puede guardar una lista opcional de trabajo realmente realizado, separada del alcance solicitado; se puede editar al volver a abrir la orden realizada.
- Si la orden tiene un presupuesto asociado, no se puede programar ni finalizar hasta que la versión vigente esté `accepted`, aunque la orden aún figure `pending` o `scheduled`. `pending_approval` no se puede finalizar.
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
- [x] Finalizar directamente una orden sin presupuesto o con presupuesto aprobado; bloquearlo si el presupuesto asociado no está aprobado.
- [x] Exigir importe positivo y confirmación explícita al finalizar una orden directa que aún no tenía importe acordado.
- [x] Capturar opcionalmente trabajo realizado al finalizar, sin sobrescribir la lista de trabajo solicitada.
- [x] Permitir corregir la lista de trabajo realizado al editar una orden realizada.
- [ ] Una orden de administradora queda facturable a la administradora y mantiene datos del tenant solo para acceso.
- [x] La orden conserva snapshots de destinatario/dirección y no reescribe registros históricos.
- [ ] Probar manualmente las dos rutas de creación, programación, inicio, finalización y cancelación en Tauri.

## Asignaciones parciales a empleados (implementadas; falta validar en Tauri)

- El admin crea tareas operativas separadas dentro de una orden y asigna cada tarea a uno o más empleados. No se presupone que cada línea del alcance comercial sea automáticamente una tarea operativa.
- Una cuenta de empleado vinculada a un registro de personal solo ve órdenes con tareas asignadas a esa persona y solo consulta sus tareas/asignaciones.
- Completar una tarea cambia únicamente la asignación del empleado actual a `completed` y registra `completed_at` UTC. Cancelarla cambia únicamente su asignación a `cancelled`, exige motivo y registra `cancelled_at` UTC. Si la tarea es compartida, las asignaciones de otros empleados no cambian.
- El estado global de tarea/orden no se modifica por la acción del empleado. El admin decide reasignar, cerrar la orden o continuar el trabajo.
- Los cambios de asignación del admin conservan el historial de asignaciones anteriores; no eliminan registros de avance/cancelación.
- Las órdenes terminales conservan sus transiciones globales y validaciones actuales; solo el admin puede realizarlas.

### Criterios de aceptación para tareas asignadas

- [x] Admin crea/edita tareas operativas y asigna cada una a uno o más empleados.
- [x] Usuario ve órdenes con tareas asignadas y solo consulta sus tareas/asignaciones.
- [x] Completar/cancelar cambia únicamente la asignación propia; la tarea compartida, otras asignaciones y la orden global quedan intactas.
- [x] Cancelar exige motivo y ambas acciones registran timestamp UTC en la asignación.
- [x] Backend valida sesión y asignación activa; no permite cambiar el estado global de la orden por comandos de usuario.
- [x] Admin puede ver avances, motivos y fechas, y reasignar conservando historial.
- [ ] Validar manualmente en Tauri asignación compartida, cierre parcial, cancelación y revisión del admin.

## Pendientes

- Definir si se permite reabrir una orden cancelada (por defecto, crear otra orden enlazada; no reabrir historial terminal).
- Definir prioridad, duración/horas, equipos/asignaciones y acciones para trabajos adicionales.
