# Manual del Sistema de RH por WhatsApp

Sistema de **Nómina, Asistencia y Recursos Humanos** operado por **WhatsApp** (para los
empleados) y por un **panel web** (para los administradores). Multi-empresa: varias
empresas pueden usar el mismo sistema y cada una ve **solo su propia información**.

---

## 1. ¿Qué es y para qué sirve?

- Los **empleados** hacen todo desde WhatsApp: checan entrada/salida con su ubicación,
  piden permisos y vacaciones, reportan incapacidades y consultan su información.
- Los **administradores / Recursos Humanos** usan un **panel web** para dar de alta
  empleados, obras, horarios y bonos; aprobar solicitudes; calcular la nómina y sacar
  reportes.
- El **dueño del sistema (súper-admin)** da de alta o elimina empresas completas.
- Un **asistente con Inteligencia Artificial** entiende el lenguaje natural del empleado
  ("ya llegué", "kiero mis vacaciones del 5 al 10"), incluso con faltas de ortografía.

---

## 2. Roles y qué puede hacer cada uno

### 2.1 Súper-admin (dueño del sistema)

Entra al panel con su cuenta especial. Solo ve el menú **🏢 Empresas**:

- **Crear empresa nueva** junto con su primer administrador (nombre, RFC, y el correo,
  contraseña y WhatsApp del admin).
- **Ver la lista** de todas las empresas (con número de empleados y de admins).
- **Eliminar una empresa** y **todos sus datos** de la base de datos (borrado definitivo;
  pide confirmar escribiendo el nombre exacto de la empresa).

Al crear una empresa se siembran automáticamente sus catálogos base: departamentos,
puestos, un horario "Matutino" y los conceptos de nómina base.

### 2.2 Administrador / RH (dueño o encargado de una empresa)

Entra al panel y solo ve **su empresa**. Puede administrar:

| Sección | Qué hace |
|---|---|
| 👥 Empleados | Alta, edición y baja de empleados; asignar puesto, departamento, horario y **una o varias obras**. |
| 📍 Obras / Geocercas | Crear ubicaciones (obra, oficina, sucursal) con su punto en el mapa y **radio permitido**. |
| 🕗 Horarios | Definir turnos: hora de entrada/salida, días laborales y minutos de comida. |
| 🕐 Asistencias | Ver checadas por rango de fechas (entrada, salida, horas, retardos). |
| ✅ Aprobaciones | Aprobar o rechazar permisos, vacaciones e incapacidades (con alertas de traslape). |
| 🏖️ Ausencias | Ver quién estará ausente en los próximos días (calendario de permisos/vacaciones). |
| 💰 Nómina | Crear periodos (semanal/quincenal), **calcular** la nómina y descargar recibos. |
| 🎁 Bonos / Conceptos | Crear percepciones/deducciones y asignarlas a empleados. |
| ⚠️ Incidencias | Ver retardos, faltas, salidas anticipadas y checadas fuera de geocerca. |
| ⚙️ Configuración | Ajustar reglas de la empresa (jornada, tolerancia, primas, aguinaldo, etc.). |

El administrador también puede **aprobar solicitudes desde su propio WhatsApp** (ver 3.3).

### 2.3 Empleado (por WhatsApp)

Todo desde el chat, sin instalar nada. Puede:

- **Checar entrada** ("llegué", "ya estoy en la obra") → el bot le pide su ubicación.
- **Checar salida** ("ya terminé", "me voy") → el bot le pide su ubicación.
- **Pedir permiso** ("necesito permiso mañana") → el bot le pregunta el **motivo**.
- **Pedir vacaciones** ("quiero vacaciones del 5 al 10 de agosto").
- **Consultar vacaciones** ("¿cuántas vacaciones me quedan?").
- **Reportar incapacidad** ("me dieron 3 días de incapacidad") → puede adjuntar comprobante.
- **Consultar nómina** ("¿cuánto voy a cobrar esta semana?").
- **Consultar horas extra** ("¿cuántas horas extra llevo?").
- **Consultar horas/días trabajados** en un rango de fechas.
- **Consultar el estatus** de una solicitud ("¿ya aprobaron mi permiso?").
- **Pedir ayuda** ("¿qué puedo hacer?").

---

## 3. Cómo funciona el bot de WhatsApp

### 3.1 Identificación

El bot identifica a la persona por su **número de teléfono** (los últimos 10 dígitos,
tolerando el 52/521 de México, el "1" extra y los guiones). Con eso sabe a qué **empresa**
pertenece y si es **empleado** o **administrador**.

> Regla importante: un mismo teléfono **no puede estar en dos empresas** a la vez.

### 3.2 Flujos de conversación (multi-paso)

Algunas acciones ocurren en varios mensajes. El bot "recuerda" en qué paso va:

- **Checar:** el empleado dice "entrada" → el bot pide **ubicación** → el empleado la
  comparte → queda registrada.
- **Permiso:** el empleado dice "necesito permiso el viernes" → el bot pregunta el
  **motivo** → el empleado responde → queda registrado y se avisa al admin.
- **Incapacidad:** el empleado la reporta → el bot puede pedir el **comprobante** (foto/PDF).

### 3.3 El administrador aprueba por WhatsApp

Un admin (identificado por su WhatsApp) puede escribir:

- `pendientes` → lista las solicitudes pendientes **de su empresa**.
- `aprobar permiso 12` → aprueba la solicitud #12.
- `rechazar vacaciones 8` → rechaza la #8.

Al resolverla, el **empleado recibe una notificación** automática ("✅ Tu permiso fue
APROBADO por Recursos Humanos").

---

## 4. Reglas de negocio (condiciones) y cómo se configuran

### 4.1 Checadas (entrada / salida)

- El empleado **comparte su ubicación** para checar.
- El sistema valida que esté **dentro de la geocerca** de su obra.
- No permite **checar entrada dos veces** el mismo día, ni **salida sin entrada** previa.
- Si checa **fuera del radio** permitido → se **bloquea** y se registra una incidencia
  `fuera_geocerca`.

**Se configura en cada Obra:**

| Campo | Qué hace | Valor por defecto |
|---|---|---|
| Ubicación (lat/lon) | Punto central de la obra/sucursal | — |
| Radio (metros) | Distancia permitida alrededor del punto | 100 m |

### 4.2 Retardos

- Al checar entrada se compara la hora contra la **hora de entrada** del horario,
  **más un margen de gracia**.
- Fórmula: `retardo = hora_actual − (hora_entrada + tolerancia)`.
- Si es positivo → incidencia `retardo` (y descuento proporcional en nómina).

**Se configura en la Empresa (⚙️ Configuración):**

| Campo | Qué hace | Valor por defecto |
|---|---|---|
| Tolerancia de retardo (min) | Minutos de gracia antes de contar retardo | 10 min |

### 4.3 Horarios (turnos)

Cada empleado tiene un horario asignado.

**Se configura en 🕗 Horarios:**

| Campo | Qué hace | Valor por defecto |
|---|---|---|
| Hora de entrada | Hora oficial de entrada | — |
| Hora de salida | Hora oficial de salida | — |
| Días laborales | Días que trabaja (0=Dom … 6=Sáb) | Lun–Sáb |
| Minutos de comida | Se descuentan de la jornada | 60 min |

- **Salida anticipada:** si checa salida antes de la hora → incidencia `salida_anticipada`.
- **Horas trabajadas** = (salida − entrada) − minutos de comida.
- **Horas extra** = horas trabajadas − jornada (solo si es positivo).

### 4.4 Permisos y Vacaciones

Reglas que aplica el bot al solicitar:

1. **Solo días laborables:** no deja meter permiso/vacaciones en días **no laborables**
   según su horario → responde *"🚫 Esas fechas caen en días no laborables…"*.
2. **Sin duplicados propios:** si ya tiene un permiso/vacación en esas fechas →
   *"⚠️ Ya tienes … capturado. No lo puedes duplicar…"*.
3. **El permiso pide motivo:** el bot pregunta y lo guarda (se ve en Aprobaciones).
4. **Vacaciones:** solo se **cuentan y descuentan los días laborables** del saldo
   (los días de descanso no restan).
5. **Traslape con OTROS empleados:** NO se bloquea; es solo una **alerta al admin** en el
   panel al momento de aprobar.

### 4.5 Empresa (prestaciones — Ley Federal del Trabajo)

**Se configura en ⚙️ Configuración:**

| Campo | Valor por defecto |
|---|---|
| Horas de jornada | 8 h |
| Días de aguinaldo | 15 días |
| Prima vacacional | 25% |
| Prima dominical | 25% |
| Factor hora extra doble | 2.0 |
| Factor hora extra triple | 3.0 |

---

## 5. Cómo se calcula la nómina

Al **calcular un periodo** (semanal o quincenal), por cada empleado activo:

**Percepciones:**
- **Sueldo** = salario diario × días trabajados.
- **Horas extra**: las primeras 9 de la semana al **doble**, el excedente al **triple**.
- **Prima dominical** si trabajó domingos.
- **Bonos/conceptos** asignados al empleado. Dos son condicionados:
  - `BONO_PUNT` (puntualidad): solo se paga si **no hubo retardos** en el periodo.
  - `BONO_ASIST` (asistencia): solo se paga si **no hubo faltas** en el periodo.

**Deducciones:**
- **Descuento por falta** (día no trabajado siendo laborable).
- **Descuento por retardo** (proporcional a los minutos).
- **ISR** (tarifa configurable del SAT).
- **IMSS** (cuota obrero configurable).
- **Préstamos / FONACOT** (amortización semanal automática).

El resultado genera un **recibo** por empleado con su detalle, del que se puede descargar
un **PDF**. También hay un reporte de **asistencias en Excel**.

---

## 6. Puesta en producción (WhatsApp oficial de Meta)

Hoy el sistema puede operar con un canal no oficial (Baileys) o con la **API oficial de
WhatsApp Cloud (Meta)**. Para producción con Meta se necesita:

- Cuenta de **Meta Business** (Business Manager) verificada del negocio.
- Una **app** en Meta for Developers con el producto **WhatsApp** agregado.
- Un **número de teléfono** dedicado al bot (no usado en la app normal de WhatsApp).
- Datos del negocio: **razón social, RFC, domicilio fiscal, sitio web** y verificación.
- Del panel de Meta se obtienen y se configuran en el servidor:
  `WA_CLOUD_PHONE_ID`, `WA_CLOUD_TOKEN` y `WA_CLOUD_VERIFY_TOKEN`, y se activa
  `WHATSAPP_CHANNEL=cloud`.
- Para mensajes que **inicia** el sistema (avisos al empleado/admin) puede requerirse
  aprobar **plantillas de mensaje** en Meta.

> El sistema ya está preparado para que, en el futuro, cada empresa use **su propio
> número** (campos `wa_phone_id` / `wa_token` por empresa). Mientras estén vacíos, todas
> comparten el número configurado en el servidor.

---

*Documento generado como referencia del sistema. Para el detalle técnico (estructura de
carpetas, base de datos y API), consulta `ARQUITECTURA.md`.*
