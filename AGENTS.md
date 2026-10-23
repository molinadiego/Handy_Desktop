# Instrucciones para agentes

## Propósito y fuentes de verdad

- Este repositorio construye una aplicación de gestión para negocios de handyman, según `handyman.md` y `diseno.md`.
- Antes de cambiar una regla de producto, consulta esos documentos. Si hay contradicciones, no inventes una resolución: documenta la discrepancia y solicita confirmación.
- Mantén `MEMORY.md` como contexto breve de decisiones confirmadas y `Plan.md` como hoja de ruta. No presentes como decidido lo que estos documentos marcan como pendiente.

## Stack y arquitectura objetivo

- Stack de producto confirmado: Tauri v2, React, TypeScript, Tailwind CSS y SQLite.
- Mantén separadas la interfaz, la lógica de negocio y la persistencia para compartir frontend y lógica entre escritorio y móvil.
- Diseña para funcionamiento offline-first. La operación local no debe depender de que la red esté disponible; sincronización y servicios remotos deben estar encapsulados.
- Aísla los datos por `workspace_id`; aplica autorización también en operaciones de datos, no solo ocultando controles de UI.
- Almacena fechas/horas en UTC y muestra según la zona horaria configurada para el workspace.
- No agregues dependencias de backend, sincronización o proveedores externos hasta que se confirme su diseño.

## Reglas de negocio que deben preservarse

- Flujo principal: el dueño registra una Orden de Trabajo desde una llamada/mensaje; puede crear un Presupuesto vinculado si hace falta. No existe módulo de solicitudes. Aceptación, programación, cancelación y demás transiciones requieren acción explícita; no convertir ni borrar registros silenciosamente.
- Las administradoras son el destinatario de la orden/factura cuando aplique; los datos del tenant se usan para coordinar acceso. Preserva el contexto histórico de trabajos aunque cambie la administración o titularidad.
- Precio fijo: las horas reales no cambian automáticamente el precio. Cambios requieren ajuste explícito y justificación.
- Tiempo y materiales: registrar horas y materiales para calcular/justificar el costo. Trabajos adicionales requieren motivo, importe y aprobación explícita.
- Distingue importe acordado, facturado, cobrado y saldo pendiente. Admite pagos parciales y aplicación manual de pagos a múltiples facturas.
- No borres silenciosamente registros financieros. Usa anulaciones/ajustes auditables. Al anular una factura emitida, conserva el historial y vuelve la orden asociada a “Pendiente de Facturar”.
- No procesar pagos de clientes dentro de la aplicación en el MVP; registrar pagos externos.
- Protege códigos de acceso/lockbox según rol. Aplica mínimo privilegio.
- La configuración regional debe permitir seleccionar país, estado/provincia y moneda. No fijes USD ni asumas una jurisdicción única; la interfaz debe soportar inglés y español.
- El dueño configura los canales de recordatorios (email, SMS y/o WhatsApp) mediante proveedores compatibles. No asumas proveedor ni envíes comunicaciones sin configuración/autorización.
- La captura rápida de orden exige nombre y teléfono del contacto, dirección del trabajo y descripción breve; fecha y fotos son opcionales. Permite clasificar como cliente directo o administradora; para administradora, los datos del tenant/contacto de acceso pueden completarse después.
- Sugiere seguimientos para presupuestos sin respuesta, confirmación de citas y cobro de saldos. Los plazos predeterminados se configuran por workspace y se pueden ajustar en cada tarea.
- Cada workspace usa una moneda principal en el MVP. Los impuestos son configurables y se aplican manualmente; no prometas cálculo fiscal automático ni cumplimiento por jurisdicción.
- El MVP es local-first, sin sincronización multi-dispositivo al lanzamiento. Debe incluir backups locales automáticos y exportación/restauración; no incorpores proveedor cloud sin confirmación.

## UI y accesibilidad visual

- Usa Tailwind CSS; prioriza shadcn/ui si se incorpora una librería de componentes.
- Sigue `diseno.md`: neutros suaves, texto slate legible, acento sobrio, badges por estado, tarjetas y bordes sutiles, tablas claras y densidad equilibrada.
- Incluye estados hover, active, carga y feedback para acciones; conserva estados de error y vacío útiles.
- Diseño responsive: tablas/paneles completos en escritorio; tarjetas, navegación adaptable y controles táctiles en móvil/tablet.
- No sacrifiques legibilidad ni autorización para aumentar densidad de información.

## Forma de trabajo

- Antes de implementar una funcionalidad, define su comportamiento y criterios de aceptación; para funcionalidades de módulo, usa especificaciones breves (spec-driven development) que cubran flujo feliz, errores, permisos y modo offline.
- Para cambios de datos, explica migraciones y compatibilidad; nunca elimines datos existentes ni hagas cambios destructivos sin autorización explícita.
- Añade o actualiza pruebas para reglas financieras, permisos, transiciones de estado, fechas y sincronización cuando aplique.
- Mantén los cambios acotados y consistentes con las convenciones existentes. No agregues skills o MCP por defecto: solo propónlos si hay una tarea recurrente concreta o una integración externa confirmada.
- Al finalizar, resume archivos y comportamiento modificados, validaciones ejecutadas y pendientes/bloqueos.

## Alcance MVP conocido

Incluye clientes, property managers y propiedades; órdenes, presupuestos, agenda y asignaciones; personal; materiales y gastos; facturas, cobros y saldos; adjuntos, notas e informes básicos. Escritorio es la primera fase; móvil es fase posterior. No incluir IA autónoma, pagos con tarjeta dentro de la app, nómina completa ni GPS en tiempo real.
