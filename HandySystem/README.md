# HandySystem Desktop

Aplicación offline-first para administrar clientes, propiedades y órdenes de trabajo. Stack: Tauri v2, React, TypeScript, Tailwind CSS y SQLite.

## Requisitos

- Node.js y npm.
- Rust estable y Cargo (requeridos para compilar/ejecutar Tauri; Rust 1.90 o posterior para el plugin SQL actual).
- Prerrequisitos del sistema operativo para Tauri: https://v2.tauri.app/start/prerequisites/

## Desarrollo

```sh
npm install
npm run dev        # vista frontend (sin persistencia SQLite)
npm run tauri dev  # app nativa con SQLite local
```

## Validaciones

```sh
npm run test
npm run build
```

La base `handyman.db` se crea en el directorio de configuración de la aplicación y se migra desde `src-tauri/migrations`. Todas las filas de negocio se filtran por el workspace local. La vista de navegador es solo una preview; el guardado requiere ejecutar la aplicación Tauri.

## Estructura

- `src/`: interfaz React y capa de acceso a datos.
- `src/lib/`: modelos, validación y acceso SQLite.
- `src-tauri/`: shell nativo y migraciones de SQLite.
- `../specs/`: especificaciones funcionales del producto.
