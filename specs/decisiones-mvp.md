# Especificación: captura rápida, seguimientos, región y operación local-first

Estado: decisiones de producto confirmadas. Los detalles técnicos y de proveedores indicados como pendientes deben definirse antes de implementar.

## Captura rápida de solicitudes

### Requisitos

- Campos obligatorios para guardar: nombre del contacto, teléfono, dirección del trabajo y descripción breve.
- Fecha preferida y fotos son opcionales.
- El usuario clasifica el trabajo como cliente directo o administradora de propiedades.
- Para administradoras, datos de tenant/contacto de acceso pueden añadirse después.
- La captura y el guardado deben funcionar sin conexión.

### Criterios de aceptación

- [ ] Si falta nombre, teléfono, dirección o descripción, se impide guardar y se indica qué campo falta.
- [ ] La solicitud se guarda aunque no haya fecha, fotos o datos del tenant.
- [ ] Se conserva el tipo de cliente seleccionado.
- [ ] Guardar no convierte automáticamente la solicitud en presupuesto u orden.

## Seguimientos internos

### Requisitos

La app sugiere tareas para presupuestos enviados sin respuesta, confirmación de citas y cobro de saldos pendientes. Los plazos predeterminados se configuran por workspace y se pueden ajustar para cada tarea. Las tareas internas no envían por sí mismas mensajes externos.

### Criterios de aceptación

- [ ] Cada tipo de seguimiento puede tener plazo predeterminado configurable por workspace.
- [ ] Cambiar el vencimiento de una tarea no modifica el valor predeterminado.
- [ ] Cada tarea queda vinculada al presupuesto, cita o factura correspondiente.
- [ ] No se sugiere cobrar si el saldo de la factura es cero.
- [ ] Los mensajes al cliente solo se envían por canales configurados/autorizados por el dueño.

## Configuración regional y moneda

### Requisitos

- Cada workspace configura país, estado/provincia y una moneda principal.
- El MVP no maneja transacciones en múltiples monedas para un mismo workspace.
- Impuestos configurables y aplicados manualmente; sin cálculo fiscal automático.
- Interfaz disponible en inglés y español.

### Criterios de aceptación

- [ ] Los importes usan la moneda configurada; no se asume USD.
- [ ] Cambiar la región no convierte importes históricos automáticamente.
- [ ] Impuestos pueden registrarse/aplicarse manualmente.
- [ ] No se promete cumplimiento fiscal sin definir requisitos por jurisdicción.

## Operación local-first y backups

### Requisitos

- El MVP se usa localmente en un dispositivo; sincronización multi-dispositivo se posterga.
- Incluir backup local automático y exportación/restauración.
- La validación de licencia/usuario contra un servidor central descrita en `handyman.md` es un requisito independiente; no queda resuelta al posponer sincronización.

### Criterios de aceptación

- [ ] Funciones esenciales disponibles sin internet.
- [ ] Backups identificables y restaurables mediante flujo documentado.
- [ ] No se sobrescribe información existente durante restauración sin confirmación.
- [ ] Errores de backup se muestran claramente.
- [ ] Definir periodicidad, destino, retención, cifrado y recuperación antes de implementar.
- [ ] No añadir backup en nube o sincronización remota sin aprobar el proveedor y diseño.

## Pendientes

- Formato/validación de teléfono y UX de asociación a cliente/propiedad.
- Plazos iniciales sugeridos para cada clase de seguimiento.
- Periodicidad, ubicación, retención, cifrado y restauración de backups.
- Alcance de impuestos manuales y formatos de factura por región.
- Separación entre disponibilidad offline de datos y comprobación online de licencia.
