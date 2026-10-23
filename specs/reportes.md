# Especificación — Reportes operativos y financieros

Estado: alcance de producto acordado; implementar después de que órdenes, presupuestos y facturas tengan sus estados y fechas definidos.

Los catálogos de estados acordados están en `specs/estados-flujos.md`; los reportes deben consumir esos estados, no duplicarlos.

## Tipos de reportes

### Trabajos / órdenes

- Incluir selector por cualquiera de los estados existentes: pendiente, programado, en curso, realizado y cancelado. El filtro permite Todos o uno/varios estados.
- Permitir todos los clientes o elegir un cliente/administradora específico.
- Rango de fechas con fecha relativa al estado:
  - Pendiente/en curso: fecha programada.
  - Realizado: fecha de finalización.
  - Cancelado: fecha de cancelación.
- Definir qué hacer con elementos que no tengan la fecha correspondiente antes de implementar el filtro.

### Facturas

- Fecha del reporte: fecha de creación/emisión registrada para la factura.
- Permitir filtrar por cualquier estado definido en el flujo de factura, incluidos pagadas y no pagadas.
- Filtro de cliente/administradora y rango desde/hasta.
- Mostrar importe facturado, cobrado y saldo pendiente según las reglas financieras.

### Presupuestos

- Permitir elegir la fecha de creación o envío como base del rango.
- Permitir filtrar por cualquier estado definido en el flujo de presupuesto.
- Filtro de cliente/administradora y rango desde/hasta.

## Salida e email

- Mostrar resultados en una vista clara, con filtros activos, totales pertinentes y tabla imprimible.
- Generar PDF e imprimir mediante el diálogo del sistema operativo.
- Enviar el reporte PDF desde la app a una o más direcciones con confirmación del usuario y feedback del resultado.
- El dueño configura su proveedor/remitente. Soportar OAuth para Gmail y Microsoft/Outlook/Hotmail, y SMTP genérico para proveedores compatibles.
- Guardar credenciales/tokens en el almacén seguro del sistema operativo; no guardar contraseñas en texto plano ni en la base SQLite.
- Interfaz y PDF en inglés y español.

## Criterios de aceptación

- [ ] Los selectores exponen todos los estados realmente definidos para cada entidad, sin omitir estados nuevos.
- [ ] Se puede seleccionar Todos o uno/varios estados.
- [ ] Los límites de fechas, el cliente/administradora y los estados combinan correctamente.
- [ ] Cada tipo de entidad usa la fecha acordada; los trabajos eligen fecha según estado.
- [ ] La vista de impresión/PDF refleja el filtro aplicado y los datos agregados del conjunto filtrado.
- [ ] Enviar email requiere confirmación, adjunta el PDF correcto y muestra éxito/error.
- [ ] Credenciales y tokens no aparecen en SQLite, logs ni documentos exportados.

## Pendientes técnicos

- Definir los estados completos de presupuestos, órdenes y facturas en las especificaciones de cada módulo; los reportes consumen esos catálogos, no una lista duplicada.
- Definir comportamiento del rango si falta fecha programada/finalización/cancelación.
- Verificar flujos OAuth de Google/Microsoft y compatibilidad/seguridad de SMTP genérico; decidir qué proveedores entran en el primer lanzamiento.
- Determinar los totales/columnas específicos de cada reporte.
