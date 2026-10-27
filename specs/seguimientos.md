# Especificación — Tareas de seguimiento

## Alcance y comportamiento
- El usuario configura por workspace los plazos (en días) para dar seguimiento a presupuestos enviados, confirmar visitas programadas y cobrar saldos. Si no se configuran, los plazos usan 15 días corridos.
- Se genera una sugerencia para cada presupuesto `sent` con fecha de envío, cada orden `scheduled` con fecha/hora programada y cada factura `issued` con fecha de emisión y saldo mayor que cero.
- El seguimiento de cobro vence según `issued_at` + el plazo de cobro configurado. Muestra referencia de factura y saldo actual.
- Al pagarse totalmente o anularse la factura, la sugerencia desaparece; los pagos parciales conservan la sugerencia mientras siga habiendo saldo.
- El vencimiento sugerido se deriva del plazo configurado; el usuario puede ajustarlo por tarea. Vencimientos se guardan en UTC y se muestran en la zona horaria del workspace.
- En la pantalla Seguimientos, el usuario puede marcar una tarea como hecha o descartarla. No se envía correo/SMS/WhatsApp ni se cambia el estado de presupuesto/orden automáticamente.

## Errores, permisos y offline
- Funciona localmente sin conexión; solo el usuario local actual administra tareas.
- Plazo configurable: entero de 1 a 365 días; campo vacío vuelve al default de 15 días.
- Una tarea solo se puede cambiar mientras su presupuesto siga `sent`, la orden siga `scheduled` o la factura siga `issued` con saldo. Al cambiar la entidad o quedar pagada/anulada, deja de aparecer como sugerencia.
- Ajustar fecha requiere una fecha local válida y se almacena en UTC. Estados completos/descartados persisten.

## Criterios de aceptación
- Configuración de plazos por workspace persiste al reiniciar; plazo sin configurar usa 15 días corridos.
- Se sugieren seguimientos según envío/programación y duración configurada; se distingue lo vencido.
- Se puede cambiar vencimiento, completar o descartar una sugerencia por tarea.
- El saldo pagado o una factura anulada no genera seguimiento; una factura con pago parcial sí.
- [x] La sugerencia de cobro usa `issued_at` + plazo configurable y expone referencia y saldo actual.
- [x] Solo facturas emitidas con saldo positivo generan la sugerencia; al pagarse o anularse desaparece.
- [x] Completar/descartar y cambiar vencimiento valida que la factura siga emitida y con saldo, dentro del workspace.
- [x] La migración amplía los tipos de tarea y conserva los overrides anteriores.
- [ ] Validar manualmente en Tauri que el seguimiento abre Facturación y refleja pagos parciales/completos.
- No se envía comunicación externa ni se alteran estados/importes del registro fuente.
- Pruebas cubren cálculo de plazos, tarea anulada y cambios de horario UTC.
