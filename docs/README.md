# Documentación del Sistema de RH por WhatsApp

Esta carpeta contiene la documentación del proyecto.

| Archivo | Contenido |
|---|---|
| [MANUAL-USUARIO.md](MANUAL-USUARIO.md) | **Manual de uso para empleados y dueño/administrador** (sin súper-admin). Guía paso a paso del bot de WhatsApp para el empleado y del panel web para el dueño/RH. También en **PDF** (`MANUAL-USUARIO.pdf`). |
| [MANUAL.md](MANUAL.md) | Manual completo (incluye súper-admin). Roles, bot y todas las reglas. También en **PDF** (`MANUAL.pdf`). |
| [ARQUITECTURA.md](ARQUITECTURA.md) | **Documentación técnica.** Estructura de carpetas, flujo de un mensaje, base de datos (tablas), API REST, canal de WhatsApp, variables de entorno y despliegue. |

## Generar los PDF

```bash
cd backend
node scripts/generar-manual-pdf.mjs MANUAL-USUARIO.md   # → docs/MANUAL-USUARIO.pdf
node scripts/generar-manual-pdf.mjs                      # → docs/MANUAL.pdf (por defecto)
```

Usa `pdfkit` (ya instalado en el backend).
