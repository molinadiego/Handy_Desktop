# Memoria del proyecto

## Producto

- Aplicación comercial para administrar negocios de handyman, con país, estado/provincia y moneda configurables; interfaz en inglés y español.
- La especificación funcional está en `handyman.md`; las pautas visuales están en `diseno.md`.
- MVP offline-first con SQLite local y aislamiento lógico por `workspace_id`.
- Primera entrega para escritorio (Windows, macOS y Linux); móvil (iOS/Android) es una fase posterior, compartiendo código cuando sea viable con Tauri v2.

## Decisiones confirmadas por la especificación

- Stack confirmado: Tauri v2, React, TypeScript, Tailwind CSS y SQLite. El usuario eligió React con TypeScript.
- Los pagos de clientes se registran como pagos externos; no se procesan dentro de la app en el MVP.
- Las transiciones entre presupuesto, orden, factura y cobro requieren confirmación explícita.
- Flujo confirmado: la orden puede ser el registro inicial o se puede capturar un presupuesto independiente; no existe entidad de solicitud. Cambiar estado de un presupuesto sin orden crea y vincula una orden. Enviado deja orden pendiente de aprobación; aceptado permite programar; cancelado cancela la orden conservando historial. Vence 15 días corridos desde envío y pide decisión del dueño.
- Órdenes guardan inicio/fin de ventana de visita (4 horas habitual pero editable); lockbox y gate code son opcionales, sensibles y no se incluyen en documentos para clientes.
- Flujo order-first implementado con migraciones v6-v8: órdenes independientes, presupuestos vinculados y transiciones enviando/aceptando/cancelando. Vencimiento de 15 días se marca al consultar presupuestos y deja la orden pendiente de decisión. La base local eliminó la tabla `requests` y sus referencias preservando el presupuesto histórico y las órdenes.
- El historial financiero es inmutable en el sentido operativo: correcciones mediante anulación o ajuste con historial, no borrado silencioso.
- Timestamps en UTC y presentación con la zona horaria del workspace.
- UI SaaS/ERP sobria, responsive y adaptada a escritorio y táctil, conforme a `diseno.md`.
- Los recordatorios por email, SMS y/o WhatsApp son configurables por el dueño; proveedor(es) aún pendientes.
- Captura rápida: requiere nombre y teléfono del contacto, dirección del trabajo y descripción breve; fecha/fotos opcionales. Se clasifica como cliente directo o administradora; datos del tenant opcionales inicialmente.
- Seguimientos sugeridos: presupuesto sin respuesta, confirmación de cita y cobro de saldo. Cada workspace configura plazos predeterminados, editables por tarea.
- Cada workspace tiene una moneda principal en el MVP; los impuestos se configuran y aplican manualmente, sin cálculo fiscal automático.
- MVP local-first: sin sincronización multidispositivo al lanzamiento. Incluir backup local automático y exportación/restauración. La licencia se activa con clave firmada y reactivación manual; no requiere validación online periódica.

## Decisiones pendientes: no asumir

- Detalle de huella/ID de dispositivo, custodia de clave de firma, formato de licencia y recuperación ante pérdida/cambio de hardware.
- Decisión confirmada: lockbox/gate codes permanecen en texto plano por ahora; admin autenticado los ve inicialmente y concede permiso explícito por usuario. Texto plano en SQLite no protege contra acceso directo al archivo; backups cifrados.
- Login local y gestión inicial implementados: migración 0033, bootstrap admin, cuentas user, hash Argon2id (mínimo 12), login/logout en memoria, permiso de códigos deny-by-default y concesión/revocación por admin. Consulta normal omite códigos; lectura autorizada pasa por Rust. Aún está habilitado SQL plugin genérico en WebView, pendiente endurecer contra lectura arbitraria; SQLite mantiene códigos en texto plano.
- Decisión confirmada: usuarios operativos vinculados a empleado solo ven órdenes con tareas asignadas; tareas pueden compartirse. Completar/cancelar registra estado, fecha UTC y motivo solo en la asignación individual, nunca cambia la orden global; admin crea/reasigna tareas y conserva historial. Usuarios ingresan descripciones a borradores sin importe. Migración 0035 y lógica implementadas; falta validar manualmente en Tauri. Asignaciones generales previas de orden no se convierten automáticamente en tareas.
- Confirmar si una instalación puede tener varios workspaces; implementación actual usa `local-workspace` fijo.
- Sincronización multi-dispositivo futura y resolución de conflictos (fuera del MVP); ubicación, retención, cifrado y restauración de backups automáticos.
- Proveedores de email, SMS/WhatsApp, almacenamiento de adjuntos y generación de enlaces seguros.
- Reglas fiscales/contables, numeración de facturas y retención documental por jurisdicción.
- Formatos de exportación, idiomas iniciales de cada documento y requisitos de firma electrónica.
- Plataformas prioritarias de publicación móvil y certificados/cuentas de distribución.

## Método de desarrollo

- Por el alcance y las reglas financieras, conviene trabajar módulo a módulo con especificaciones y criterios de aceptación antes de implementar.
- No se ha creado una skill de proyecto ni configurado MCP: no hay todavía una necesidad recurrente confirmada ni un servicio externo seleccionado.

## Estado de implementación

- Scaffold React/TypeScript/Tauri inicial en `HandySystem/`; Tailwind y plugin SQL para SQLite configurados.
- UI local de clientes, propiedades y órdenes directas; módulo/tabla de solicitudes retirados definitivamente.
- `npm run test`, `npm run build`, `cargo test` y formato Rust pasan. La base local `~/Library/Application Support/com.handysystem.desktop/handyman.db` aplicó la migración v8; el objeto `requests` ya no existe y presupuestos/órdenes se conservaron.
- El usuario validó manualmente los iconos sin superposición, el selector buscable en Nueva propiedad, la alta inline de administradora/propiedad y la cancelación sin registros parciales.
- La UI ya permite editar perfiles de clientes/administradoras y propiedades para corregir errores; se conserva el tipo de cliente y no se reescriben snapshots históricos. Falta prueba manual de edición/persistencia.
- Las correcciones de perfiles ofrecen vista previa de órdenes vinculadas, selección individual y actualización transaccional auditada de snapshots.
- Reportes acordados para trabajos, presupuestos y facturas: filtrar por todos los estados, cliente/administradora y rango de fechas; imprimir PDF o enviar desde la app. Fechas: trabajos por fecha programada/finalizada/cancelada según estado; facturas por creación; presupuestos por creación o envío.
- Email de reportes: remitente configurable por el dueño, objetivo OAuth Gmail/Microsoft y SMTP genérico; credenciales en almacén seguro del SO. Implementación pendiente.
- Estados acordados: órdenes (pendiente, pendiente de aprobación, aceptada, programada, en curso, realizada, cancelada); presupuestos (borrador, enviado, aceptado, vencido, cancelado); facturas separan ciclo (borrador, emitida, anulada) de pago (no pagada, parcial, pagada). El flujo pasa pruebas automáticas; falta prueba manual en Tauri.
- Presupuestos: implementación local con importe global, descuento manual por importe/porcentaje, moneda de workspace requerida, versiones, estados y PDF/impresión; tests backend y frontend pasan, falta validación manual en la app Tauri.
- Idioma y moneda del workspace se configuran desde Configuración. La moneda se puede cambiar cuando el dueño quiera; documentos existentes guardan su propia moneda y no se convierten.
- Configuración regional del workspace incluye país (código ISO), estado/provincia, ciudad y zona horaria IANA, vía migración v9. Las citas se guardan en UTC y se muestran/editan usando esa zona.
- Configuración permite elegir Lista/Tarjetas por separado en Clientes, Propiedades, Órdenes y Presupuestos; preferencias persistidas por workspace en SQLite (migración v11).
- Las cuatro pantallas filtran por Todos/Cliente directo/Administradora; propiedades se clasifican por su relación vigente.
- Órdenes: alta directa, datos de contacto y dirección, presupuesto opcional vinculado, agenda inicio/fin, modalidad, prioridad, instrucciones, lockbox y gate code. Falta validación manual y módulos de empleados/materiales.
- El formulario de orden permite buscar y vincular clientes/administradoras y propiedades existentes; permite preparar nuevos registros inline, guardados junto con la orden en una transacción. La prueba Rust valida asociación manager/property y rollback ante fallo.
- La edición de propiedad permite reasignar explícitamente a otro cliente/administradora; cierra la relación anterior, crea la nueva con su tipo, audita el cambio y preserva snapshots de órdenes anteriores.
- Cambiar el estado de un presupuesto sin orden asociada crea y vincula una orden con estado correspondiente; aprobar abre el formulario para programar la visita.
- Las órdenes sin presupuesto pueden finalizarse directamente desde un estado activo. Si tienen presupuesto, se bloquean programación/finalización hasta que la versión vigente esté aprobada; la finalización directa no inventa hora de inicio.
