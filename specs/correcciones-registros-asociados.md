# Especificación — Correcciones de perfiles y registros asociados

Estado: vista previa/propagación atómica a órdenes implementada para clientes y propiedades; facturas y documentos financieros mantienen las reglas de corrección propias.

## Flujo de corrección

- Al editar nombre/contacto de un cliente o administradora, o la dirección/datos de una propiedad, mostrar una vista previa de los registros asociados que podrían verse afectados.
- Permitir al usuario elegir el alcance de la propagación antes de guardar.
- Registrar auditoría con valores anteriores/nuevos, entidad afectada, fecha/hora y usuario cuando exista identidad.
- Los registros históricos no se reescriben ni borran silenciosamente.
- Para órdenes seleccionadas, propagar solo los campos modificados: nombre/teléfono del cliente a contacto de la orden; dirección de la propiedad a la copia de dirección. Los datos del tenant no cambian por corregir al administrador.

## Reglas por tipo de registro

- Registros operativos elegidos por el usuario pueden actualizarse conservando historial de corrección.
- Un presupuesto corregido crea una nueva versión y conserva la anterior.
- Una factura ya emitida nunca se sobrescribe: debe anularse y reemitirse según las reglas financieras.
- Cambiar quién administra o posee una propiedad crea una nueva asignación temporal; no reasigna trabajos pasados.
- La edición de una orden modifica esa orden y presenta impactos antes de propagar datos a snapshots relacionados.

## Criterios de aceptación

- [x] La vista previa enumera las órdenes vinculadas que se afectarían y muestra los valores actuales/nuevos.
- [x] El usuario puede incluir/excluir órdenes individuales antes de confirmar la corrección.
- [x] La auditoría guarda valores originales/nuevos de perfil y de cada orden propagada.
- [x] La corrección del perfil y las órdenes seleccionadas se aplica en una transacción; una referencia inválida revierte todo.
- [x] El usuario probó desde la app Tauri la propagación manual de correcciones a órdenes seleccionadas.
- [ ] Los presupuestos conservan su versión previa y las facturas emitidas pasan por anulación/reemisión.
- [ ] Ninguna corrección cambia silenciosamente el destinatario de documentos históricos.
