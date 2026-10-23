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

- Mercado e Idioma: Configurable, pudiendo seleccionar Pais, Estado o Provincia y Tipo de moneda. Interfaz en inglés y español.
- Enfoque Multiplataforma Integrado:
  - Fase 1 (Lanzamiento Principal): Aplicación de escritorio nativa ejecutable en Windows, macOS y Linux.
  - Fase 2 (Extensión Móvil): Compilación nativa para iOS y Android (celulares y tabletas) utilizando Tauri v2 y compartiendo la misma base de código frontend y lógica de negocio.
- Arquitectura de Datos (Offline-First): La app funcionará con una base de datos local SQLite. Permitirá operar sin conexión a internet y sincronizar datos cuando haya red disponible.
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

4. SOLICITUDES, PRESUPUESTOS Y ÓRDENES DE TRABAJO

- Flujo de Trabajo: el dueño registra una Orden de Trabajo a partir de una llamada o mensaje. No existe entidad ni flujo de solicitudes. Si hace falta precio previo, crea un Presupuesto vinculado a la orden. Si se acepta, la orden queda aceptada y se puede agendar; si se cancela/no aprueba, se conserva el presupuesto y se cancela la orden. Luego: Orden de Trabajo -> Factura -> Cobro. Ningún paso convierte o cancela registros automáticamente sin confirmación del usuario.
- Presupuestos: Creación desde una orden, edición, historial de versiones y exportación a PDF. Descuentos aplicados manualmente. La validez es de 15 días corridos desde el envío. Al vencer, el presupuesto queda vencido y se solicita al dueño decidir si cancela la orden o prepara/envía una nueva versión.
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

- Materiales: Registro de materiales previstos y utilizados por trabajo, costos, precios cobrados al cliente y comprobantes adjuntos. Reasignación manual de sobrantes.
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

11. MEDIDAS DE SEGURIDAD Y PROTECCIÓN CONTRA COPIA
    Para proteger el software contra copia no autorizada y manipulación:

- Autenticación y Validación de Licencia:
  - Validación de usuario/licencia vinculada al espacio de trabajo (workspace_id) y al identificador de dispositivo (Hardware ID).
  - Validación en segundo plano contra servidor central cuando exista conexión a internet, permitiendo la operación local offline continua.
- Firmado Digital (Code Signing):
  - Compilación de producciones firmadas digitalmente con certificados oficiales para Windows (.exe/.msi), macOS (.dmg) e iOS/Android.
  - Esto evita que ejecutables modificados o "crackeados" puedan ejecutarse en el sistema operativo.
- Build de Producción Ofuscado:
  - Aplicar minificación y ofuscación de código en los paquetes de producción de Tauri/React para proteger la propiedad intelectual del código fuente.
