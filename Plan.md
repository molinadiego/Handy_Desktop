# Plan de desarrollo — Handyman Management

Usa las casillas para seguir el avance: `[ ]` pendiente y `[x]` completado y verificado. Las decisiones confirmadas se listan aparte y no implican que la funcionalidad ya esté construida.

## Objetivo y decisiones confirmadas

- Stack elegido: Tauri v2 + React + TypeScript + Tailwind CSS + SQLite.
- Interfaz en inglés y español; configuración por país, estado/provincia, ciudad, moneda y zona horaria.
- Clientes, Propiedades, Órdenes y Presupuestos guardan preferencia independiente de presentación Lista/Tarjetas por workspace.
- Clientes, Propiedades, Órdenes y Presupuestos se pueden filtrar por Todos/Cliente directo/Administradora.
- Una moneda principal por workspace durante el MVP; porcentaje de impuesto configurable que se aplica a nuevos borradores, sin cálculo fiscal por jurisdicción; los snapshots existentes no cambian.
- Captura rápida: nombre y teléfono del contacto, dirección y descripción obligatorios; fecha y fotos opcionales. Selección cliente directo/administradora; datos del tenant opcionales al crear.
- Sugerir seguimientos para presupuesto sin respuesta, confirmar cita y cobrar saldos; plazos configurables por workspace y editables por tarea.
- Lanzamiento MVP local-first en un dispositivo, sin sincronización multi-dispositivo.
- Incluir backup local automático y opciones de exportación/restauración.
- Reportes deben filtrar por todos los estados definidos para cada entidad, cliente/administradora y rango de fechas; permitir imprimir y enviar por email.
- Flujo operativo confirmado: el dueño puede registrar primero una orden recibida por llamada o mensaje, o capturar un presupuesto independiente. Al cambiar explícitamente el estado de un presupuesto sin orden, se genera una orden vinculada; si se aprueba, se abre para programar la visita. No existe entidad/módulo de solicitudes.
- Orden con presupuesto enviado: queda en `pending_approval`; presupuesto aceptado permite programar la visita y presupuesto cancelado cancela la orden conservando ambos historiales.
- Presupuesto: validez de 15 días corridos contados desde su envío. Al vencer, pasa a `expired` y la app solicita al dueño decidir entre cancelar la orden o preparar/enviar una nueva versión; no cancela automáticamente.
- Orden sin presupuesto: al acordar la visita pasa a programada con fecha/hora de inicio y finalización (ventana editable; 4 horas es lo habitual, no una duración fija). Se puede editar y cancelar con historial.
- Órdenes: pendiente, pendiente de aprobación, aceptada, programada, en curso, realizada y cancelada.
- Presupuestos: borrador, enviado, aceptado, vencido y cancelado. La no aprobación se registra cancelando el presupuesto y la orden; no se borra ningún registro.
- Datos de acceso: lockbox y gate code opcionales en la orden y disponibles para el presupuesto asociado; son sensibles, sujetos a permisos y nunca se incluyen en PDF/documentos destinados al cliente.
- Configuración del negocio incluye nombre, idioma, moneda principal y correo del negocio. Configurar la dirección no habilita por sí solo el envío: email requiere autorizar/configurar un proveedor.
- Licencia comercial: activación vinculada a dispositivo mediante licencia verificable/firma; el cambio o reinstalación de computadora requiere reactivación manual autorizada por el vendedor. La app no debe bloquear acceso a datos locales por falta de conexión ni prometer protección anticopia infalible.
- Comunicaciones: no hay proveedor gratuito de producción confirmado. SMS y WhatsApp requieren contemplar costos, límites y configuración; los trials/sandboxes son solo para pruebas. No enviar sin consentimiento y acción explícita.
- Facturas: estado de ciclo (borrador, emitida, anulada) separado del estado de pago (no pagada, parcial, pagada).
- [ ] Definir periodicidad, destino, retención, cifrado y flujo de restauración de backups.
- [ ] Diseñar activación offline con licencia firmada, vínculo a instalación/dispositivo y reactivación manual por el vendedor; no consultar servidor periódicamente ni bloquear datos locales.
- [ ] Confirmar si el MVP admite un solo negocio/workspace por instalación o varios; actualmente la app usa un `local-workspace` fijo.

## Fase 0 — Cimientos

- [x] Revisar estructura actual y definir la separación inicial entre UI, dominio y persistencia.
- [x] Crear scaffold React + TypeScript + Tauri v2 y confirmar build del frontend.
- [x] Instalar Rust/Cargo estable y verificar compilación nativa con `cargo check`.
- [x] Generar binario release de Tauri con `npm run tauri -- build --no-bundle`.
- [x] Abrir la app Tauri y confirmar que el plugin crea/aplica la migración SQLite.
- [x] Crear registros de prueba desde la UI y verificar que siguen en SQLite después de reiniciar la app.
- [x] Definir esquema SQLite inicial, IDs, migración e aislamiento por `workspace_id`.
- [ ] Endurecer el acceso al SQL plugin: login local, gestión de usuarios y permisos están implementados; la consulta ordinaria de órdenes omite códigos y la lectura va por Rust. Falta cerrar el permiso SQL genérico del WebView para impedir consultas arbitrarias. Los códigos permanecen en texto plano en SQLite por decisión del dueño, así que el acceso directo al archivo sigue fuera de la protección de login.
- [ ] Validar manualmente perfil operativo user: menú limitado; órdenes filtradas por tareas asignadas; completar/cancelar asignación propia no cambia el estado global; borradores sin precio; tareas compartidas e historial de reasignación. La lógica y migración 0035 están implementadas.
- [x] Guardar idioma y moneda principal por workspace desde Configuración; cambiar moneda solo afecta documentos nuevos y no convierte los históricos.
- [x] Configurar país, estado/provincia, ciudad y zona horaria del workspace; mostrar/editar citas en esa zona y conservar UTC en la base.
- [x] Permitir elegir Lista/Tarjetas por separado para Clientes, Propiedades, Órdenes y Presupuestos; persistir por workspace.
- [ ] Validar manualmente en Tauri que las cuatro preferencias de vista persisten al reiniciar y se adaptan a pantallas pequeñas.
- [x] Implementar base visual responsive conforme a `diseno.md`.
- [x] Compilar frontend de producción con TypeScript y Vite.
- [x] Abrir app nativa de escritorio y confirmar base SQLite inicializada.
- [x] Confirmar que los registros de prueba persisten después de reiniciar la app.

**Salida de fase:** arquitectura y esquema inicial registrados; frontend y binario nativo compilan. Falta completar validaciones manuales de flujos en la ventana de escritorio.

## Fase 1 — Clientes, propiedades y captura de trabajo

- [x] Especificar y construir alta/listado local de clientes directos y administradoras.
- [x] Permitir editar clientes directos y administradoras (nombre, contacto, teléfono, email y empresa) para corregir errores.
- [x] Al corregir nombre/teléfono del cliente, ofrecer vista previa y selección de órdenes vinculadas; actualizar las elegidas con auditoría.
- [x] Construir alta/listado de propiedades asociadas a un cliente y guardar asignación inicial en historial.
- [x] Permitir editar los datos actuales de propiedades para corregir dirección y otros datos de ubicación.
- [x] Al corregir dirección de una propiedad, ofrecer vista previa y selección de órdenes vinculadas; actualizar las elegidas sin cambiar asignación histórica.
- [ ] Probar manualmente edición de cliente/administradora y propiedad con vista previa de propagación a órdenes seleccionadas.
- [x] Añadir reasignación de propiedad que cierre relación vigente y preserve historial anterior, con confirmación explícita y operación transaccional.
- [x] Registrar órdenes directamente con validación de contacto, dirección y descripción; almacenar localmente en SQLite.
- [x] Buscar y vincular cliente/administradora y propiedad existentes desde el formulario de orden.
- [x] Crear cliente/administradora y propiedad inline al guardar la orden, de forma transaccional sin registros parciales.
- [x] Permitir editar órdenes existentes y mantener tenant/contacto de acceso para órdenes de administradoras.
- [x] Filtrar clientes, propiedades, órdenes y presupuestos por tipo de cliente/administradora.
- [x] Ofrecer vista previa y selección de órdenes vinculadas al corregir perfiles, con auditoría.
- [x] Agregar selección y visualización local de fotos y notas por orden; captura desde cámara queda para una fase posterior.
- [ ] Probar manualmente alta de órdenes desde la interfaz y cancelación sin borrar historial.
- [ ] Probar captura y guardado con la red desconectada.
- [x] Configurar y poder cambiar la moneda principal desde Configuración, sin asumir USD ni convertir documentos existentes.
- [x] Crear presupuestos desde una orden o independientemente, guardando snapshots de cliente/contacto/dirección.
- [x] Implementar presupuestos con descripción, importe global, modalidad fija/tiempo-materiales y descuento manual por importe o porcentaje.
- [x] Guardar revisiones como nuevas versiones y conservar versiones anteriores.
- [x] Implementar estados de presupuesto y transiciones explícitas; aceptación actualiza la orden vinculada y no crea otra.
- [x] Generar PDF imprimible bilingüe con destinatario, dirección, moneda, descuento, total, estado y versión.
- [ ] Probar manualmente selección de moneda, creación, revisión, estados e impresión en la ventana Tauri.
- [x] Crear orden directamente desde llamada/mensaje; presupuesto opcional asociado no genera órdenes duplicadas.
- [x] Guardar modalidad, importe acordado/estimado, moneda, snapshots, estado, prioridad, instrucciones y fechas de orden.
- [ ] Probar creación directa, programación y transiciones de orden en Tauri.
- [x] Asignar empleados a órdenes, adjuntar fotos/notas y registrar por separado el trabajo realizado al finalizar.
- [x] Registrar materiales con los cuatro campos definidos por el dueño.
- [x] Registrar gastos generales/asociados y trabajos adicionales con motivo e aprobación explícita.
- [x] Definir los catálogos acordados de estados para presupuestos y órdenes de trabajo.
- [x] Definir estado de ciclo de factura por separado de estado de pago.
- [x] Mantener confirmación explícita en el flujo orden → presupuesto opcional → agenda → factura → cobro.
- [x] Eliminar solicitudes de la UI, lógica, tipos y base de datos; conservar presupuestos/órdenes históricos sin solicitud asociada.
- [x] Añadir estados/transiciones de orden `pending_approval` y `accepted`; aceptación del presupuesto habilita programación, y cancelación/no aprobación conserva presupuesto y orden como cancelados.
- [x] Al cambiar el estado de un presupuesto sin orden, crear una orden vinculada con estado equivalente; si se aprueba, abrirla para completar y guardar la cita.
- [x] Añadir validez de 15 días corridos desde envío; al vencer, pedir decisión del dueño para cancelar la orden o generar/enviar nueva versión.
- [x] Añadir inicio/fin de ventana de visita editable al programar órdenes sin presupuesto; permitir edición y cancelación confirmada.
- [x] Permitir finalizar órdenes sin presupuesto desde un estado activo sin forzar transiciones intermedias; exigir aprobación del presupuesto vigente antes de programar/finalizar.
- [x] Exigir un importe positivo y confirmación explícita si se finaliza una orden directa creada sin importe.
- [x] Añadir campos opcionales lockbox y gate code a la orden; los campos se enmascaran al editar y se excluyen de documentos del cliente.
- [x] Actualizar especificaciones funcionales y pruebas para que reflejen el flujo nuevo.
- [ ] Validar manualmente en Tauri alta directa, crear/enviar/aceptar/cancelar presupuesto, vencimiento y programación.

**Criterios de aceptación**

- [x] La orden exige nombre, teléfono, dirección y descripción; validación en backend.
- [ ] Verificar captura y guardado sin conexión en Tauri real; el código usa SQLite local.
- [x] No se crean solicitudes; cada orden se registra directamente.
- [ ] Propiedades y datos históricos no se reasignan al cambiar dueño/administradora.
- [ ] Editar perfiles no altera silenciosamente los datos históricos capturados en trabajos/facturas anteriores.

## Fase 2 — Agenda, seguimiento y ejecución

- [x] Agenda local en calendario mensual/lista diaria; eventos abren la orden y advierten solapamientos sin bloquear.
- [x] Directorio local de empleados, asignación múltiple a órdenes y colores visibles en la agenda; alertas de solapamiento por responsable compartido.
- [x] Registrar por empleado/orden tiempo por hora o costo interno por trabajo, con historial, notas opcionales y validación de traslapes horarios.
- [x] Configurar plazos de seguimiento por workspace (default 15 días corridos) y permitir editar el vencimiento por tarea.
- [x] Sugerir seguimiento para presupuestos enviados sin respuesta.
- [x] Sugerir confirmación de cita sin enviar comunicación externa automáticamente.
- [x] Sugerir cobro de saldo pendiente solo cuando la factura tenga saldo.
- [x] Registrar pagos externos a empleados con vínculo opcional a órdenes/costos por trabajo; no incluye nómina ni procesamiento de pagos.
- [x] Ampliar el directorio de personal a ayudantes/subcontratistas sin crear cuentas ni permisos.
- [x] Registrar por orden material, cantidad utilizada, costo total y precio unitario del material; no cambia automáticamente el importe acordado.
- [x] Registrar gastos fijos/recurrentes, variables, viajes, peajes, combustible y repuestos, generales o vinculados a órdenes, con comprobantes internos.

**Criterios de aceptación**

- [x] Los plazos se pueden configurar por workspace y sobreescribir por tarea.
- [x] Los conflictos de agenda se advierten sin bloquear la decisión del usuario cuando hay empleados asignados en común.
- [x] Fechas se guardan en UTC y se muestran en la zona horaria del workspace.
- [x] Registrar horas reales no altera automáticamente precios fijos ni importes de la orden.
- [x] Materiales llevan snapshots de moneda, comprobantes internos y precios de referencia sin sumarse automáticamente al importe acordado.

## Fase 3 — Facturación, finanzas y reportes

- [x] Moneda principal configurable por workspace; presupuestos y órdenes guardan snapshot del código de moneda.
- [x] Aplicar formato regional/moneda en facturas.
- [x] Aplicar automáticamente en nuevos borradores la tasa porcentual configurada por workspace; conservar importes históricos y no calcular impuestos por jurisdicción.
- [x] Generar e imprimir/PDF de facturas.
- [x] Registrar pagos parciales y distribuir manualmente un pago entre varias facturas de la misma moneda.
- [x] Mostrar subtotal acordado, facturado, cobrado y saldo pendiente.
- [x] Filtrar facturas por destinatario, tipo de cliente/administradora y dirección; separar pendientes, pagadas y todas.
- [x] Registrar cobros externos desde cada factura con importe sugerido igual al saldo; mantener parcial/pagada según asignaciones.
- [x] Anular facturas emitidas con motivo; conservar factura y asignaciones de pago en historial.
- [x] Al anular factura emitida, conservar historial y volver a ofrecer la orden realizada para facturar.
- [ ] Al corregir un cliente/administradora/propiedad, mostrar vista previa de documentos asociados y permitir elegir alcance; registrar valores anteriores/nuevos.
- [x] Aplicar correcciones elegidas a las órdenes asociadas, con valores anteriores/nuevos en auditoría.
- [ ] Extender la vista previa a presupuestos/versiones y órdenes vinculadas sin borrar historial.
- [x] Corregir factura emitida mediante anulación y reemisión, sin sobrescribir la emitida.
- [x] Reportes locales de trabajos con filtro por estados del ciclo (pendientes, programados, en curso, realizados y cancelados).
- [x] Reportes permiten seleccionar uno o varios estados/categorías o Todos por defecto.
- [x] Trabajos se filtran por fecha programada, finalización o cancelación según estado.
- [x] Reportes de facturas/cobros, por fecha de factura y estados, incluyen facturado, cobrado y saldo.
- [x] Reportes de presupuestos por fecha de creación o envío y estado.
- [x] Filtrar cada registro vinculado por cliente/administradora; Todos incluye registros generales sin orden.
- [x] Rango desde/hasta inclusivo, con fechas interpretadas en el día local del workspace.
- [x] Vista imprimible conserva los filtros y se envía al diálogo de impresión del sistema.
- [x] Informes operativos/financieros básicos con listados y totales agrupados por moneda.

**Criterios de aceptación**

- [ ] Pruebas cubren importes, redondeo, pagos parciales, aplicación múltiple, saldo y anulaciones.
- [ ] Ninguna corrección financiera borra información silenciosamente.
- [ ] Cambiar la configuración regional no convierte importes históricos automáticamente.
- [ ] Pruebas cubren cada estado, filtro por cliente/administradora y límites inclusivos del rango de fechas.
- [ ] La fecha aplicada coincide con la regla acordada para cada tipo y estado de reporte.
- [ ] PDF/impresión conserva filtros aplicados y es legible en inglés y español.

## Fase 4 — Respaldo, seguridad e integraciones

- [x] Implementar backups locales automáticos diarios con estado/error visible.
- [x] Implementar exportación y restauración cifradas con confirmación antes de sobrescribir datos.
- [x] Definir periodicidad diaria, destino local, retención de 30 días, contraseña y clave de recuperación.
- [ ] Probar manualmente recuperación desde backup y verificar la clave de recuperación en Tauri.
- [ ] Aplicar permisos por rol y proteger códigos de acceso/lockbox.
- [ ] Implementar control de acceso por rol y protección local de lockbox/gate codes; mantenerlos fuera de documentos del cliente.
- [ ] Implementar activación offline con licencia firmada, recuperación/reasignación manual y acceso continuo a datos locales.
- [ ] Ampliar Configuración con nombre del negocio y correo visible; diseñar aparte la autenticación segura del proveedor de email.
- [ ] Permitir al dueño configurar canales email/SMS/WhatsApp mediante proveedor elegido.
- [ ] Permitir configurar un remitente de email del dueño: OAuth para Gmail y Microsoft/Outlook/Hotmail, y SMTP genérico para otros proveedores compatibles.
- [ ] Guardar credenciales/tokens del proveedor en el almacén seguro del sistema operativo, nunca en texto plano en SQLite.
- [ ] Enviar reportes PDF a destinatarios desde la app usando el proveedor configurado, con confirmación y feedback de errores.
- [ ] Implementar confirmación/reprogramación segura y aprobación del dueño si se decide incluir esos servicios en MVP.
- [ ] Evaluar almacenamiento de adjuntos y distribución de documentos.

**Criterios de aceptación**

- [ ] Las funciones locales esenciales continúan disponibles sin internet.
- [x] El sistema avisa si falla un backup y nunca lo marca como exitoso.
- [ ] Las integraciones externas no bloquean el registro local de trabajo.
- [ ] No se incorporan proveedores sin selección y aprobación explícitas.
- [ ] La interfaz distingue dirección de correo visible de la cuenta/proveedor autenticado; no se envía email con solo capturar una dirección.
- [ ] Mensajes SMS/WhatsApp requieren proveedor configurado, costos/límites comunicados y confirmación explícita antes de enviar.

## Fase 5 — Calidad y lanzamiento de escritorio

- [ ] Completar UI responsive: tablas/paneles en escritorio y tarjetas/controles táctiles en pantallas pequeñas.
- [ ] Implementar captura de cámara y compresión local de imágenes (objetivo recomendado ≤5 MB).
- [ ] Implementar captura táctil de firma, confirmando antes requisitos legales de uso.
- [ ] Añadir estados hover, active, loading, error, vacío y éxito a las acciones.
- [ ] Ejecutar pruebas de permisos, workspace, transiciones, finanzas, UTC, migraciones, offline y backups.
- [ ] Preparar builds y pruebas de instalación para Windows, macOS y Linux.
- [ ] Configurar firma de binarios para identidad del editor e integridad; no considerarla protección anticopia por sí sola. Preparar publicación y actualización.
- [ ] Revisar seguridad, accesibilidad y rendimiento.

## Fase 6 — Extensión móvil

- [ ] Validar compatibilidad de Tauri v2/plugins en iOS y Android.
- [ ] Adaptar agenda, órdenes, fotos, firma y controles táctiles.
- [ ] Preparar certificados, pruebas en dispositivos y publicación en tiendas.

## Método de trabajo y decisiones pendientes

- [ ] Antes de cada módulo, redactar una especificación con actores, alcance, datos/estados, permisos, errores, modo offline y criterios de aceptación.
- [ ] Diseñar sincronización multi-dispositivo solo para una fase posterior; decidir servicio y resolución de conflictos antes de implementarla.
- [ ] Definir requisitos fiscales, numeración y documentos por jurisdicción; el MVP no calcula impuestos por jurisdicción.
- [ ] Definir proveedores externos de comunicación y almacenamiento si se van a utilizar.
- [ ] Evaluar proveedores SMS/WhatsApp por país, costo y requisitos; las cuentas de prueba/sandbox no se consideran envío gratuito de producción.
- [ ] Confirmar significado/requisitos de “firma digital” antes de prometer validez legal.

No se requieren skills ni MCP por ahora; reevaluar si se confirma una integración externa o un flujo especializado recurrente.
