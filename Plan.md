# Plan de desarrollo — Handyman Management

Usa las casillas para seguir el avance: `[ ]` pendiente y `[x]` completado y verificado. Las decisiones confirmadas se listan aparte y no implican que la funcionalidad ya esté construida.

## Objetivo y decisiones confirmadas

- Stack elegido: Tauri v2 + React + TypeScript + Tailwind CSS + SQLite.
- Interfaz en inglés y español; configuración por país, estado/provincia y moneda.
- Una moneda principal por workspace durante el MVP; impuestos configurables y aplicación manual, sin cálculo fiscal automático.
- Captura rápida: nombre y teléfono del contacto, dirección y descripción obligatorios; fecha y fotos opcionales. Selección cliente directo/administradora; datos del tenant opcionales al crear.
- Sugerir seguimientos para presupuesto sin respuesta, confirmar cita y cobrar saldos; plazos configurables por workspace y editables por tarea.
- Lanzamiento MVP local-first en un dispositivo, sin sincronización multi-dispositivo.
- Incluir backup local automático y opciones de exportación/restauración.
- Reportes deben filtrar por todos los estados definidos para cada entidad, cliente/administradora y rango de fechas; permitir imprimir y enviar por email.
- Flujo operativo confirmado: el dueño registra primero una orden recibida por llamada o mensaje; no existe entidad, módulo ni tabla de solicitudes. El presupuesto es opcional y, si hace falta, se crea vinculado a esa orden.
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
- [ ] Diseñar activación de licencia firmada y vinculada a dispositivo, reactivación manual por el vendedor y operación local offline; revisar el requisito anterior de validación central en `handyman.md`.

## Fase 0 — Cimientos

- [x] Revisar estructura actual y definir la separación inicial entre UI, dominio y persistencia.
- [x] Crear scaffold React + TypeScript + Tauri v2 y confirmar build del frontend.
- [x] Instalar Rust/Cargo estable y verificar compilación nativa con `cargo check`.
- [x] Generar binario release de Tauri con `npm run tauri -- build --no-bundle`.
- [x] Abrir la app Tauri y confirmar que el plugin crea/aplica la migración SQLite.
- [x] Crear registros de prueba desde la UI y verificar que siguen en SQLite después de reiniciar la app.
- [x] Definir esquema SQLite inicial, IDs, migración e aislamiento por `workspace_id`.
- [ ] Definir roles/permisos, seguridad local y protección de credenciales sensibles.
- [x] Guardar idioma y moneda principal por workspace desde Configuración; cambiar moneda solo afecta documentos nuevos y no convierte los históricos.
- [ ] Configurar país, estado/provincia y zona horaria del workspace.
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
- [ ] Añadir reasignación de propiedad que cierre relación vigente y preserve historial anterior.
- [x] Registrar órdenes directamente con validación de contacto, dirección y descripción; almacenar localmente en SQLite.
- [x] Buscar y vincular cliente/administradora y propiedad existentes desde el formulario de orden.
- [x] Crear cliente/administradora y propiedad inline al guardar la orden, de forma transaccional sin registros parciales.
- [x] Permitir editar órdenes existentes y mantener tenant/contacto de acceso para órdenes de administradoras.
- [x] Ofrecer vista previa y selección de órdenes vinculadas al corregir perfiles, con auditoría.
- [ ] Agregar captura y visualización de fotos.
- [ ] Probar manualmente alta de órdenes desde la interfaz y cancelación sin borrar historial.
- [ ] Probar captura y guardado con la red desconectada.
- [x] Configurar y poder cambiar la moneda principal desde Configuración, sin asumir USD ni convertir documentos existentes.
- [x] Crear presupuestos explícitamente desde una orden existente.
- [x] Implementar presupuestos con descripción, importe global, modalidad fija/tiempo-materiales y descuento manual por importe o porcentaje.
- [x] Guardar revisiones como nuevas versiones y conservar versiones anteriores.
- [x] Implementar estados de presupuesto y transiciones explícitas; aceptación actualiza la orden vinculada y no crea otra.
- [x] Generar PDF imprimible bilingüe con destinatario, dirección, moneda, descuento, total, estado y versión.
- [ ] Probar manualmente selección de moneda, creación, revisión, estados e impresión en la ventana Tauri.
- [x] Crear orden directamente desde llamada/mensaje; presupuesto opcional asociado no genera órdenes duplicadas.
- [x] Guardar modalidad, importe acordado/estimado, moneda, snapshots, estado, prioridad, instrucciones y fechas de orden.
- [ ] Probar creación directa, programación y transiciones de orden en Tauri.
- [ ] Añadir asignaciones de empleados, materiales, fotos/notas y trabajos adicionales en submódulos correspondientes.
- [x] Definir los catálogos acordados de estados para presupuestos y órdenes de trabajo.
- [x] Definir estado de ciclo de factura por separado de estado de pago.
- [x] Mantener confirmación explícita en el flujo orden → presupuesto opcional → agenda → factura → cobro.
- [x] Eliminar solicitudes de la UI, lógica, tipos y base de datos; conservar presupuestos/órdenes históricos sin solicitud asociada.
- [x] Añadir estados/transiciones de orden `pending_approval` y `accepted`; aceptación del presupuesto habilita programación, y cancelación/no aprobación conserva presupuesto y orden como cancelados.
- [x] Al cambiar el estado de un presupuesto histórico sin orden, crear una orden vinculada con estado equivalente; si se aprueba, abrirla para completar y guardar la cita.
- [x] Añadir validez de 15 días corridos desde envío; al vencer, pedir decisión del dueño para cancelar la orden o generar/enviar nueva versión.
- [x] Añadir inicio/fin de ventana de visita editable al programar órdenes sin presupuesto; permitir edición y cancelación confirmada.
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

- [ ] Agenda de calendario/lista con asignaciones, colores y advertencias de conflictos.
- [ ] Configurar plazos de seguimiento por workspace y permitir editar el vencimiento por tarea.
- [ ] Sugerir seguimiento para presupuestos enviados sin respuesta.
- [ ] Sugerir confirmación de cita sin enviar comunicación externa automáticamente.
- [ ] Sugerir cobro de saldo pendiente solo cuando la factura tenga saldo.
- [ ] Registrar empleados, ayudantes, subcontratistas, horas y pagos externos.
- [ ] Registrar materiales previstos/utilizados, costos, precios, comprobantes y sobrantes.
- [ ] Registrar gastos fijos/recurrentes, variables, viajes, peajes y combustible.

**Criterios de aceptación**

- [ ] Los plazos se pueden configurar por workspace y sobreescribir por tarea.
- [ ] Los conflictos de agenda se advierten sin bloquear la decisión del usuario.
- [ ] Fechas se guardan en UTC y se muestran en la zona horaria del workspace.
- [ ] Horas reales no alteran automáticamente precios fijos.

## Fase 3 — Facturación, finanzas y reportes

- [x] Moneda principal configurable por workspace; presupuestos y órdenes guardan snapshot del código de moneda.
- [ ] Aplicar formatos regionales/moneda en facturas, recibos e informes.
- [ ] Permitir configurar y aplicar impuestos manualmente; no hacer cálculo fiscal automático en MVP.
- [ ] Generar facturas y recibos PDF.
- [ ] Soportar pagos parciales, múltiples pagos por factura y distribución manual entre facturas.
- [ ] Mostrar por separado importe acordado, facturado, cobrado y saldo pendiente.
- [ ] Implementar anulaciones y ajustes con motivo e historial inmutable.
- [ ] Al anular factura emitida, conservar historial y devolver orden a “Pendiente de Facturar”.
- [ ] Al corregir un cliente/administradora/propiedad, mostrar vista previa de documentos asociados y permitir elegir alcance; registrar valores anteriores/nuevos.
- [x] Aplicar correcciones elegidas a las órdenes asociadas, con valores anteriores/nuevos en auditoría.
- [ ] Extender la vista previa a presupuestos/versiones y órdenes vinculadas sin borrar historial.
- [ ] Corregir facturas emitidas mediante anulación y reemisión, nunca sobrescribiendo el documento emitido.
- [ ] Reporte de trabajos con filtro por todos los estados del ciclo (incluye pendientes, programados, en curso, realizados y cancelados).
- [ ] Los reportes permiten filtrar uno o varios estados de cada entidad (Todos por defecto), usando los catálogos completos acordados.
- [ ] Para trabajos, filtrar pendientes/programados/en curso por fecha programada, realizados por fecha de finalización y cancelados por fecha de cancelación.
- [ ] Reporte de facturas por fecha de creación y por cualquier estado de factura definido, incluyendo pagadas y no pagadas.
- [ ] Reporte de presupuestos por fecha de creación o envío y por cualquier estado de presupuesto definido.
- [ ] Permitir filtrar cada reporte por un cliente/administradora o incluir todos.
- [ ] Permitir rango desde/hasta para los reportes y seleccionar uno o varios estados (Todos por defecto).
- [ ] Generar una vista imprimible/PDF de cada reporte y usar el diálogo de impresión del sistema.
- [ ] Crear informes operativos y financieros básicos con totales/listados acordes al tipo de reporte.

**Criterios de aceptación**

- [ ] Pruebas cubren importes, redondeo, pagos parciales, aplicación múltiple, saldo y anulaciones.
- [ ] Ninguna corrección financiera borra información silenciosamente.
- [ ] Cambiar la configuración regional no convierte importes históricos automáticamente.
- [ ] Pruebas cubren cada estado, filtro por cliente/administradora y límites inclusivos del rango de fechas.
- [ ] La fecha aplicada coincide con la regla acordada para cada tipo y estado de reporte.
- [ ] PDF/impresión conserva filtros aplicados y es legible en inglés y español.

## Fase 4 — Respaldo, seguridad e integraciones

- [ ] Implementar backups locales automáticos con estado/error visible.
- [ ] Implementar exportación y restauración con confirmación antes de sobrescribir datos.
- [ ] Definir periodicidad, destino, retención y cifrado de backups.
- [ ] Probar recuperación desde backup.
- [ ] Aplicar permisos por rol y proteger códigos de acceso/lockbox.
- [ ] Aplicar permisos por rol a lockbox/gate code; no incluirlos en presupuestos PDF ni documentos del cliente.
- [ ] Diseñar activación/licencia vinculada a dispositivo con reactivación manual autorizada en cambios de equipo; conservar acceso offline a los datos locales.
- [ ] Ampliar Configuración con nombre del negocio y correo visible; diseñar aparte la autenticación segura del proveedor de email.
- [ ] Permitir al dueño configurar canales email/SMS/WhatsApp mediante proveedor elegido.
- [ ] Permitir configurar un remitente de email del dueño: OAuth para Gmail y Microsoft/Outlook/Hotmail, y SMTP genérico para otros proveedores compatibles.
- [ ] Guardar credenciales/tokens del proveedor en el almacén seguro del sistema operativo, nunca en texto plano en SQLite.
- [ ] Enviar reportes PDF a destinatarios desde la app usando el proveedor configurado, con confirmación y feedback de errores.
- [ ] Implementar confirmación/reprogramación segura y aprobación del dueño si se decide incluir esos servicios en MVP.
- [ ] Evaluar almacenamiento de adjuntos y distribución de documentos.

**Criterios de aceptación**

- [ ] Las funciones locales esenciales continúan disponibles sin internet.
- [ ] El sistema avisa si falla un backup y nunca lo marca como exitoso.
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
- [ ] Configurar firma digital, publicación y proceso de actualización.
- [ ] Revisar seguridad, accesibilidad y rendimiento.

## Fase 6 — Extensión móvil

- [ ] Validar compatibilidad de Tauri v2/plugins en iOS y Android.
- [ ] Adaptar agenda, órdenes, fotos, firma y controles táctiles.
- [ ] Preparar certificados, pruebas en dispositivos y publicación en tiendas.

## Método de trabajo y decisiones pendientes

- [ ] Antes de cada módulo, redactar una especificación con actores, alcance, datos/estados, permisos, errores, modo offline y criterios de aceptación.
- [ ] Diseñar sincronización multi-dispositivo solo para una fase posterior; decidir servicio y resolución de conflictos antes de implementarla.
- [ ] Definir requisitos fiscales, numeración y documentos por jurisdicción; el MVP solo permite impuestos manuales.
- [ ] Definir proveedores externos de comunicación y almacenamiento si se van a utilizar.
- [ ] Evaluar proveedores SMS/WhatsApp por país, costo y requisitos; las cuentas de prueba/sandbox no se consideran envío gratuito de producción.
- [ ] Confirmar significado/requisitos de “firma digital” antes de prometer validez legal.

No se requieren skills ni MCP por ahora; reevaluar si se confirma una integración externa o un flujo especializado recurrente.
