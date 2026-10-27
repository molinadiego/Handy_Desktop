# Especificación — Agenda de órdenes

## Alcance
- Nueva vista Agenda con calendario mensual y listado diario, desde una orden de trabajo existente.
- Mostrar órdenes con fecha/hora de inicio, fin, destinatario/contacto, dirección y estado; usar la zona horaria configurada del workspace.
- El listado diario muestra órdenes activas programadas para ese día. Órdenes completadas/canceladas no ocupan la agenda.
- Navegación entre meses y selección de día; botón para volver a hoy. El acceso de una cita abre el editor de la orden existente.
- Directorio local de empleados con nombre y color elegido de paleta accesible; no se eliminan empleados para preservar su historia. No se crean cuentas de usuario ni roles.
- Se pueden asignar cero o varios empleados a una orden; la asignación se conserva al editar/programar.
- Detectar solapamientos entre órdenes activas solo cuando comparten al menos un empleado y las fechas se solapan; aviso visible pero no bloqueante. Órdenes sin asignación no producen conflicto.
- No crear, mover ni cambiar estados directamente desde el calendario; editar/programar conserva validaciones y consentimiento existentes.

## Errores, permisos y offline
- Agenda de solo lectura salvo abrir editor de la orden; mismos permisos locales existentes (sin roles/auth).
- La configuración del directorio está disponible localmente; no implica cuentas ni permisos de acceso para empleados.
- Datos leídos de SQLite local; funciona sin red.
- Intervalo inválido/incompleto no genera conflicto y no se coloca como evento válido; sigue visible en Órdenes para corregir.

## Aceptación
- Agenda aparece en navegación escritorio/móvil y ofrece mes y día/lista.
- Fechas agrupadas según zona IANA del workspace, conservando UTC en SQLite.
- Solapamientos marcados en ambas órdenes, comparación inicio < otro fin y otro inicio < fin; tocar extremos no es solapamiento.
- Orden permite elegir varios empleados; calendario distingue responsables por color y alerta solo conflictos con responsables compartidos.
- Cambios de nombre/color no eliminan asignaciones históricas; todos los datos quedan aislados por workspace.
- Se puede abrir y editar cada orden desde el evento.
- Pruebas unitarias cubren horarios, extremos contiguos, estados terminales y conversión de fecha local.
