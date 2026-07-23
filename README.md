# Sistema Inteligente de Nómina, Asistencia y RH por WhatsApp con IA

Sistema integral de administración de personal donde los empleados interactúan por
**WhatsApp** usando **IA (Claude)** para lenguaje natural. Registra asistencia con
**hora oficial del servidor**, valida ubicación con **geocercas (PostGIS)** y calcula
**nómina y prestaciones** conforme a la legislación mexicana.

## Arquitectura

```
┌──────────────┐   mensajes    ┌────────────────────────────────────────┐
│  WhatsApp    │ ────────────► │  Backend (Node.js + Express)           │
│  (empleado)  │ ◄──────────── │                                        │
└──────────────┘   respuestas  │  ├─ Canal (Baileys ⇄ Cloud API)        │
                                │  ├─ Motor IA (Claude: intención)       │
┌──────────────┐   REST/JWT    │  ├─ Asistencia + Geocercas (PostGIS)   │
│ Panel Admin  │ ────────────► │  ├─ Permisos / Vacaciones / Incap.     │
│  (Vue 3)     │ ◄──────────── │  ├─ Nómina y Prestaciones (MX)         │
└──────────────┘               │  └─ Reportes (Excel / PDF)             │
                                └───────────────────┬────────────────────┘
                                                    │
                                        ┌───────────▼───────────┐
                                        │ PostgreSQL 15 + PostGIS│
                                        └────────────────────────┘
```

- **Canal WhatsApp desacoplado:** hoy usa **Baileys** (no oficial). Existe una interfaz
  `MessagingChannel` para migrar a **WhatsApp Cloud API** sin tocar la lógica de negocio.
- **IA:** Claude API con *tool use* → devuelve `{intencion, entidades}` estructurado.
- **Geocercas:** PostGIS `ST_DWithin` valida que el empleado esté dentro del radio.
- **Hora oficial:** siempre se usa `now()` del servidor, nunca la del teléfono.

## Stack

| Componente | Tecnología |
|------------|-----------|
| Backend    | Node.js 22 + Express |
| IA         | @anthropic-ai/sdk (Claude) |
| WhatsApp   | @whiskeysockets/baileys |
| BD         | PostgreSQL 15 + PostGIS |
| Panel      | Vue 3 + Vite |
| Reportes   | ExcelJS + PDFKit |
| Infra      | Docker Compose + Nginx + Certbot |

## Desarrollo local

```bash
cp .env.example .env          # completa las variables (API key de Claude, admin, etc.)
docker compose up -d db       # levanta Postgres+PostGIS

# Backend
cd backend && npm install
npm run migrate               # crea el esquema
npm run seed                  # datos demo + tablas ISR/IMSS + login admin
npm run dev                   # arranca API + WhatsApp (imprime QR en consola)

# Panel (en otra terminal)
cd ../frontend && npm install && npm run dev   # http://localhost:5173
```

Al arrancar el backend, Baileys imprime un **QR** en consola: escanéalo con el WhatsApp
que actuará como número del sistema.

**Login del panel:** `admin@demo.com` / `admin123` (cámbialo después del primer acceso).

## Simulación sin WhatsApp (terminal)

Puedes probar toda la conversación sin teléfono ni QR:

```bash
cd backend && npm run sim
```

Chateas con el bot desde la consola como el empleado demo `5210000000001`.
Comandos: `/loc <lat> <lon>`, `/file`, `/from <num>`, `/admin`, `/help`, `/exit`.
La geocerca demo está en `19.4326 -99.1332` (radio 150 m).

> Sin `ANTHROPIC_API_KEY` el bot usa un clasificador por palabras clave, así que la
> simulación funciona igual (con IA real detecta mejor el lenguaje natural).

## Despliegue en DigitalOcean (Droplet)

1. Crea un Droplet **Ubuntu 22.04, 2 vCPU / 4 GB**.
2. Instala Docker + Docker Compose.
3. Clona el repo, copia `.env` con las credenciales de producción.
4. Apunta tu dominio (`A record`) al IP del Droplet y ponlo en `.env` (`DOMAIN`)
   y en `nginx/conf.d/default.conf` (rutas del certificado).
5. Compila el panel: `cd frontend && npm install && npm run build` (genera `frontend/dist`,
   que Nginx sirve como estático).
6. Emite el certificado la primera vez:
   `docker compose run --rm certbot certonly --webroot -w /var/www/certbot -d rh.tudominio.com`
7. `docker compose up -d` (levanta app + db + nginx + certbot con renovación automática).
8. HTTPS queda activo vía Let's Encrypt (necesario para el panel y, si migras, el webhook).

> **Backups:** `pg_dump` diario a DO Spaces + snapshots del Droplet.
> Para producción real de nómina se recomienda **Managed PostgreSQL** de DO.

## ⚠️ Notas importantes

- **Baileys** no es la API oficial de WhatsApp: riesgo de baneo del número. Para
  producción crítica migrar a **Cloud API** (canal ya desacoplado).
- El **monitoreo de ubicación cada 15 min** no es posible por WhatsApp puro (requiere
  PWA/app). Esta versión valida geocerca **solo en entrada y salida**.
- Las tablas de **ISR/IMSS/INFONAVIT** son configurables y deben actualizarse cada año
  fiscal desde la BD (`sat_tarifas_isr`, `imss_parametros`).
