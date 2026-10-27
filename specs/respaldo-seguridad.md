# Especificación — Respaldos locales cifrados

## Política confirmada
- Crear automáticamente como máximo un respaldo diario, al iniciar HandySystem y mientras siga abierto.
- Guardar respaldos automáticos en el directorio privado local de la app y conservar 30 días. La purga solo elimina archivos automáticos antiguos; nunca exportaciones manuales.
- Los puntos de seguridad previos a una restauración se distinguen de la copia diaria, de modo que no retrasan la creación del respaldo diario posterior.
- Los respaldos se cifran antes de escribirse. Se protege la clave mediante contraseña y una clave de recuperación generada al activar los respaldos; el secreto local se guarda en el almacén seguro del sistema operativo.
- La clave de recuperación se puede volver a consultar con la contraseña y debe guardarse fuera de la computadora. Si se pierden contraseña, clave y acceso al almacén seguro, el archivo no es recuperable.
- Las credenciales se guardan como una sola entrada del almacén seguro, se mantienen en memoria durante la sesión y las credenciales de versiones anteriores se migran una sola vez.
- Consultar estado o verificar que el respaldo diario aún no vence no debe leer el Llavero. Las acciones que necesiten cifrar/descifrar lo consultan solo cuando haga falta.
- La detección de configuración se conserva en un marcador local no secreto; si el Llavero ya no tiene las credenciales, la acción que las necesite informa el error y actualiza el estado sin tocar los respaldos.
- En macOS, “Permitir siempre” depende de la identidad firmada del ejecutable. Los binarios de desarrollo ad hoc pueden requerir autorización al recompilarse; no se debe relajar el acceso del Llavero para evitarlo.
- Exportación manual abre el diálogo nativo Guardar, escribe el archivo cifrado en la ubicación elegida y muestra la ruta confirmada. Restaurar requiere un respaldo válido, contraseña o clave de recuperación y nueva contraseña; confirma antes de reemplazar y crea un punto de restauración automático cuando el cifrado local está configurado.
- Restauración valida integridad, workspace y versión de esquema antes de reemplazar. Tras restaurar se crea una nueva clave de recuperación.

## Errores y seguridad
- Fallos del keychain, snapshot, cifrado o escritura se muestran como error; nunca se marca respaldo exitoso si falla.
- El respaldo incluye códigos de acceso pero el archivo va cifrado. No se suben archivos ni credenciales a servicios remotos.
- Los errores de restauración conservan la base actual. Respaldo local no bloquea el uso de HandySystem offline.

## Aceptación
- Respaldos diarios se generan máximo cada 24 h, quedan cifrados y retención elimina solo automáticos de más de 30 días.
- Contraseña y clave de recuperación abren el mismo archivo; clave incorrecta/archivo corrupto falla sin alterar la base.
- Exportar/recuperar en una ubicación manual; restaurar valida y confirma antes de reemplazar.
- Pruebas verifican cifrado, recuperación y archivos/datos validados antes del reemplazo.
- [x] Validar manualmente que el diálogo Guardar crea el archivo `.hsbak` en la ubicación seleccionada.
- [ ] En Tauri, activar, exportar y restaurar sin cerrar/reabrir Configuración; mostrar éxito/error junto a la acción.
- [ ] Confirmar que el estado no configurado no vuelve a consultar entradas antiguas del Llavero repetidamente.
- [ ] Medir en Tauri el número de autorizaciones durante una migración antigua y en reinicios posteriores con el mismo ejecutable.
