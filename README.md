# 💼 Oasis — Facturación y Cotizaciones

Aplicación web **mobile-first** para crear **facturas y cotizaciones**, con historial local y sincronización automática en **Firebase Firestore**.

---

## 🚀 Características principales

- 🔐 **Login por PIN** (sin usuario ni contraseña, todo local).
- 🧾 **Creación de facturas y cotizaciones** con numeración independiente.
- 💾 **Guardado offline** con `localStorage`.
- ☁️ **Sincronización en la nube** con Firebase Firestore.
- 💳 **Métodos de pago**: Efectivo, Cheque, ATH, ATH Móvil, PayPal.
- 📦 **Catálogo editable** con precios y fotos.
- 📈 **Reportes** por rango o mes (CSV / PDF).
- 🖨️ **Exportación a PDF** optimizada para impresión.
- 🌓 **Tema claro corporativo** (blanco + dorado + azul marino).
- 📱 **PWA instalable** (funciona sin conexión).

---

## ⚙️ Instalación local

1. Clona o descarga este repositorio.  
2. Abre `index.html` directamente en tu navegador.  
3. Al primer inicio, crea tu PIN de acceso.  
4. Para usar Firebase, habilita tu base Firestore (ya configurada).  

---

## 🔄 Sincronización con Firebase

- Cuando haya internet, los documentos guardados localmente se subirán automáticamente a Firestore.  
- También descargará los documentos más recientes desde la nube.  
- No necesitas iniciar sesión (modo anónimo local).  

---

## 🧠 Estructura de datos

### `localStorage`
| Clave | Descripción |
|-------|--------------|
| `oasis.docs.v1` | Historial local de documentos |
| `oasis.items.v1` | Catálogo local |
| `oasis.settings.v1` | Configuración del negocio (nombre, IVU, prefijos, PIN, logo) |

### `Firebase`
Colección: `/documentos`  
Cada documento contiene:
```json
{
  "id": "uuid",
  "type": "FAC",
  "number": 1,
  "client": "Cliente X",
  "date": "2025-10-26",
  "paymentMethod": "ATH Móvil",
  "subtotal": 100,
  "discountPct": 5,
  "taxPct": 11.5,
  "total": 105,
  "status": "final",
  "updatedAt": 1730000000000
}
