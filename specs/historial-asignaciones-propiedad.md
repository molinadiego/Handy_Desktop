# Especificación — Historial de asignaciones de propiedades

## Comportamiento
- En la edición de una propiedad, mostrar el historial de asignación asociado a la propiedad, ordenado del período más reciente al más antiguo.
- Mostrar cliente/administradora, tipo de relación, fecha de inicio y fecha de fin; identificar explícitamente la asignación vigente.
- Las fechas se muestran en la zona horaria del workspace. La consulta respeta `workspace_id` y no modifica datos.
- El historial se conserva al reasignar; no se permite editar ni borrar períodos desde esta vista.

## Criterios de aceptación
- [x] Al abrir una propiedad existente, se ven los períodos históricos y el vigente, si existe.
- [x] Una propiedad sin períodos muestra un estado vacío; errores de lectura muestran un mensaje útil.
- [x] La vista es bilingüe (español/inglés) y usa la zona horaria configurada.
- [x] La consulta solo lee asignaciones del workspace actual.
- [x] Validar manualmente en Tauri una propiedad con más de una asignación.
