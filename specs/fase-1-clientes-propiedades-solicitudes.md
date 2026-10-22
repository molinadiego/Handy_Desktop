# Fase 1 — Clientes, propiedades y solicitudes

Estado: frontend, comando transaccional SQLite y esquema realizados; build nativo y pruebas de rollback/commit pasan. El usuario confirmó la prueba manual del selector de propiedad, la captura inline de administradora/propiedad y cancelación sin registros parciales. Siguen pendientes edición y adjuntos.

## Alcance

- Clientes directos y administradoras con nombre de contacto, teléfono obligatorio, compañía y email opcionales.
- Permitir editar clientes y administradoras para corregir errores de tipeo en su perfil y datos de contacto.
- Propiedades con dirección y asociación actual a un cliente o administradora.
- Permitir editar la dirección y otros datos actuales de una propiedad.
- Historial temporal de asociación propiedad-cliente para no reasignar trabajos históricos.
- Las correcciones de perfiles afectan los datos actuales; no deben reescribir silenciosamente la información histórica guardada en trabajos o facturas.
- Captura rápida de solicitudes: nombre y teléfono de contacto, dirección y descripción obligatorios; fecha preferida y datos del tenant opcionales.
- Tipo de contacto directo/administradora. Una solicitud puede vincular opcionalmente un cliente y una propiedad existentes, manteniendo una copia de los datos de contacto/dirección capturados.
- Los selectores de cliente/administradora y propiedad permiten escribir para filtrar registros existentes, sin depender de un menú largo no searchable.
- Si no existe el cliente, puede darse de alta desde la solicitud; si no existe la propiedad, puede crearse allí asociada al cliente/administradora seleccionada.
- Las altas rápidas quedan en estado temporal dentro del formulario y solo se persisten junto con la solicitud al confirmar Guardar; cancelar descarta el borrador.
- En una solicitud de administradora, se crea/vincula la administradora como cliente facturable; tenant y contacto de acceso solo se guardan en la solicitud.
- Crear la solicitud, el cliente nuevo, la propiedad nueva y su historial de asociación debe ser atómico; ante un error no deben quedar registros parciales.
- Guardado local en SQLite y aislamiento de registros por `workspace_id`.
- Interfaz bilingüe inglés/español y responsive.

## Criterios de aceptación

- [x] Migración inicial crea workspaces, clientes, propiedades, historial de asociación y solicitudes.
- [x] Todos los registros de negocio tienen `workspace_id`.
- [x] La UI permite crear/listar clientes directos y administradoras.
- [x] La UI permite crear/listar propiedades asociadas a un cliente; se registra la asignación inicial en el historial.
- [ ] Editar cliente directo o administradora y persistir los cambios.
- [ ] Editar dirección/datos de una propiedad y persistir los cambios.
- [ ] Confirmar que corregir un perfil no altera snapshots históricos de trabajos o facturas.
- [x] La captura rápida permite guardar solicitudes con los campos requeridos sin fecha preferida ni datos del tenant.
- [x] Se puede vincular opcionalmente cliente/propiedad existentes y la dirección se copia a la solicitud.
- [x] Los selectores de cliente y propiedad se pueden buscar escribiendo, filtran la lista y soportan teclado.
- [x] Crear un cliente o administradora desde la captura rápida y persistirlo junto con la solicitud.
- [x] Crear una propiedad desde la captura rápida, vinculada al cliente seleccionado/nuevo.
- [x] Cancelar captura descarta altas temporales; fallos al guardar revierten todo el conjunto.
- [x] Para property managers, mantener tenant/contacto de acceso en la solicitud y asociar la propiedad a la administradora.
- [x] Selector de cliente/administradora buscable en Nueva propiedad y los iconos de lupa/calendario no se superponen con el texto.
- [x] El usuario confirmó alta inline de administradora/propiedad y cancelación sin registros parciales en Tauri.
- [x] Prueba Rust verifica alta atómica de administradora + propiedad + solicitud, con relación `manager` y tenant en la solicitud.
- [x] Prueba Rust verifica rollback de cliente cuando falla el alta de propiedad.
- [ ] Probar el flujo con internet desconectado.
- [x] La validación de campos obligatorios tiene pruebas unitarias.
- [x] Compilar el backend nativo con `cargo check`.
- [x] Generar binario Tauri release con `--no-bundle`.
- [x] Ejecutar la app Tauri y confirmar que SQLite crea el archivo y aplica las migraciones.
- [x] Crear registros de prueba desde la UI y confirmar persistencia y vínculos luego de reiniciar.
- [ ] Editar clientes y propiedades, incluida reasignación que cierre relación vigente y agregue una nueva sin modificar el historial anterior.
- [ ] Agregar/ver fotos y notas en una solicitud.
- [ ] Definir y probar asociación/edición posterior de tenant y contacto de acceso.
- [ ] Definir estados y acciones de seguimiento para solicitudes, sin conversión automática a presupuesto.
- [ ] Completar prueba manual de responsive en escritorio, tablet y celular.

## Consideraciones técnicas

- DB: `HandySystem/src-tauri/migrations/0001_initial.sql`.
- Registro del plugin SQL y migración de Tauri en `HandySystem/src-tauri/src/lib.rs`.
- Acceso a datos encapsulado en `HandySystem/src/lib/database.ts`.
- Rust stable 1.99.1 está instalado. La app crea y usa `handyman.db`; un cliente, una propiedad y una solicitud enlazados sobrevivieron al reinicio.
- La asociación de propiedad/cliente se conserva como historial; en esta primera iteración solo se crea la asignación inicial, todavía no hay UI de reasignación.
