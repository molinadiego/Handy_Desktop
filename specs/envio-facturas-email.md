# Especificación — Envío de facturas por email

## Comportamiento confirmado
- El dueño configura el OAuth Client ID y conecta Gmail o Microsoft/Outlook/Hotmail mediante el navegador del sistema; nunca se solicita ni se almacena la contraseña normal del correo.
- Solo una factura ya emitida se puede enviar. El envío es una acción explícita y adjunta el PDF de la factura.
- Se precarga el correo del cliente/administradora guardado como snapshot de la factura; el usuario puede corregir el destinatario antes de enviar.
- Guardar el primer `sent_at` solo después de que el proveedor confirme el envío. Los reenvíos se registran pero no cambian la fecha del primer envío ni reinician el plazo de cobro.
- Los seguimientos de saldo empiezan desde ese primer envío. Emitir o imprimir la factura no implica que haya sido enviada.
- El acceso/token OAuth se guarda en el almacén seguro del sistema operativo. Client IDs de OAuth son configuración pública; tokens de acceso/refresco nunca van a SQLite ni a logs.
- No se envían mensajes automáticamente ni se bloquea la operación offline; enviar requiere conexión y acción del dueño.

## Integración
- Configuración permite registrar los Client IDs públicos de Google y Microsoft y conectar/desconectar cada cuenta desde el navegador del sistema.
- OAuth usa PKCE/loopback; access/refresh tokens se guardan juntos en el almacén seguro del sistema operativo.
- El envío usa Gmail API o Microsoft Graph; el PDF se genera localmente y se adjunta. `invoice_email_sends` conserva destinatario, proveedor, fecha y message ID cuando está disponible.
- La app no trae Client IDs de producto incluidos. El dueño debe registrar sus apps OAuth, habilitar Gmail API/los scopes de Microsoft Graph y configurar las redirect URI indicadas antes de pegar los Client IDs en Ajustes.

## Criterios de aceptación
- [x] Cuenta no conectada: el envío conduce a Ajustes para configurar/conectar el proveedor.
- [x] Envío solo desde factura emitida; adjunta PDF, permite corregir destinatario y registra envío exitoso.
- [x] Error OAuth/red/proveedor se muestra; `sent_at` no se actualiza si el proveedor rechaza el envío.
- [x] Reenvío conserva `sent_at` original y agrega un evento de envío.
- [x] Seguimiento solo para factura emitida, enviada y con saldo positivo; pago parcial actualiza saldo, liquidación/anulación quita la sugerencia.
- [x] Probar OAuth y envío/recepción con Client IDs reales y cuenta Gmail de prueba.
