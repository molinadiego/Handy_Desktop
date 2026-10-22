# Fase 1 — Clientes, propiedades y solicitudes

Estado: primera implementación frontend y esquema local SQLite realizados. Falta validación nativa Tauri (Rust no está instalado), además de varios flujos de edición y adjuntos.

## Alcance

- Clientes directos y administradoras con nombre de contacto, teléfono obligatorio, compañía y email opcionales.
- Propiedades con dirección y asociación actual a un cliente o administradora.
- Historial temporal de asociación propiedad-cliente para no reasignar trabajos históricos.
- Captura rápida de solicitudes: nombre y teléfono de contacto, dirección y descripción obligatorios; fecha preferida y datos del tenant opcionales.
- Tipo de contacto directo/administradora. Una solicitud puede vincular opcionalmente un cliente y una propiedad existentes, manteniendo una copia de los datos de contacto/dirección capturados.
- Guardado local en SQLite y aislamiento de registros por `workspace_id`.
- Interfaz bilingüe inglés/español y responsive.

## Criterios de aceptación

- [x] Migración inicial crea workspaces, clientes, propiedades, historial de asociación y solicitudes.
- [x] Todos los registros de negocio tienen `workspace_id`.
- [x] La UI permite crear/listar clientes directos y administradoras.
- [x] La UI permite crear/listar propiedades asociadas a un cliente; se registra la asignación inicial en el historial.
- [x] La captura rápida permite guardar solicitudes con los campos requeridos sin fecha preferida ni datos del tenant.
- [x] Se puede vincular opcionalmente cliente/propiedad existentes y la dirección se copia a la solicitud.
- [x] La validación de campos obligatorios tiene pruebas unitarias.
- [ ] Ejecutar y validar migración/lecturas/escrituras en un runtime Tauri real.
- [ ] Editar clientes y propiedades, incluida reasignación que cierre relación vigente y agregue una nueva sin modificar el historial anterior.
- [ ] Agregar/ver fotos y notas en una solicitud.
- [ ] Definir y probar asociación/edición posterior de tenant y contacto de acceso.
- [ ] Definir estados y acciones de seguimiento para solicitudes, sin conversión automática a presupuesto.
- [ ] Completar prueba manual de responsive en escritorio, tablet y celular.

## Consideraciones técnicas

- DB: `HandySystem/src-tauri/migrations/0001_initial.sql`.
- Registro del plugin SQL y migración de Tauri en `HandySystem/src-tauri/src/lib.rs`.
- Acceso a datos encapsulado en `HandySystem/src/lib/database.ts`.
- El plugin SQL requiere Rust. Hasta instalar Rust/Cargo, `npm run build` y las pruebas frontend son verificables, pero `npm run tauri dev` no puede ejecutarse.
- La asociación de propiedad/cliente se conserva como historial; en esta primera iteración solo se crea la asignación inicial, todavía no hay UI de reasignación.
