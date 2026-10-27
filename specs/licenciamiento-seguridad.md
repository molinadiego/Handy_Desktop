# Especificación pendiente — Licencia y seguridad local

Estado: decisiones de producto confirmadas parcialmente; no implementar validación de servidor, roles ni almacenamiento seguro hasta cerrar los puntos pendientes de abajo.

## Decisiones confirmadas

- El comprador instala la app, obtiene un código de activación, se lo envía al vendedor y recibe una licencia/clave firmada.
- La licencia se vincula a la instalación/dispositivo. Cambio o reinstalación requiere reactivación manual autorizada por el vendedor.
- Tras activar, la app opera offline sin validación online periódica. La licencia nunca bloquea acceso a datos locales.
- Code signing se usa para identificar editor/integridad del binario y reducir advertencias del sistema operativo; no se promete que impida copias/cracking.
- Minificación/ofuscación solo dificulta un poco la ingeniería inversa; no es una frontera de seguridad.
- Respaldos locales confirmados: máximo uno diario, retención automática de 30 días, archivo cifrado con contraseña y clave de recuperación offline; la contraseña/clave local se guardan en el almacén seguro del sistema operativo. Exportaciones manuales no se purgan automáticamente.
- Acceso confirmado para fase actual: solo el dueño opera la app; la política futura permite al dueño y al personal asignado ver códigos de su orden, pero no se habilitará acceso a empleados sin inicio de sesión y autorización real.

## Especificación mínima pendiente antes de implementar

- Cómo generar un identificador de dispositivo estable, minimizado y con tratamiento claro de privacidad; qué cambios de hardware obligan a reactivar.
- Formato de licencia firmado, algoritmo/verificador, custodia offline de la clave privada del vendedor, importación/revocación y respuesta si el archivo de licencia se pierde.
- Política de una o varias instalaciones por licencia y procedimiento de transferencia/reinstalación.
- Matriz de roles mínima (dueño, empleado/ayudante), autorización validada en backend/dominio y operaciones permitidas para ver/editar códigos de acceso.
- Decisión del dueño: lockbox/gate codes permanecen en texto plano en SQLite por ahora. Esto no protege contra acceso directo al archivo/base local; los archivos de backup sí están cifrados.
- Flujo de recuperación que no haga perder datos locales por licencia inválida o por cambio de equipo.

## Decisión confirmada: visibilidad de códigos de acceso

### Alcance y comportamiento

- Los códigos permanecen en texto plano en SQLite, sin cifrado local de campo por ahora. El dueño acepta que esto no los protege si alguien accede directamente al archivo o a la cuenta del sistema operativo.
- Solo un admin autenticado puede verlos inicialmente. El admin puede conceder explícitamente a un usuario permiso para verlos; ningún usuario lo recibe por defecto.
- La autenticación y autorización deben verificarse en la capa Rust/datos en cada lectura; ocultar controles en React no basta. Sin sesión válida o permiso, la lectura debe denegarse.
- Los códigos se excluyen de PDFs, emails, reportes, documentos para clientes, logs y errores. La UI puede enmascararlos y revelarlos tras acción explícita solo si sesión y permiso lo autorizan.
- Login local, creación de cuentas user y concesión/revocación de permiso implementados en la app. La lectura de códigos se sirve mediante comando Rust con autorización y se omite de la consulta normal de órdenes. El plugin SQL sigue habilitado para el frontend por el resto de la app; por tanto, endurecer el acceso contra ejecución arbitraria desde WebView/devtools aún requiere retirar o acotar esa capacidad. La base activa sigue en texto plano.

### Respaldos

- Se conserva el cifrado actual del archivo completo de backup. Los códigos van en texto plano dentro de la base incluida; el cifrado del backup no cifra la base activa.

### Criterios de aceptación para implementar login y permisos

- [ ] El acceso estándar de la app a códigos requiere sesión y permiso validados en Rust; falta restringir el acceso SQL genérico del WebView para cerrar rutas de lectura arbitraria.
- [x] El admin puede conceder y revocar permiso de lectura por usuario; no se concede por defecto.
- [x] El comando de lectura de códigos deniega sesiones sin permiso y no incluye valores en errores/logs.
- [ ] PDFs, documentos al cliente, reportes, logs y errores no contienen códigos.
- [ ] Documentación explica que los códigos se guardan en texto plano en la base activa y que el backup cifrado solo protege el archivo exportado.
- [x] Primer inicio permite crear una cuenta admin local; posteriores inicios muestran login. Contraseña de al menos 12 caracteres almacenada como hash Argon2id; sesión en memoria y cierre de sesión explícito.
- [x] Admin crea cuentas locales con permiso de códigos denegado por defecto; puede conceder/revocar permiso.

## Alcance de cuentas de usuario operativo (confirmado; implementado, validación manual pendiente)

- Cada cuenta `user` se vincula a un empleado/ayudante/subcontratista existente del workspace. Sin vínculo, no ve órdenes ni presupuestos.
- Menú de usuario: únicamente Órdenes de trabajo y Presupuestos. El admin conserva el acceso completo.
- Órdenes visibles: solo las que tengan tareas asignadas al empleado vinculado. Los presupuestos vinculados a esas órdenes son visibles; presupuestos independientes quedan solo para admin.
- En órdenes, el usuario no puede editar datos, tareas, asignaciones, agenda, códigos ni finanzas. Solo puede marcar realizada o cancelar su asignación de tarea (motivo obligatorio para cancelar; fecha/hora UTC automática), sin cambiar la tarea compartida ni la orden global. El admin controla estados globales.
- En presupuestos, el usuario puede crear/actualizar borradores asociados a sus órdenes con descripciones de los trabajos requeridos y sin importe. No define precios/descuentos, no envía/acepta/cancela ni cambia estados comerciales. El admin completa y gestiona el precio/flujo.
- La autorización no se resuelve solo ocultando menús: comandos de lectura y mutación deben comprobar sesión, vínculo de empleado, asignación, rol y alcance permitido.
- Los registros financieros y las transiciones comerciales existentes no se alteran; las fechas de completado/cancelación se guardan en UTC y se muestran en la zona horaria del workspace.

### Criterios de aceptación

- [x] Una cuenta user debe estar vinculada a empleado; su lista solo muestra órdenes con tareas asignadas y presupuestos de esas órdenes.
- [ ] El usuario no ve módulos ni datos de administración/finanzas.
- [x] La única mutación operativa permitida a user es completar/cancelar su asignación de tarea; cancelar exige motivo; timestamps los fija el backend y el estado global de la orden no cambia.
- [x] Usuario no asignado, sin sesión o con intento de editar otros campos/transiciones comerciales es rechazado en Rust.
- [x] El usuario puede ingresar descripciones a borradores de sus órdenes sin establecer importe ni descuento; el admin conserva el control comercial del presupuesto.
- [x] Admin mantiene capacidades actuales y gestiona las tareas/asignaciones.
- [ ] Validar manualmente flujos parciales y tareas compartidas en Tauri.

## Criterios de aceptación para la futura implementación

- [ ] Activación offline verifica una firma con una clave pública incorporada; la clave privada del vendedor nunca se distribuye con la app.
- [ ] Una licencia para otra instalación se rechaza sin borrar ni bloquear datos locales.
- [ ] La reactivación manual permite transferir/reinstalar conforme a la política aprobada y deja auditoría.
- [ ] Usuarios sin permiso no pueden consultar códigos sensibles mediante UI ni llamadas de datos.
- [x] Los respaldos exportados/automáticos están cifrados y pueden restaurarse con contraseña o clave de recuperación.
- [ ] La política de visibilidad de códigos se cumple mediante login y permisos reales; cifrado local de campo no está incluido por decisión del dueño.
- [ ] Los binarios de producción están firmados; documentación no presenta la firma como sistema anticopia.
- [ ] El flujo de instalación/activación y recuperación se prueba en Windows/macOS/Linux.
