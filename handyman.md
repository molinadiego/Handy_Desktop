ESPECIFICACIÓN DE PRODUCTO Y ALCANCE FUNCIONAL (MVP)
Proyecto: Aplicación de Gestión para Negocios de Handyman
Versión: 1.0 (Revisada para Escritorio y Dispositivos Móviles)
Fecha: 20 de octubre de 2026
Arquitectura y Stack Objetivo: Tauri v2 + React (o Vue) + TypeScript + Tailwind CSS + SQLite (Estrategia Offline-First con código compartido para Escritorio y Móvil).

1. OBJETIVO DEL PRODUCTO
   Crear una aplicación comercial multiplataforma para que el dueño de un negocio de handyman administre el trabajo diario y las finanzas operativas desde un solo lugar.

Módulos Clave:

- Clientes, Administradoras de Propiedades e Inmuebles.
- Órdenes de Trabajo y Presupuestos.
- Agenda, Citas, Asignación de Trabajos y Recordatorios.
- Empleados, Ayudantes y Subcontratistas.
- Materiales, Gastos y Costos por Trabajo.
- Facturas, Cobros, Recibos y Saldos Pendientes.
- Comunicaciones, Notas, Fotos y Documentos Adjuntos.
- Informes Operativos y Financieros Básicos.

2. DECISIONES GENERALES Y ESTRATEGIA MULTIPLATAFORMA

- Mercado e Idioma: Configurable, pudiendo seleccionar País, Estado o Provincia, Ciudad, Zona Horaria y Tipo de moneda. Interfaz en inglés y español.
- Enfoque Multiplataforma Integrado:
  - Fase 1 (Lanzamiento Principal): Aplicación de escritorio nativa ejecutable en Windows, macOS y Linux.
  - Fase 2 (Extensión Móvil): Compilación nativa para iOS y Android (celulares y tabletas) utilizando Tauri v2 y compartiendo la misma base de código frontend y lógica de negocio.
- Arquitectura de Datos (Offline-First): En el lanzamiento la app usará SQLite local y seguirá operativa sin internet. La sincronización multidispositivo queda para una fase posterior, con servicio, conflictos y consentimiento definidos antes de implementarla.
- Aislación por Espacio de Trabajo: Multitenancy lógico mediante workspace_id. Los datos de un negocio están estrictamente separados de otros.
- Seguridad y Accesos:
  - El dueño del negocio es el usuario principal (Admin).
  - Empleados/Ayudantes acceden con roles y permisos restringidos definidos por el dueño.
  - Las credenciales sensibles (códigos de acceso/lockbox) solo se muestran a usuarios autorizados.
- Flujo Financiero e Historial Inmutable:
  - Los clientes pagan directamente al dueño/negocio. La app no procesa pagos en línea de clientes en el MVP (solo registra cobros externos).
  - No se eliminan registros financieros silenciosamente; las correcciones se realizan mediante anulaciones o ajustes con historial inmutable.

3. CLIENTES, ADMINISTRADORAS Y PROPIEDADES

- Clientes Directos: Registro de personas/empresas con datos de contacto y propiedades asociadas. Las facturas llevan el nombre del cliente y la dirección donde se hizo el trabajo.
- Administradoras de Propiedades (Property Managers): La orden y factura se asignan a la Administradora, mientras que los datos del tenant (inquilino/contacto de acceso) se guardan en la orden únicamente para coordinar la visita.
- Historial de Propiedades: Si una propiedad cambia de dueño o administradora, se conserva el historial de trabajos anteriores sin reasignar trabajos pasados.

4. PRESUPUESTOS Y ÓRDENES DE TRABAJO

- Flujo de Trabajo: el dueño registra una Orden de Trabajo a partir de una llamada o mensaje, o ingresa un Presupuesto directamente. No existe entidad ni flujo de solicitudes. Si el presupuesto se crea sin orden, al cambiar explícitamente su estado se materializa la orden vinculada. Si se aprueba, la orden queda aceptada y se abre para programar la visita; si se cancela/no aprueba, se conserva el presupuesto y se crea/cancela la orden asociada. Luego: Orden de Trabajo -> Factura -> Cobro. Ningún paso convierte o cancela registros automáticamente sin confirmación del usuario.
- Presupuestos: Se pueden crear desde una orden o registrar independientemente antes de que exista la orden; al cambiar explícitamente su estado, se crea y vincula una orden si todavía no existe. Edición, historial de versiones y exportación a PDF; descuentos manuales. La validez es de 15 días corridos desde el envío. Al vencer, el presupuesto queda vencido y se solicita al dueño decidir si cancela la orden o prepara/envía una nueva versión. Si se aprueba, la app abre la orden para capturar día/hora de la visita.
- Órdenes de Trabajo: Incluyen cliente/administradora, propiedad, descripción, fechas/tiempos estimados, estado, prioridad, personal asignado, instrucciones de acceso, materiales, fotos y notas. Sin presupuesto, al acordar la visita se agenda una ventana con fecha/hora de inicio y fin, editable; 4 horas es habitual, no obligatorio.
- Lockbox y gate code son campos opcionales de acceso asociados a la orden (y disponibles para el presupuesto relacionado), protegidos por permisos y excluidos de PDF/documentos para clientes.
- Modalidad de Cobro:
  - Precio Fijo: El tiempo real registrado no altera el precio acordado automáticamente.
  - Tiempo y Materiales: Permite calcular o justificar el costo según horas y materiales consumidos.
- Trabajos Adicionales / Cambios de Alcance: Se registran por separado con motivo e importe. Requieren aprobación explícita del cliente.

5. AGENDA, ASIGNACIONES Y COMUNICACIONES

- Calendario y Lista: Vista de agenda interactiva con detección y advertencia de conflictos de horarios. Cada empleado tiene un color distintivo.
- Citas y Confirmaciones:
  - Envío de recordatorios por email, SMS o WhatsApp configurable por el dueño(vía proveedor compatible).
  - Para propiedades administradas, las notificaciones de acceso van al tenant, no a la administradora.
   - Enlace seguro para confirmación o pedido de reprogramación por parte del cliente/tenant. Los pedidos quedan pendientes de aprobación por el dueño.

6. EMPLEADOS, AYUDANTES Y SUBCONTRATISTAS

- Registro de personal y subcontratistas, asignación a trabajos, seguimiento de horas y pagos realizados fuera de la app.
- Para ayudantes sin acceso a la app, el dueño puede compartir la información de la orden mediante enlaces o documentos exportables.

7. MATERIALES, GASTOS Y OTROS COSTOS

- Materiales (decisión confirmada): registrar por orden únicamente material, cantidad utilizada, costo total y precio unitario del material. No capturar uso previsto, unidad, precio al cliente, comprobantes ni sobrantes en este alcance; el registro no cambia automáticamente el precio acordado.
- Gastos Operativos: Categorización de gastos del negocio (fijos/recurrentes y variables), gastos de viaje, peajes y combustible vinculados opcionalmente a un trabajo.

8. FACTURAS, COBROS Y SALDOS

- Generación y emisión de facturas y recibos de pago en PDF.
- Distinción clara entre: Importe Acordado | Facturado | Cobrado | Saldo Pendiente.
- Soporte para pagos parciales, múltiples pagos por factura y distribución manual de un pago entre varias facturas.
- Regla de Anulación: Si una factura emitida es anulada (voided), la Orden de Trabajo asociada pasa a estado "Pendiente de Facturar", conservando el registro anulado en el historial.

9. UI/UX Y CAPACIDADES NATIVAS (ESCRITORIO & MÓVIL)

- Diseño Responsivo (Tailwind CSS): La interfaz debe adaptarse fluidamente desde pantallas anchas de oficina (tablas densas, calendarios completos, paneles divididos) hasta pantallas táctiles reducidas de tablets y celulares (tarjetas, botones de acción rápida, menús colapsables).
- Funcionalidades Nativas Móviles/Tablets (Tauri Plugins):
  - Cámara: Captura directa de fotografías antes/después del trabajo desde la app.
  - Firma Digital: Componente táctil en pantalla para que el cliente firme presupuestos o la recepción del trabajo.
  - Compresión de Imágenes: Optimización local antes de guardar/sincronizar (límite recomendado 5 MB).

10. REGLAS OPERATIVAS Y TÉCNICAS

- Husos Horarios y Fechas: Almacenamiento en base de datos en formato UTC. Visualización en la UI convertida siempre a la zona horaria local configurada en el workspace_id.
- Ajustes de Precio Fijo: Las reducciones o incrementos en trabajos a precio fijo se registran como un "Ajuste Explícito" con nota justificativa, sin recalcular automáticamente por horas.
- Fuera del Alcance (MVP): Sin agentes de IA autónomos, sin procesamiento de pagos con tarjeta dentro de la app, sin nómina impositiva/HR completa, sin tracking GPS en tiempo real.

11. LICENCIAMIENTO, SEGURIDAD Y DISTRIBUCIÓN

- Licencia del producto, independiente de los datos del negocio:
  - La app genera un código de activación para que el comprador lo envíe al vendedor; el vendedor emite una licencia/clave firmada vinculada a la instalación o dispositivo.
  - La activación queda offline después de instalar la licencia. No hay validación online periódica requerida.
  - Reinstalación o cambio de computadora requiere reactivación manual autorizada por el vendedor. La app nunca bloquea el acceso a los datos locales por falta de red o por estado de licencia.
  - La vinculación al dispositivo puede elevar el costo de copia, pero no se promete protección anticopia infalible ante un administrador local. Falta definir generación de identificador de dispositivo, minimización de datos y recuperación tras pérdida/cambio de hardware.
- Seguridad local y roles:
  - El dueño administra permisos de empleados/ayudantes; los códigos lockbox/gate solo se revelan a roles autorizados.
  - Diseñar protección de credenciales sensibles en reposo y en operaciones de datos antes de usar códigos reales con empleados. Enmascarar el campo de UI no basta.
- Firma de código y ofuscación:
  - Firmar instaladores para identificar al editor, verificar integridad y reducir advertencias del sistema operativo en plataformas publicadas.
  - Code signing no impide por sí solo copiar o modificar el software. Minificación/ofuscación solo añade fricción a la ingeniería inversa; no es una garantía de seguridad.
