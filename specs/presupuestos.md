# Especificación — Presupuestos

Estado: presupuesto versionado desde orden implementado; la migración compatible preserva versiones existentes. Transiciones y vínculo probados automáticamente; falta validación manual en Tauri.

## Flujo

- Un presupuesto se crea desde una orden mediante acción explícita y se vincula a esa orden.
- Si un presupuesto existente no tiene orden vinculada, al cambiarlo explícitamente a `sent`, `accepted` o `cancelled`, se crea una orden con estado correspondiente (`pending_approval`, `accepted` o `cancelled`) y se vincula al presupuesto; no se crea una segunda orden si ya existe una asociación.
- Al aprobar un presupuesto sin orden, abrir la orden creada para completar la fecha/hora de inicio y fin de la visita; guardar ambas fechas programa la orden.
- Editar un presupuesto crea una nueva versión; la versión anterior permanece consultable e inalterada.
- Cambiar el estado requiere una acción explícita. Si ya existe orden, aceptar la actualiza y no crea otra; si no existe, el cambio de estado crea la primera orden vinculada.
- Al marcar como enviado, guardar `sent_at`; la validez termina 15 días corridos después. Al vencer pasa a `expired` y requiere decisión del dueño sobre cancelar la orden o preparar/enviar nueva versión.
- No aprobación se registra cancelando el presupuesto y la orden, con confirmación y conservando sus historiales; no usar un status `rejected` independiente.

## Campos de la primera versión

- Para presupuestos nuevos, orden asociada obligatoria; cliente/administradora y propiedad se guardan como vínculos/snapshots de la orden. Los presupuestos históricos sin orden se vinculan al materializar la orden por cambio de estado.
- Snapshot del destinatario (cliente/administradora) y dirección al momento de crear esa versión.
- Descripción del alcance, modalidad (precio fijo o tiempo y materiales), importe global y descuento manual.
- Descuento manual como importe o porcentaje; total calculado sin permitir resultado negativo.
- Moneda principal configurable por el dueño en Configuración. Si no está configurada, enlazar a Configuración antes de guardar; no asumir USD.
- El dueño puede cambiar la moneda principal cuando quiera; presupuestos/versiones existentes conservan su moneda original y no se convierten automáticamente.
- Estado por versión: `draft`, `sent`, `accepted`, `expired`, `cancelled`.
- Número de versión y fechas de creación/envío/aceptación/vencimiento.

## Reglas de precio y versión

- No incluir cálculo fiscal automático en MVP.
- Un descuento modifica únicamente la versión en edición; las anteriores conservan su importe/descuento.
- Guardar una revisión genera número de versión siguiente y la deja en borrador, sin borrar el estado ni los datos de la versión anterior.
- Los importes se almacenan con precisión según las fracciones de la moneda seleccionada.

## PDF e impresión

- Vista imprimible/PDF bilingüe con negocio, destinatario, dirección de trabajo, descripción, modalidad, importe, descuento, total, moneda, estado y versión.
- Imprimir o guardar a PDF mediante el diálogo de impresión del sistema.

## Criterios de aceptación

- [x] Crear presupuesto desde una orden, sin entidad intermedia.
- [x] El primer presupuesto es versión 1; editar conserva anterior y crea una revisión siguiente.
- [x] Aceptar presupuesto actualiza la orden existente o crea una primera orden si el presupuesto no tenía asociación.
- [x] Importe, descuento por importe/porcentaje y total se calculan/validan en la moneda del workspace.
- [x] Si no hay moneda del workspace, no se puede guardar el presupuesto hasta elegirla.
- [x] El PDF muestra snapshots de destinatario/dirección y datos completos de la versión seleccionada.
- [x] Estados y versiones anteriores se pueden consultar.
- [x] Calcular vencimiento a 15 días corridos desde el envío y solicitar decisión del dueño al vencer.
- [x] Cancelar presupuesto y orden con confirmación cuando el cliente no aprueba, conservando ambos registros.
- [ ] Probar manualmente selección de moneda, presupuestos, revisiones, estados e impresión en Tauri.

## Transiciones de la primera implementación

- `draft` → `sent`, `accepted` o `cancelled`; aceptación directa permite registrar aprobación recibida por teléfono/en persona.
- `sent` → `accepted`, `expired` o `cancelled`.
- Para revisar un presupuesto ya enviado, crear nueva versión en estado `draft`; no reescribir el PDF/versión enviada.
- Aceptación/cancelación recibida por teléfono o mensaje se registra explícitamente por el dueño.
