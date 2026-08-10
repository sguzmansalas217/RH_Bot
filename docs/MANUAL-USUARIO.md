# Manual de Uso — Sistema de RH por WhatsApp

Guía práctica para **empleados** (que usan WhatsApp) y para el
**dueño o administrador de la empresa** (que usa el panel web).

Este sistema permite que los empleados checen su asistencia, pidan permisos y vacaciones,
reporten incapacidades y hagan consultas **directamente por WhatsApp**, mientras el dueño o
Recursos Humanos administra todo desde un **panel web**.

---

# PARTE 1 — Manual del Empleado (WhatsApp)

El empleado no instala nada: todo se hace escribiendo por WhatsApp al número de la empresa.
El asistente entiende lenguaje normal, aunque haya faltas de ortografía
("ya llegue", "kiero mis vacaciones").

## 1.1 Checar entrada y salida

1. Al llegar, escribe algo como **"llegué"**, **"entrada"** o **"ya estoy en la obra"**.
2. El bot te pedirá tu **ubicación**. Compártela desde WhatsApp: toca el clip de adjuntar,
   elige "Ubicación" y luego "Enviar tu ubicación actual".
3. El bot confirma tu entrada.

Para la salida es igual: escribe **"ya terminé"**, **"salida"** o **"me voy"** y comparte tu
ubicación de nuevo.

> Importante: debes estar **dentro de la zona permitida** de tu obra/sucursal. Si estás
> fuera, el sistema **no** registra la checada y le avisa a tu empresa.

## 1.2 Pedir un permiso

1. Escribe, por ejemplo, **"necesito permiso el viernes"** o **"saldré 2 horas al médico"**.
2. El bot te preguntará el **motivo**. Respóndelo (ej. "cita médica").
3. Queda registrado y le llega el aviso a tu empresa para aprobarlo.

Reglas:
- No puedes pedir permiso en **días que no trabajas** según tu horario; el bot te avisa.
- Si ya tienes un permiso en esas mismas fechas, el bot te dice que **ya lo tienes capturado**.

## 1.3 Pedir vacaciones

1. Escribe **"quiero vacaciones del 5 al 10 de agosto"**.
2. El bot valida que tengas saldo y que sean **días laborables**, y registra la solicitud.

- Solo se cuentan y descuentan los **días laborables** (tus días de descanso no restan).
- No puedes duplicar vacaciones ya capturadas en esas fechas.

## 1.4 Consultar tu información

Puedes preguntar en cualquier momento:

- **"¿Cuántas vacaciones me quedan?"** → tu saldo de días.
- **"¿Cuánto voy a cobrar esta semana?"** → estimación de tu nómina.
- **"¿Cuántas horas extra llevo?"**
- **"¿Cuántas horas (o días) trabajé del 1 al 15?"**
- **"¿Ya aprobaron mi permiso?"** → estatus de tu solicitud.

## 1.5 Reportar una incapacidad

1. Escribe **"tengo incapacidad"** o **"me dieron 3 días de incapacidad"**.
2. Si el bot te lo pide, envía la **foto o PDF del comprobante**.
3. Queda registrada para que tu empresa la revise.

## 1.6 Cuando te aprueban o rechazan algo

Cuando el dueño/RH resuelve tu permiso, vacaciones o incapacidad, **te llega un mensaje
automático** por WhatsApp (por ejemplo: *"✅ Tu permiso fue APROBADO por Recursos
Humanos"*), a veces con observaciones.

---

# PARTE 2 — Manual del Dueño / Administrador (Panel web)

El dueño o encargado de Recursos Humanos entra al **panel web** con su correo y contraseña.
Solo verá la información de **su empresa**.

## 2.1 Entrar al panel

1. Abre la dirección del panel en el navegador.
2. Escribe tu **correo** y **contraseña** y presiona **Entrar**.
3. En el menú de la izquierda aparecen todas las secciones.

## 2.2 Empleados 👥

Da de alta, edita o da de baja a tu personal.

- **Alta:** nombre, número de WhatsApp, puesto, departamento, horario y **una o varias
  obras**. También su salario y saldo de vacaciones.
- **Baja:** el empleado deja de aparecer y ya no puede usar el bot.

> El **número de WhatsApp** es la llave del empleado: con él lo reconoce el bot. Un mismo
> número no puede estar en dos empresas.

## 2.3 Obras / Geocercas 📍

Son las ubicaciones donde el personal checa (obra, oficina, sucursal).

- Defines el **punto en el mapa** y el **radio permitido** (por defecto 100 metros).
- Si un empleado checa fuera de ese radio, la checada se **bloquea** y queda como
  incidencia.

## 2.4 Horarios 🕗

Defines los turnos y se los asignas a los empleados.

| Campo | Qué significa |
|---|---|
| Hora de entrada | Hora oficial de entrada. |
| Hora de salida | Hora oficial de salida. |
| Días laborales | Los días que se trabajan (los demás son de descanso). |
| Minutos de comida | Tiempo de comida que se descuenta de la jornada (por defecto 60). |

> Los permisos y vacaciones **solo** se pueden pedir en los días laborales configurados aquí.

## 2.5 Asistencias 🕐

Consulta las checadas por rango de fechas: entrada, salida, horas trabajadas, horas extra,
retardos y salidas anticipadas.

## 2.6 Aprobaciones ✅

Aquí llegan las solicitudes de **permisos, vacaciones e incapacidades** para aprobar o
rechazar. Puedes escribir **observaciones** que le llegan al empleado.

- Verás el **motivo** que puso el empleado en cada permiso.
- Si otro empleado tiene vacaciones que se **traslapan**, el sistema te muestra una
  **alerta** (no bloquea; tú decides).

También puedes aprobar **desde tu propio WhatsApp** (ver 2.12).

## 2.7 Ausencias 🏖️

Un calendario de quién estará ausente en los próximos días (permisos y vacaciones
aprobados), para planear el trabajo.

## 2.8 Nómina 💰

1. Crea un **periodo** (semanal o quincenal) con sus fechas.
2. Presiona **Calcular**: el sistema arma el recibo de cada empleado.
3. Descarga los **recibos en PDF** y el reporte de **asistencia en Excel**.

Qué toma en cuenta el cálculo:

- **Sueldo** por días trabajados.
- **Horas extra** (dobles las primeras 9 de la semana, triples el excedente).
- **Prima dominical** si trabajó domingos.
- **Bonos** que le hayas asignado (el de puntualidad no se paga si hubo retardos; el de
  asistencia no se paga si hubo faltas).
- **Descuentos** por faltas y retardos.
- **ISR**, **IMSS** y **préstamos / FONACOT**.

## 2.9 Bonos / Conceptos 🎁

Crea percepciones (bonos, comisiones) o deducciones y **asígnalas a los empleados**
(monto fijo o porcentaje). Dos conceptos especiales:

- **Bono de puntualidad**: solo se paga si el empleado no tuvo retardos en el periodo.
- **Bono de asistencia**: solo se paga si no tuvo faltas.

## 2.10 Incidencias ⚠️

Historial de eventos: retardos, faltas, salidas anticipadas y checadas fuera de la zona
permitida.

## 2.11 Configuración ⚙️

Ajusta las reglas de tu empresa:

| Campo | Para qué | Por defecto |
|---|---|---|
| Horas de jornada | Horas normales antes de contar extras | 8 h |
| Tolerancia de retardo | Minutos de gracia antes de contar retardo | 10 min |
| Días de aguinaldo | Prestación de aguinaldo | 15 días |
| Prima vacacional | Porcentaje sobre vacaciones | 25% |
| Prima dominical | Porcentaje extra por domingo trabajado | 25% |
| Factor hora extra doble / triple | Cómo se pagan las horas extra | 2.0 / 3.0 |

## 2.12 Aprobar solicitudes por WhatsApp

Si tu número de WhatsApp está registrado como administrador, puedes escribir al bot:

- **pendientes** → te lista las solicitudes pendientes de tu empresa.
- **aprobar permiso 12** → aprueba la solicitud #12.
- **rechazar vacaciones 8** → rechaza la #8.

El empleado recibe la notificación automáticamente.

---

## Resumen de reglas importantes

- **Checada:** solo cuenta si estás **dentro del radio** de la obra.
- **Retardo:** se cuenta si llegas después de tu hora de entrada + la **tolerancia**.
- **Salida anticipada / horas extra:** se calculan contra tu hora de salida y tu jornada.
- **Permisos y vacaciones:** solo en **días laborables**, sin duplicar; el permiso pide
  **motivo**.
- **Vacaciones:** descuentan **solo días laborables** del saldo.
- **Traslape de vacaciones entre empleados:** es solo una **alerta** al aprobar.

---

*Para dudas técnicas sobre la instalación o la estructura del sistema, consulta el documento
`ARQUITECTURA.md`.*
