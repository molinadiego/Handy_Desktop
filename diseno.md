INSTRUCCIONES DE DISEÑO UI/UX Y ESTÉTICA (UI Guidelines)
Para mantener un aspecto profesional, limpio y moderno (tipo SaaS corporativo/ERP moderno), todas las pantallas deben seguir estrictamente estas reglas de diseño:

1. Sistema de Componentes y Estilos:

- Utiliza Tailwind CSS para todo el estilizado.
- Si se requiere una librería de componentes, prioriza shadcn/ui por su estética minimalista y profesional.

2. Paleta de Colores Corporativa:

- Fondo general (background): Tonos neutros muy suaves (ej. bg-slate-50 o bg-zinc-50 para el dashboard, tarjetas en blanco bg-white con bordes sutiles border-slate-200).
- Texto principal: Slate oscuro (ej. text-slate-800 o text-slate-900) para máxima legibilidad.
- Texto secundario: Slate medio (ej. text-slate-500).
- Color de acento principal: Un color profesional (ej. Azul Indigo o Slate oscuro para la marca, evitando colores chillones).
- Estados (Badges/Píldoras de estado):
  - Pendiente / Borrador: Amarillo/Ambar suave.
  - En progreso / Asignado: Azul suave.
  - Completado / Pagado: Verde esmeralda suave.
  - Cancelado / Urgente: Rojo/Rosa suave.

3. Tipografía y Densidad de Datos:

- Tipografía limpia y moderna (sans-serif por defecto, ej. Inter o system-ui).
- Jerarquía tipográfica clara (títulos semibold o bold, subtítulos diferenciados por tamaño y color).
- Densidad equilibrada: Las tablas de datos (órdenes, clientes) deben tener celdas con suficiente espacio vertical (padding py-3 px-4) para no verse amontonadas pero permitir ver mucha información de un vistazo.

4. Estructura de Pantallas y Componentes:

- Uso consistente de tarjetas (Cards) con sombras muy sutiles (shadow-sm) y bordes limpios para agrupar información.
- Tablas con cabeceras fijas o destacadas, paginación clara y filtros bien alineados en la parte superior.
- Botones de acción principal (ej. "Nueva Orden", "Guardar") destacados con el color principal; los secundarios con borde o texto simple.
- Feedback visual obligatorio: Todo botón o acción debe tener estados :hover, :active y de carga (loading spinners) para que la app se sienta fluida y nativa.

5. Adaptabilidad (Responsive):

- En escritorio: Uso de paneles divididos, barras laterales colapsables y tablas completas.
- En móvil/tablet: Transformación a tarjetas verticales, menús inferiores o hamburguesa, y botones grandes aptos para la pulsación táctil (touch-friendly).
