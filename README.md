# Oasis — Facturas & Cotizaciones (100% local)

App web **mobile-first** (iPad/celular) hecha con **HTML + CSS + JavaScript puro**, sin dependencias externas. Crea **Facturas (FAC)** y **Cotizaciones (COT)** con **historial** y **reportes**, guardando **todo en `localStorage`**. Optimizada para **imprimir/guardar PDF** usando `window.print()`.

> **Privacidad:** todos los datos (configuración, catálogo, documentos y PIN) permanecen **en tu dispositivo**. No hay servidor.

---

## Tabla de contenidos
- [Características](#características)
- [Estructura del proyecto](#estructura-del-proyecto)
- [Instalación local](#instalación-local)
- [Uso](#uso)
- [Reportes](#reportes)
- [Estructura de datos](#estructura-de-datos)
- [Reset / Borrar datos](#reset--borrar-datos)
- [Notas de privacidad y legales](#notas-de-privacidad-y-legales)
- [Publicar en GitHub Pages](#publicar-en-github-pages)
- [Troubleshooting](#troubleshooting)

---

## Características

- **Login con PIN (sin demo):**
  - Primer inicio: solicita crear PIN.
  - Ingresos posteriores: pide PIN.
  - Cambiar PIN desde **Config** (usa hash SHA-256 en `localStorage`).

- **Numeración independiente por tipo:**
  - Prefijos editables (p. ej. `FAC-`, `COT-`).
  - Consecutivos autoincrementales por tipo.
  - Puedes **editar el número** antes de guardar y **re-emitir** número.

- **Catálogo de artículos/servicios:**
  - CRUD (nombre, descripción, precio).
  - **Quick-add** para llevar ítems al documento y recalcular en vivo.

- **Logo del negocio:**
  - Subir PNG/JPG, se guarda en base64 en `localStorage`.
  - Aparece en la vista del header y en PDFs.

- **Cálculos y totales:**
  - Subtotal, descuento %, IVU % (Puerto Rico) y total.
  - Moneda configurable (por defecto **USD**).

- **Historial:**
  - Guarda: id, tipo, número, fecha, cliente, líneas, totales (se recalculan), notas y **estado** (`borrador`/`final`/`anulado`).
  - Buscar por cliente/número.
  - Abrir, duplicar, anular, exportar PDF.

- **Exportación:**
  - **PDF** al guardar en **final** (se abre plantilla optimizada para impresión / “Guardar como PDF”).
  - **Reportes** por rango de fechas o mes:
    - **CSV** (descarga).
    - **PDF** (plantilla de impresión).

- **UI/UX móvil:**
  - Modo **oscuro** por defecto.
  - Inputs grandes, `inputmode="numeric"` donde aplica.
  - Sin scroll horizontal, accesible y táctil.

- **Sin dependencias externas.**

---

## Estructura del proyecto

