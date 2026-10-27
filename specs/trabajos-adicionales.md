# Especificación — Trabajos adicionales y cambios de alcance

## Comportamiento
- En una orden se registran trabajos adicionales por separado con descripción, motivo y importe positivo.
- Al crear quedan `pending_approval`; no se suman al importe acordado ni a facturas.
- El dueño marca explícitamente aprobado o cancelado. Aprobar exige registrar cómo aceptó el cliente (verbal, mensaje/texto, escrito u otro) y nota opcional.
- Una aprobación es inmutable; correcciones requieren nuevo registro/ajuste auditable.
- Si existe una factura borrador, aprobar el adicional actualiza explícitamente ese borrador. Si hay factura emitida, primero debe anularse con motivo y luego aprobar/reemitir; nunca se modifica una factura emitida.
- Facturas futuras incluyen solo adicionales aprobados; el importe acordado original de la orden no se sobrescribe.
- No se envían comunicaciones ni se atribuye aprobación sin acción explícita del dueño.

## Errores, permisos y offline
- Local-first, workspace aislado; solo dueño opera la app en la fase actual.
- No crear adicionales en órdenes canceladas. Validar motivo/description, importe y método de aprobación.
- Si la factura está emitida, rechazo con instrucción de anular y reemitir; conservar ambos historiales.

## Aceptación
- Crear adicional pendiente no cambia orden ni factura automáticamente.
- Aprobar requiere método explícito; solo aprobados se incluyen al crear factura.
- Factura borrador se actualiza al aprobar; factura emitida no se sobrescribe.
- Cancelar conserva registro no facturable.
- Pruebas cubren transiciones, importes, auditoría/aprobación, factura e importe acordado base.
