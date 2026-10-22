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
- [ ] Definir periodicidad, destino, retención, cifrado y flujo de restauración de backups.
- [ ] Diseñar validación central de licencia/usuario por separado de la sincronización (requisito aún presente en `handyman.md`).

## Fase 0 — Cimientos

- [x] Revisar estructura actual y definir la separación inicial entre UI, dominio y persistencia.
- [x] Crear scaffold React + TypeScript + Tauri v2 y confirmar build del frontend.
- [x] Instalar Rust/Cargo estable y verificar compilación nativa con `cargo check`.
- [x] Generar binario release de Tauri con `npm run tauri -- build --no-bundle`.
- [ ] Ejecutar la app Tauri y validar migraciones y lecturas/escrituras SQLite en runtime.
- [x] Definir esquema SQLite inicial, IDs, migración e aislamiento por `workspace_id`.
- [ ] Definir roles/permisos, seguridad local y protección de credenciales sensibles.
- [ ] Especificar idioma, país, estado/provincia, moneda principal y zona horaria por workspace.
- [x] Implementar base visual responsive conforme a `diseno.md`.
- [x] Compilar frontend de producción con TypeScript y Vite.
- [ ] Abrir y probar la app nativa de escritorio (la compilación Rust ya pasa; falta validar runtime).

**Salida de fase:** arquitectura y esquema inicial registrados; frontend compila. La salida nativa de escritorio queda pendiente de instalar Rust/Cargo y ejecutar Tauri.

## Fase 1 — Clientes, propiedades y captura de trabajo

- [x] Especificar y construir alta/listado local de clientes directos y administradoras.
- [x] Construir alta/listado de propiedades asociadas a un cliente y guardar asignación inicial en historial.
- [ ] Añadir reasignación de propiedad que cierre relación vigente y preserve historial anterior.
- [x] Implementar captura rápida, validación de campos obligatorios y guardado en SQLite.
- [x] Permitir fecha preferida y datos de tenant/contacto opcionales; asociar cliente/propiedad existentes opcionalmente.
- [ ] Agregar captura y visualización de fotos.
- [ ] Validar lectura/escritura offline en runtime Tauri real (pendiente de Rust/Cargo).
- [ ] Construir solicitudes y presupuestos versionados, descuentos manuales y exportación PDF.
- [ ] Construir órdenes con modalidad de cobro, fechas, estado, prioridad, asignados, instrucciones, materiales, fotos y notas.
- [ ] Mantener transiciones Solicitud → Presupuesto/Acuerdo → Orden explícitas y confirmadas.

**Criterios de aceptación**

- [x] No se puede guardar solicitud sin nombre, teléfono, dirección y descripción; validación unitaria y campos opcionales.
- [ ] Verificar captura y guardado sin conexión en Tauri real; el código usa SQLite local.
- [x] Guardar solicitud no la convierte automáticamente en presupuesto u orden.
- [ ] Propiedades y datos históricos no se reasignan al cambiar dueño/administradora.

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

## Fase 3 — Facturación y finanzas

- [ ] Implementar una moneda principal por workspace y formatos de presentación regionales.
- [ ] Permitir configurar y aplicar impuestos manualmente; no hacer cálculo fiscal automático en MVP.
- [ ] Generar facturas y recibos PDF.
- [ ] Soportar pagos parciales, múltiples pagos por factura y distribución manual entre facturas.
- [ ] Mostrar por separado importe acordado, facturado, cobrado y saldo pendiente.
- [ ] Implementar anulaciones y ajustes con motivo e historial inmutable.
- [ ] Al anular factura emitida, conservar historial y devolver orden a “Pendiente de Facturar”.
- [ ] Crear informes operativos y financieros básicos.

**Criterios de aceptación**

- [ ] Pruebas cubren importes, redondeo, pagos parciales, aplicación múltiple, saldo y anulaciones.
- [ ] Ninguna corrección financiera borra información silenciosamente.
- [ ] Cambiar la configuración regional no convierte importes históricos automáticamente.

## Fase 4 — Respaldo, seguridad e integraciones

- [ ] Implementar backups locales automáticos con estado/error visible.
- [ ] Implementar exportación y restauración con confirmación antes de sobrescribir datos.
- [ ] Definir periodicidad, destino, retención y cifrado de backups.
- [ ] Probar recuperación desde backup.
- [ ] Aplicar permisos por rol y proteger códigos de acceso/lockbox.
- [ ] Definir validación de licencia/usuario online con operación local offline continua.
- [ ] Permitir al dueño configurar canales email/SMS/WhatsApp mediante proveedor elegido.
- [ ] Implementar confirmación/reprogramación segura y aprobación del dueño si se decide incluir esos servicios en MVP.
- [ ] Evaluar almacenamiento de adjuntos y distribución de documentos.

**Criterios de aceptación**

- [ ] Las funciones locales esenciales continúan disponibles sin internet.
- [ ] El sistema avisa si falla un backup y nunca lo marca como exitoso.
- [ ] Las integraciones externas no bloquean el registro local de trabajo.
- [ ] No se incorporan proveedores sin selección y aprobación explícitas.

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
- [ ] Confirmar significado/requisitos de “firma digital” antes de prometer validez legal.

No se requieren skills ni MCP por ahora; reevaluar si se confirma una integración externa o un flujo especializado recurrente.
