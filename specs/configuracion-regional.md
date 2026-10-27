# Especificación — Configuración regional del negocio

## Comportamiento

- Configuración permite definir país mediante código ISO alfa-2, estado/provincia, ciudad y zona horaria IANA.
- Los campos de subdivisión/ciudad son texto libre para no imponer un catálogo o jurisdicción única.
- Zona horaria inicia en `UTC`, se valida con la base IANA de `Intl` y se usa para mostrar/editar las citas.
- Persistir timestamps de trabajo en UTC; convertir entre UTC y hora local del workspace únicamente al presentar/editar.
- Cambiar la zona horaria no reescribe timestamps históricos; solo cambia su representación.
- Guardar localmente en SQLite, sin depender de red.

## Validaciones y errores

- País vacío se permite; si se ingresa, debe ser código de dos letras.
- Zona horaria no vacía y válida; indicar ejemplos como `America/Chicago`.
- Rechazar y conservar la configuración previa si la zona no es válida.
- Si una hora local cae en una brecha por cambio horario, explicar que esa hora no existe y pedir otra.

## Aceptación

- [x] Guardar país/estado/ciudad/zona horaria desde Configuración.
- [x] Leer la configuración guardada localmente al abrir la app.
- [x] Mostrar y editar citas usando la zona del workspace, manteniendo UTC en SQLite.
- [x] Probar conversión UTC/local, incluida validación de hora inexistente por cambio DST.
- [ ] Validar visualmente selección y persistencia en la ventana Tauri.
