# Fase 1 — Clientes, propiedades y solicitudes

Estado: primera implementación frontend y esquema local SQLite realizados; `cargo check` y build release Tauri pasaron. Falta ejecutar la app y validar el plugin SQLite en runtime, además de varios flujos de edición y adjuntos.

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
- [x] Compilar el backend nativo con `cargo check`.
- [x] Generar binario Tauri release con `--no-bundle`.
- [x] Ejecutar la app Tauri y confirmar que SQLite crea el archivo y aplica las migraciones.
- [ ] Validar altas/listados desde UI y persistencia al reiniciar.
- [ ] Editar clientes y propiedades, incluida reasignación que cierre relación vigente y agregue una nueva sin modificar el historial anterior.
- [ ] Agregar/ver fotos y notas en una solicitud.
- [ ] Definir y probar asociación/edición posterior de tenant y contacto de acceso.
- [ ] Definir estados y acciones de seguimiento para solicitudes, sin conversión automática a presupuesto.
- [ ] Completar prueba manual de responsive en escritorio, tablet y celular.

## Consideraciones técnicas

- DB: `HandySystem/src-tauri/migrations/0001_initial.sql`.
- Registro del plugin SQL y migración de Tauri en `HandySystem/src-tauri/src/lib.rs`.
- Acceso a datos encapsulado en `HandySystem/src/lib/database.ts`.
- Rust stable 1.99.1 está instalado. La app se abrió y creó `handyman.db` con las tablas/migraciones esperadas. Falta comprobar alta/listado desde la UI y persistencia tras reiniciar.
- La asociación de propiedad/cliente se conserva como historial; en esta primera iteración solo se crea la asignación inicial, todavía no hay UI de reasignación.
