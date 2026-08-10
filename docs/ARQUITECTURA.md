# Arquitectura y estructura del proyecto

Documentación técnica del sistema de RH por WhatsApp: cómo está organizado el código,
la base de datos y la API.

---

## 1. Panorama general

- **Backend:** Node.js (ESM) + Express. Expone una API REST (`/api`) para el panel,
  sirve el panel compilado y los archivos subidos, y corre el **canal de WhatsApp**
  (bot) dentro del mismo proceso.
- **Frontend:** Vue 3 (`<script setup>`) + Vite. Panel de administración de una sola
  página (SPA).
- **Base de datos:** PostgreSQL con la extensión **PostGIS** (para geocercas).
- **IA:** SDK de Anthropic (Claude) para entender la intención de los mensajes.
- **Despliegue:** Docker Compose en un droplet de DigitalOcean.

Multi-empresa (multi-tenant): una sola base de datos compartida; cada tabla lleva
`empresa_id` y todas las consultas del panel filtran por la empresa del usuario logueado
(aislamiento por fila). El JWT del login lleva `empresa_id` y `rol`.

---

## 2. Estructura de carpetas

```
RH/
├── backend/
│   ├── Dockerfile
│   ├── package.json
│   └── src/
│       ├── index.js                 # Arranque: Express + canal WhatsApp + rutas
│       ├── config/
│       │   ├── index.js             # Lee variables de entorno (.env)
│       │   └── logger.js            # Logger (pino)
│       ├── db/
│       │   ├── pool.js              # Pool de PostgreSQL: one(), query(), tx()
│       │   ├── schema.sql           # Definición de todas las tablas
│       │   ├── migrate.js           # Aplica schema.sql (idempotente)
│       │   └── seed.js              # Datos base + súper-admin
│       ├── api/
│       │   ├── auth.js              # login, requireAuth, requireSuperadmin (JWT)
│       │   └── routes.js            # Todas las rutas REST del panel
│       ├── handlers/
│       │   ├── messages.js          # Router de mensajes del bot (flujos empleado)
│       │   └── admin-commands.js    # Comandos de admin por WhatsApp
│       ├── services/
│       │   ├── tenants.js           # Alta/baja de empresas (multi-empresa)
│       │   ├── employees.js         # Búsqueda de empleados/admins por WhatsApp
│       │   ├── attendance.js        # Checadas, retardos, horas, geocerca
│       │   ├── leaves.js            # Permisos, vacaciones, incapacidades, ausencias
│       │   ├── geofence.js          # Alta de obras + validación de punto en geocerca
│       │   ├── files.js             # Guardado de comprobantes subidos
│       │   ├── state.js             # Estado conversacional (flujos multi-paso)
│       │   └── payroll/
│       │       ├── index.js         # Cálculo de nómina (recibos + detalle)
│       │       ├── isr.js           # Cálculo de ISR (tarifa SAT)
│       │       ├── imss.js          # Cálculo de cuota IMSS
│       │       └── prestaciones.js  # Aguinaldo, prima vacacional, etc.
│       ├── ai/
│       │   └── intent.js            # Clasificador de intención (Claude + respaldo)
│       ├── whatsapp/
│       │   ├── channel.js           # Fábrica de canal (baileys | cloud)
│       │   ├── baileys.channel.js   # Canal no oficial (Baileys)
│       │   ├── cloud.channel.js     # Canal oficial (WhatsApp Cloud API)
│       │   └── cloud.webhook.js     # Webhook GET/POST para Cloud API
│       ├── reports/
│       │   └── reports.js           # Excel de asistencia + PDF de recibo
│       └── sim/
│           ├── cli.js               # Simulador interactivo del bot (pruebas)
│           └── demo.js              # Demo automatizada
│
├── frontend/
│   ├── package.json
│   ├── vite.config.js
│   └── src/
│       ├── main.js                  # Monta la app Vue
│       ├── App.vue                  # Login + menú lateral + ruteo de vistas
│       ├── api.js                   # fetch con token; helpers get/post/put/del
│       └── views/
│           ├── Empresas.vue         # (súper-admin) alta/lista/borrado de empresas
│           ├── Empleados.vue
│           ├── Obras.vue            # Obras / geocercas
│           ├── Horarios.vue
│           ├── Asistencias.vue
│           ├── Aprobaciones.vue     # Aprobar/rechazar solicitudes
│           ├── Ausencias.vue        # Calendario de ausencias
│           ├── Nomina.vue
│           ├── Conceptos.vue        # Bonos / conceptos
│           ├── Incidencias.vue
│           └── Configuracion.vue    # Reglas de la empresa
│
├── docs/                            # Esta documentación
├── docker-compose.yml               # Desarrollo local
└── docker-compose.deploy.yml        # Producción (droplet)
```

---

## 3. Flujo de un mensaje de WhatsApp

```
WhatsApp → canal (baileys/cloud) → router de mensajes (handlers/messages.js)
   │
   ├─ ¿Es admin? (employees.adminPorWhatsapp)  → admin-commands.js (pendientes/aprobar/rechazar)
   │
   └─ ¿Es empleado? (employees.buscarPorWhatsapp)
        ├─ ¿Hay un flujo pendiente? (services/state.js: esperando ubicación/motivo/comprobante)
        └─ Si no → IA (ai/intent.js) detecta intención
              ├─ entrada/salida     → services/attendance.js
              ├─ permiso/vacaciones → services/leaves.js  (valida días laborables + duplicados)
              ├─ incapacidad        → services/leaves.js + services/files.js
              └─ consultas          → attendance/leaves/payroll
```

Cada mensaje entrante/saliente se registra en `mensajes_wa` (auditoría y contexto).
El estado de los flujos multi-paso vive en `conversacion_estado` (JSONB `contexto`).

---

## 4. Base de datos (tablas principales)

| Tabla | Para qué |
|---|---|
| `empresas` | Cada empresa/tenant + su configuración de prestaciones y reglas. |
| `usuarios_admin` | Usuarios del panel (admin/rh/supervisor) y el **súper-admin** (rol `superadmin`, `empresa_id` NULL). |
| `departamentos`, `puestos` | Catálogos de la organización. |
| `obras` | Ubicaciones con geocerca (`ubicacion` PostGIS + `radio_metros`). |
| `horarios` | Turnos: hora entrada/salida, `dias_laborales` (INT[]), `minutos_comida`. |
| `empleados` | Datos del empleado (WhatsApp único, salario, horario, obra, saldo de vacaciones). |
| `empleado_obras` | Relación N:N empleado ↔ obras (un empleado puede tener varias). |
| `asistencias` | Una fila por empleado/día: entrada, salida, horas, retardo, salida anticipada, distancias. |
| `incidencias` | `fuera_geocerca`, `retardo`, `falta`, `salida_anticipada`, etc. |
| `permisos` | Solicitudes de permiso (con `motivo`, fechas, horas, estatus). |
| `vacaciones` | Solicitudes de vacaciones (días, fechas, estatus). |
| `incapacidades` | Incapacidades (tipo, folio IMSS, comprobante, estatus). |
| `conceptos_nomina` | Percepciones/deducciones configurables (clave, naturaleza, gravable). |
| `empleado_conceptos` | Conceptos recurrentes asignados a un empleado (monto o %). |
| `prestamos` | Préstamos/FONACOT con amortización semanal. |
| `periodos_nomina` | Periodos (semanal/quincenal) con estatus. |
| `recibos_nomina` + `recibo_detalle` | Recibo calculado por empleado y su desglose. |
| `sat_tarifas_isr`, `sat_subsidio_empleo`, `imss_parametros` | Tablas fiscales configurables por año. |
| `mensajes_wa` | Log de conversaciones (auditoría + intención IA). |
| `conversacion_estado` | Estado de flujos multi-paso por número de WhatsApp. |

La mayoría de las tablas referencian `empresas(id) ON DELETE CASCADE`. Aun así, el borrado
de empresa (`tenants.eliminarEmpresa`) hace **borrados ordenados hijo→padre en una
transacción** para ser robusto sin depender de la configuración de cascada.

---

## 5. API REST (panel)

Todas cuelgan de `/api`. `POST /login` es pública; el resto exige token (`requireAuth`).
Las rutas de empresa filtran por `emp(req) = req.user.empresa_id`.

**Súper-admin** (`requireSuperadmin`):
- `GET /admin/empresas` — lista empresas.
- `POST /admin/empresas` — crea empresa + primer admin.
- `DELETE /admin/empresas/:id` — borra la empresa y todos sus datos.

**Empresa (admin/RH):**
- Empleados: `GET/POST /empleados`, `PUT/DELETE /empleados/:id`.
- Catálogos: `GET/POST /departamentos`, `/puestos`, `/horarios` (+`PUT/DELETE /horarios/:id`).
- Conceptos: `GET/POST/PUT/DELETE /conceptos`; asignaciones `GET/POST/DELETE /asignaciones`.
- Configuración: `GET/PUT /empresa`.
- Obras: `GET/POST /obras`, `PUT/DELETE /obras/:id`.
- Asistencia: `GET /asistencias`, `GET /incidencias`.
- Solicitudes: `GET /pendientes`, `GET /ausencias`, `POST /solicitudes/:tipo/:id/resolver`.
- Nómina: `GET/POST /periodos`, `POST /periodos/:id/calcular`, `GET /periodos/:id/recibos`.
- Reportes: `GET /reportes/asistencia.xlsx`, `GET /recibos/:id.pdf`.

---

## 6. Canal de WhatsApp

- Se elige con la variable `WHATSAPP_CHANNEL` (`baileys` por defecto, o `cloud`).
- **Baileys:** canal no oficial (escanea un QR). Útil para pruebas.
- **Cloud API (Meta):** canal oficial. Requiere `WA_CLOUD_PHONE_ID`, `WA_CLOUD_TOKEN` y
  `WA_CLOUD_VERIFY_TOKEN`. Expone un **webhook** en `/webhook` (GET para verificar,
  POST para recibir mensajes).
- Interfaz común (`channel.js`): `start()`, `onMessage()`, `sendText()`, `name`.
- Preparado para número por empresa: `empresas.wa_phone_id` / `wa_token` (si están vacíos,
  se usa el número compartido del servidor).

---

## 7. Configuración (variables de entorno)

Principales variables (`.env`):

| Variable | Para qué |
|---|---|
| `PORT` | Puerto del servidor. |
| `DATABASE_URL` | Conexión a PostgreSQL. |
| `JWT_SECRET` | Firma de los tokens del panel. |
| `ANTHROPIC_API_KEY` | IA de intención (si falta, usa clasificador por palabras clave). |
| `WHATSAPP_CHANNEL` | `baileys` o `cloud`. |
| `WA_CLOUD_PHONE_ID` / `WA_CLOUD_TOKEN` / `WA_CLOUD_VERIFY_TOKEN` | Credenciales de WhatsApp Cloud (Meta). |
| `ADMIN_WHATSAPP` | (Legado) admins globales; hoy los admins son por empresa en BD. |
| `SUPERADMIN_EMAIL` / `SUPERADMIN_PASSWORD` | Crea el súper-admin al sembrar. |

---

## 8. Despliegue (droplet)

**Backend:**
```bash
git pull
docker compose -f docker-compose.deploy.yml up -d --build app
docker compose -f docker-compose.deploy.yml exec app npm run migrate   # aplica schema.sql
```

**Frontend (build estático servido por el backend):**
```bash
docker run --rm -v "$PWD/frontend":/app -w /app node:22-slim \
  sh -c "npm install && npm run build"
```

`migrate.js` aplica `schema.sql` de forma idempotente (`IF NOT EXISTS`, `ADD COLUMN IF NOT
EXISTS`), por lo que es seguro correrlo en cada despliegue. `seed.js` crea los catálogos
base y el súper-admin de forma idempotente.
