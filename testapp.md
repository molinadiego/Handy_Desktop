Aquí tienes una secuencia para la prueba manual en Tauri. Usa datos ficticios. Los códigos de acceso se guardan en texto plano en la base local; no uses códigos reales en la prueba.

1.  Inicia la app

- Cierra cualquier ventana anterior y ejecuta npm run tauri dev desde HandySystem.
- Confirma que abre sin error de base de datos y que no aparecen registros operativos; la configuración del negocio debe conservarse.

2.  Configuración y personal

- Revisa idioma, moneda, ubicación y zona horaria.
- En Configuración, crea un empleado, ayudante y subcontratista; asigna colores y edita uno.
- En **Usuarios y códigos de acceso**, crea una cuenta de usuario y vincúlala a un empleado; prueba conceder/quitar permiso de códigos.
- Cierra sesión y entra con el usuario para revisar que solo tenga Órdenes de trabajo y Presupuestos.

3.  Clientes, administradoras y propiedades

- Crea un cliente directo y una administradora; vincula una propiedad a cada uno.
- Prueba crear cliente y propiedad desde el formulario de una orden.
- Comprueba filtros por tipo, correcciones de perfil y reasignación de propiedad.

4.  Órdenes de trabajo

- Crea órdenes desde una llamada ficticia: nombre y teléfono, dirección y lista de trabajos.
- Comprueba que no se guarden si faltan campos obligatorios.
- Prueba editar la lista solicitada, asignar personas a la orden para agenda y programar/cancelar como admin.
- En la sección **Tareas asignadas** de la orden, crea varias tareas y asigna tareas diferentes a empleados. Asigna una misma tarea a dos empleados para probar trabajo compartido.
- Prueba códigos de acceso únicamente con valores ficticios.

5.  Presupuestos

- Crea un presupuesto desde una orden y otro independiente.
- Como usuario, abre Presupuestos, agrega descripciones a un borrador de una orden donde tengas tarea asignada y confirma que no puedes introducir precio ni cambiar estados.
- Guarda un borrador sin importe; comprueba que no pueda enviarse hasta completarlo.
- Revisa versiones, estados, aprobación y cancelación; confirma que aceptar uno asociado no cree otra orden.
- Imprime uno y revisa idioma, moneda, descuento y que no incluya códigos de acceso.
- Para vencimiento a 15 días, usa una base de prueba con fecha de envío antigua; no cambies el reloj del sistema.

6.  Agenda y seguimientos

- Programa órdenes y revisa calendario mensual, selección de día y horas en la zona del workspace.
- Comprueba que solo haya aviso cuando dos órdenes se solapan y comparten empleado; el aviso no debe bloquear.
- Revisa plazos por defecto de 15 días, cambia uno en Configuración y ajusta uno por tarea.
- Marca un seguimiento hecho y descarta otro; confirma que no se envíen mensajes ni cambien estados automáticamente.

7.  Personal y ejecución

- Registra horas por hora, nota opcional y total; comprueba que no cambie el precio de la orden.
- Como usuario, completa una de tus tareas y cancela otra con motivo. Comprueba que fecha/hora y motivo se registren solo en tu asignación, que el compañero asignado a la misma tarea no cambie y que el estado global de la orden siga igual.
- Como admin, revisa el historial de asignaciones de la tarea y luego cambia el estado global de la orden si corresponde.
- Registra algo por trabajo y confirma que el importe del empleado sea interno y no aparezca en documentos del cliente.
- Cierra una orden directa sin precio: debe pedir un importe positivo y confirmación.
- Agrega y luego edita la lista de Trabajo realizado; confirma que la lista solicitada siga intacta.
- Registra materiales con sus cuatro campos: material, cantidad utilizada, costo total y precio unitario. Verifica que no modifiquen el importe acordado.
- Crea un trabajo adicional pendiente. No debe sumarse a la factura hasta registrar explícitamente aprobación y método.

8.  Gastos y pagos al personal

- Registra un gasto general y uno vinculado a una orden; prueba categorías como Repuestos, proveedor y comprobante.
- Registra un pago al personal general y otro aplicado a un costo “por trabajo”.
- Prueba dos pagos parciales y un intento de sobrepago; el saldo no debe quedar negativo.

9.  Facturas y cobros de clientes

- Crea un borrador desde una orden realizada; agrega impuesto manual e imprime el PDF.
- Emite la factura y registra un cobro parcial distribuido entre facturas de la misma moneda.
- Comprueba subtotal, impuesto, facturado, cobrado y saldo.
- Anula una factura con motivo: conserva su historial, libera los pagos aplicados y vuelve a ofrecer la orden para facturar.
- Crea la factura de reemplazo y reasigna manualmente el saldo liberado.

10. Informes

- Prueba los informes de órdenes, presupuestos, facturas/cobros, gastos y pagos al personal.
- Filtra fechas, estados/categorías y tipo de cliente; comprueba los límites inclusivos y la zona horaria local.
- Verifica que los totales se separen por moneda y que imprimir conserve los filtros.

11. Sin conexión y respaldos

- Desconecta Internet y prueba registrar datos locales; vuelve a conectar y reinicia para comprobar persistencia.
- En Configuración → Respaldos, crea la contraseña y guarda la clave de recuperación fuera de la computadora.
- Exporta un respaldo cifrado; prueba que una contraseña incorrecta no reemplace datos.
- Para probar una restauración válida, exporta primero un respaldo con datos ficticios, crea luego un registro “canario” y restaura el archivo. El canario debe desaparecer y los datos del respaldo volver.
- No hace falta esperar 30 días para comprobar retención; esa regla requiere una prueba automatizada o prolongada.
