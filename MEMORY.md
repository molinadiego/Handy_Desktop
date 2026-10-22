# Memoria del proyecto

## Producto

- Aplicación comercial para administrar negocios de handyman, con país, estado/provincia y moneda configurables; interfaz en inglés y español.
- La especificación funcional está en `handyman.md`; las pautas visuales están en `diseno.md`.
- MVP offline-first con SQLite local y aislamiento lógico por `workspace_id`.
- Primera entrega para escritorio (Windows, macOS y Linux); móvil (iOS/Android) es una fase posterior, compartiendo código cuando sea viable con Tauri v2.

## Decisiones confirmadas por la especificación

- Stack confirmado: Tauri v2, React, TypeScript, Tailwind CSS y SQLite. El usuario eligió React con TypeScript.
- Los pagos de clientes se registran como pagos externos; no se procesan dentro de la app en el MVP.
- Las transiciones entre solicitud, presupuesto, orden, factura y cobro requieren confirmación explícita.
- El historial financiero es inmutable en el sentido operativo: correcciones mediante anulación o ajuste con historial, no borrado silencioso.
- Timestamps en UTC y presentación con la zona horaria del workspace.
- UI SaaS/ERP sobria, responsive y adaptada a escritorio y táctil, conforme a `diseno.md`.
- Los recordatorios por email, SMS y/o WhatsApp son configurables por el dueño; proveedor(es) aún pendientes.
- Captura rápida: requiere nombre y teléfono del contacto, dirección del trabajo y descripción breve; fecha/fotos opcionales. Se clasifica como cliente directo o administradora; datos del tenant opcionales inicialmente.
- Seguimientos sugeridos: presupuesto sin respuesta, confirmación de cita y cobro de saldo. Cada workspace configura plazos predeterminados, editables por tarea.
- Cada workspace tiene una moneda principal en el MVP; los impuestos se configuran y aplican manualmente, sin cálculo fiscal automático.
- MVP local-first: sin sincronización multi-dispositivo al lanzamiento. Incluir backup local automático y exportación/restauración. La validación central de licencia que figura en `handyman.md` es un requisito separado y sigue pendiente de diseño.

## Decisiones pendientes: no asumir

- Backend/servicio central, identidad y diseño de validación de licenciamiento.
- Sincronización multi-dispositivo futura y resolución de conflictos (fuera del MVP); ubicación, retención, cifrado y restauración de backups automáticos.
- Modelo exacto de roles/permisos, recuperación de cuenta y gestión de secretos locales.
- Proveedores de email, SMS/WhatsApp, almacenamiento de adjuntos y generación de enlaces seguros.
- Reglas fiscales/contables, numeración de facturas y retención documental por jurisdicción.
- Formatos de exportación, idiomas iniciales de cada documento y requisitos de firma electrónica.
- Plataformas prioritarias de publicación móvil y certificados/cuentas de distribución.

## Método de desarrollo

- Por el alcance y las reglas financieras, conviene trabajar módulo a módulo con especificaciones y criterios de aceptación antes de implementar.
- No se ha creado una skill de proyecto ni configurado MCP: no hay todavía una necesidad recurrente confirmada ni un servicio externo seleccionado.

## Estado de implementación

- Scaffold React/TypeScript/Tauri inicial en `HandySystem/`; Tailwind y plugin SQL para SQLite configurados.
- Primera UI de alta/listado de clientes, propiedades y solicitudes; migración local y validación de captura rápida añadidas.
- `npm run test` y `npm run build` pasan en el frontend. La compilación/ejecución nativa aún no fue verificada porque el entorno no tiene Rust/Cargo.
