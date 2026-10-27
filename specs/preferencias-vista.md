# Especificación — Preferencias de vista

## Comportamiento

- Configuración permite elegir `Lista` o `Tarjetas` independientemente para Clientes, Propiedades, Órdenes de Trabajo y Presupuestos.
- Cada pantalla usa su preferencia guardada por workspace al abrir y cambiar de vista.
- Las cuatro pantallas ofrecen filtro independiente Todos/Cliente directo/Administradora; Propiedades usa su relación vigente para clasificar.
- Valores por defecto conservan la interfaz existente: Clientes lista, Propiedades tarjetas, Órdenes tarjetas y Presupuestos lista.
- Guardar preferencias es local-first; no afecta datos ni snapshots.
- La interfaz lista y tarjetas debe seguir siendo responsive y conservar las mismas acciones y filtros.

## Criterios de aceptación

- [x] Las cuatro preferencias se guardan y leen desde SQLite por workspace.
- [x] Cambiar un modo no altera las demás pantallas.
- [x] Filtrar clientes, propiedades, órdenes y presupuestos por tipo sin mezclar categorías.
- [x] Lista/tarjetas muestran los mismos registros y acciones para cada módulo.
- [ ] Validar manualmente preferencias, persistencia tras reiniciar y responsive en Tauri.
