# Fase 1 — Clientes y propiedades

Estado: clientes y propiedades se crean/editan localmente; las órdenes ahora son el registro inicial de trabajos. La antigua tabla/módulo de solicitudes fue eliminada en la migración v8.

## Alcance

- Clientes directos y administradoras con nombre, teléfono obligatorio, compañía y email opcionales.
- Permitir corregir perfiles sin cambiar su tipo; cambiar entre cliente directo y administradora requiere flujo de reasignación con historial.
- Propiedades con dirección y asociación vigente a un cliente o administradora.
- Guardar historial temporal de asignación de propiedad para no reasignar trabajos históricos.
- Corregir perfiles con vista previa, selección de órdenes vinculadas y auditoría de valores anteriores/nuevos.
- Las órdenes guardan snapshots; ninguna corrección reescribe registros históricos silenciosamente.
- Guardado local SQLite, aislamiento por `workspace_id`, interfaz bilingüe y responsive.

## Criterios de aceptación

- [x] La UI permite crear/listar clientes directos y administradoras.
- [x] La UI permite crear/listar propiedades y registra asignación inicial en historial.
- [x] Editar cliente/administradora y propiedad persiste cambios sin alterar silenciosamente órdenes históricas.
- [x] La vista previa permite seleccionar órdenes asociadas para corrección auditada.
- [x] Los perfiles y órdenes seleccionados se actualizan transaccionalmente.
- [ ] Confirmar manualmente que corregir un perfil no afecta snapshots no seleccionados ni facturas.
- [ ] Añadir reasignación de propiedad que cierre relación vigente y preserve historial anterior.
- [ ] Probar operación offline en Tauri y responsive en escritorio/tablet/móvil.

## Datos históricos y migración

- Migración v8 elimina la tabla obsoleta de solicitudes y las referencias desde órdenes/presupuestos, sin borrar órdenes, presupuestos, versiones, clientes ni propiedades.
- Los registros de corrección específicos de solicitudes de prueba también se retiran; la auditoría de perfil y de órdenes se conserva.
- La base local debe mantener cero tablas/índices/relaciones asociados a solicitudes después de aplicar la migración.
