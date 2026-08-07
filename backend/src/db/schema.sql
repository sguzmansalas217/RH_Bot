-- ══════════════════════════════════════════════════════════════════════════
--  ESQUEMA: Sistema de Nómina, Asistencia y RH por WhatsApp
--  PostgreSQL 15 + PostGIS
-- ══════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── Empresa y configuración ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS empresas (
    id              SERIAL PRIMARY KEY,
    nombre          TEXT NOT NULL,
    rfc             TEXT,
    -- Configuración de prestaciones (Ley Federal del Trabajo, valores base)
    dias_aguinaldo          INT     NOT NULL DEFAULT 15,   -- mínimo legal
    prima_vacacional_pct    NUMERIC NOT NULL DEFAULT 0.25, -- 25% mínimo
    prima_dominical_pct     NUMERIC NOT NULL DEFAULT 0.25, -- 25% mínimo
    horas_jornada           NUMERIC NOT NULL DEFAULT 8,
    dias_semana_laboral     INT     NOT NULL DEFAULT 6,
    tolerancia_retardo_min  INT     NOT NULL DEFAULT 10,   -- minutos de gracia
    factor_hora_extra_doble NUMERIC NOT NULL DEFAULT 2.0,  -- primeras 9 h/sem
    factor_hora_extra_triple NUMERIC NOT NULL DEFAULT 3.0, -- excedente
    creado_en       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Usuarios del panel (administradores/RH) ──────────────────────────────
CREATE TABLE IF NOT EXISTS usuarios_admin (
    id              SERIAL PRIMARY KEY,
    empresa_id      INT REFERENCES empresas(id) ON DELETE CASCADE,
    nombre          TEXT NOT NULL,
    email           TEXT UNIQUE NOT NULL,
    password_hash   TEXT NOT NULL,
    rol             TEXT NOT NULL DEFAULT 'admin', -- admin | rh | supervisor
    whatsapp        TEXT,                          -- para aprobar por WhatsApp
    activo          BOOLEAN NOT NULL DEFAULT true,
    creado_en       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Organización ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS departamentos (
    id          SERIAL PRIMARY KEY,
    empresa_id  INT REFERENCES empresas(id) ON DELETE CASCADE,
    nombre      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS puestos (
    id              SERIAL PRIMARY KEY,
    empresa_id      INT REFERENCES empresas(id) ON DELETE CASCADE,
    nombre          TEXT NOT NULL,
    salario_base    NUMERIC DEFAULT 0
);

-- ─── Obras / sucursales / geocercas ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS obras (
    id              SERIAL PRIMARY KEY,
    empresa_id      INT REFERENCES empresas(id) ON DELETE CASCADE,
    nombre          TEXT NOT NULL,
    tipo            TEXT DEFAULT 'obra',           -- obra | oficina | planta | sucursal
    ubicacion       geography(Point, 4326) NOT NULL,  -- lat/lon
    radio_metros    INT NOT NULL DEFAULT 100,
    activa          BOOLEAN NOT NULL DEFAULT true,
    creado_en       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_obras_ubicacion ON obras USING GIST (ubicacion);

-- ─── Horarios / turnos ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS horarios (
    id              SERIAL PRIMARY KEY,
    empresa_id      INT REFERENCES empresas(id) ON DELETE CASCADE,
    nombre          TEXT NOT NULL,                 -- p.ej. "Matutino"
    hora_entrada    TIME NOT NULL,
    hora_salida     TIME NOT NULL,
    -- días laborales como array (0=Dom .. 6=Sab)
    dias_laborales  INT[] NOT NULL DEFAULT '{1,2,3,4,5,6}',
    minutos_comida  INT NOT NULL DEFAULT 60
);

-- ─── Empleados ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS empleados (
    id                  SERIAL PRIMARY KEY,
    empresa_id          INT REFERENCES empresas(id) ON DELETE CASCADE,
    numero_empleado     TEXT,
    nombre              TEXT NOT NULL,
    whatsapp            TEXT UNIQUE NOT NULL,      -- E.164 sin '+', ej. 5215555555555
    curp                TEXT,
    rfc                 TEXT,
    nss                 TEXT,                      -- número de seguro social
    departamento_id     INT REFERENCES departamentos(id),
    puesto_id           INT REFERENCES puestos(id),
    obra_id             INT REFERENCES obras(id),  -- obra asignada
    horario_id          INT REFERENCES horarios(id),
    salario_diario      NUMERIC NOT NULL DEFAULT 0,
    salario_diario_integrado NUMERIC DEFAULT 0,    -- SDI para IMSS
    fecha_ingreso       DATE NOT NULL DEFAULT CURRENT_DATE,
    fecha_baja          DATE,
    dias_vacaciones_saldo NUMERIC NOT NULL DEFAULT 0,
    activo              BOOLEAN NOT NULL DEFAULT true,
    creado_en           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_empleados_whatsapp ON empleados(whatsapp);

-- ─── Obras asignadas a cada empleado (varias por empleado) ─────────────────
-- Un empleado puede trabajar en más de una obra/ubicación. Esta tabla sustituye
-- al antiguo empleados.obra_id (que se conserva por compatibilidad).
CREATE TABLE IF NOT EXISTS empleado_obras (
    empleado_id     INT NOT NULL REFERENCES empleados(id) ON DELETE CASCADE,
    obra_id         INT NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
    PRIMARY KEY (empleado_id, obra_id)
);
CREATE INDEX IF NOT EXISTS idx_empleado_obras_empleado ON empleado_obras(empleado_id);

-- Relleno inicial (una sola vez): copia la obra única existente a la tabla nueva.
INSERT INTO empleado_obras (empleado_id, obra_id)
SELECT id, obra_id FROM empleados
 WHERE obra_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM empleado_obras)
ON CONFLICT DO NOTHING;

-- ─── Asistencias ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS asistencias (
    id                  SERIAL PRIMARY KEY,
    empleado_id         INT REFERENCES empleados(id) ON DELETE CASCADE,
    obra_id             INT REFERENCES obras(id),
    fecha               DATE NOT NULL,
    entrada             TIMESTAMPTZ,               -- hora OFICIAL del servidor
    salida              TIMESTAMPTZ,
    ubicacion_entrada   geography(Point, 4326),
    ubicacion_salida    geography(Point, 4326),
    distancia_entrada_m NUMERIC,                   -- distancia al centro de la geocerca
    distancia_salida_m  NUMERIC,
    horas_trabajadas    NUMERIC DEFAULT 0,
    horas_extra         NUMERIC DEFAULT 0,
    minutos_retardo     INT DEFAULT 0,
    salida_anticipada_min INT DEFAULT 0,
    estatus             TEXT DEFAULT 'abierta',    -- abierta | cerrada | incompleta
    creado_en           TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (empleado_id, fecha)
);
CREATE INDEX IF NOT EXISTS idx_asistencias_fecha ON asistencias(fecha);

-- ─── Incidencias (fuera de geocerca, falta, etc.) ─────────────────────────
CREATE TABLE IF NOT EXISTS incidencias (
    id              SERIAL PRIMARY KEY,
    empleado_id     INT REFERENCES empleados(id) ON DELETE CASCADE,
    tipo            TEXT NOT NULL,   -- fuera_geocerca | falta | retardo | salida_anticipada | otra
    descripcion     TEXT,
    fecha           DATE NOT NULL DEFAULT CURRENT_DATE,
    resuelta        BOOLEAN NOT NULL DEFAULT false,
    creado_en       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Solicitudes: permisos ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS permisos (
    id              SERIAL PRIMARY KEY,
    empleado_id     INT REFERENCES empleados(id) ON DELETE CASCADE,
    tipo            TEXT DEFAULT 'permiso',  -- permiso | llegada_tarde | salida_temporal
    motivo          TEXT,
    fecha_inicio    DATE NOT NULL,
    fecha_fin       DATE,
    horas           NUMERIC,                 -- para permisos por horas
    con_goce        BOOLEAN NOT NULL DEFAULT true,
    estatus         TEXT NOT NULL DEFAULT 'pendiente', -- pendiente | aprobado | rechazado
    aprobado_por    INT REFERENCES usuarios_admin(id),
    resuelto_en     TIMESTAMPTZ,
    creado_en       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Solicitudes: incapacidades ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS incapacidades (
    id              SERIAL PRIMARY KEY,
    empleado_id     INT REFERENCES empleados(id) ON DELETE CASCADE,
    tipo            TEXT DEFAULT 'enfermedad', -- enfermedad | riesgo_trabajo | maternidad
    folio_imss      TEXT,
    dias            INT,
    fecha_inicio    DATE,
    fecha_fin       DATE,
    comprobante_url TEXT,                      -- archivo enviado por WhatsApp
    estatus         TEXT NOT NULL DEFAULT 'pendiente', -- pendiente | aprobada | rechazada | info_requerida
    observaciones   TEXT,
    aprobado_por    INT REFERENCES usuarios_admin(id),
    resuelto_en     TIMESTAMPTZ,
    creado_en       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Solicitudes: vacaciones ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vacaciones (
    id              SERIAL PRIMARY KEY,
    empleado_id     INT REFERENCES empleados(id) ON DELETE CASCADE,
    fecha_inicio    DATE NOT NULL,
    fecha_fin       DATE NOT NULL,
    dias            NUMERIC NOT NULL,
    estatus         TEXT NOT NULL DEFAULT 'pendiente', -- pendiente | aprobada | rechazada | disfrutada
    aprobado_por    INT REFERENCES usuarios_admin(id),
    resuelto_en     TIMESTAMPTZ,
    creado_en       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Conceptos de nómina (percepciones/deducciones configurables) ─────────
CREATE TABLE IF NOT EXISTS conceptos_nomina (
    id          SERIAL PRIMARY KEY,
    empresa_id  INT REFERENCES empresas(id) ON DELETE CASCADE,
    clave       TEXT NOT NULL,
    nombre      TEXT NOT NULL,
    naturaleza  TEXT NOT NULL,   -- percepcion | deduccion
    gravable    BOOLEAN NOT NULL DEFAULT true,
    UNIQUE (empresa_id, clave)
);

-- Conceptos recurrentes asignados a un empleado (bono fijo, deducción, etc.)
CREATE TABLE IF NOT EXISTS empleado_conceptos (
    id              SERIAL PRIMARY KEY,
    empleado_id     INT REFERENCES empleados(id) ON DELETE CASCADE,
    concepto_id     INT REFERENCES conceptos_nomina(id),
    monto           NUMERIC,          -- monto fijo
    porcentaje      NUMERIC,          -- o porcentaje sobre sueldo
    activo          BOOLEAN NOT NULL DEFAULT true
);

-- ─── Préstamos (con amortización semanal) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS prestamos (
    id                  SERIAL PRIMARY KEY,
    empleado_id         INT REFERENCES empleados(id) ON DELETE CASCADE,
    monto_total         NUMERIC NOT NULL,
    descuento_semanal   NUMERIC NOT NULL,
    saldo               NUMERIC NOT NULL,
    tipo                TEXT DEFAULT 'prestamo', -- prestamo | fonacot
    activo              BOOLEAN NOT NULL DEFAULT true,
    creado_en           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Nómina: periodos y recibos ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS periodos_nomina (
    id              SERIAL PRIMARY KEY,
    empresa_id      INT REFERENCES empresas(id) ON DELETE CASCADE,
    tipo            TEXT NOT NULL DEFAULT 'semanal', -- semanal | quincenal
    fecha_inicio    DATE NOT NULL,
    fecha_fin       DATE NOT NULL,
    estatus         TEXT NOT NULL DEFAULT 'abierto', -- abierto | calculado | cerrado
    creado_en       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS recibos_nomina (
    id                  SERIAL PRIMARY KEY,
    periodo_id          INT REFERENCES periodos_nomina(id) ON DELETE CASCADE,
    empleado_id         INT REFERENCES empleados(id) ON DELETE CASCADE,
    dias_trabajados     NUMERIC DEFAULT 0,
    horas_normales      NUMERIC DEFAULT 0,
    horas_extra         NUMERIC DEFAULT 0,
    total_percepciones  NUMERIC DEFAULT 0,
    total_deducciones   NUMERIC DEFAULT 0,
    neto_pagar          NUMERIC DEFAULT 0,
    creado_en           TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (periodo_id, empleado_id)
);

CREATE TABLE IF NOT EXISTS recibo_detalle (
    id              SERIAL PRIMARY KEY,
    recibo_id       INT REFERENCES recibos_nomina(id) ON DELETE CASCADE,
    concepto        TEXT NOT NULL,     -- p.ej. "Sueldo", "Horas extra", "ISR", "IMSS"
    naturaleza      TEXT NOT NULL,     -- percepcion | deduccion
    cantidad        NUMERIC,           -- horas/días
    importe         NUMERIC NOT NULL
);

-- ─── Tablas fiscales configurables (actualizar cada año) ──────────────────
-- Tarifa ISR (Art. 96 LISR), aplicada al periodo correspondiente
CREATE TABLE IF NOT EXISTS sat_tarifas_isr (
    id              SERIAL PRIMARY KEY,
    periodo         TEXT NOT NULL DEFAULT 'semanal', -- semanal | mensual
    limite_inferior NUMERIC NOT NULL,
    limite_superior NUMERIC,           -- NULL = en adelante
    cuota_fija      NUMERIC NOT NULL,
    porcentaje      NUMERIC NOT NULL   -- sobre excedente del límite inferior
);

-- Subsidio para el empleo (si aplica)
CREATE TABLE IF NOT EXISTS sat_subsidio_empleo (
    id              SERIAL PRIMARY KEY,
    periodo         TEXT NOT NULL DEFAULT 'semanal',
    limite_inferior NUMERIC NOT NULL,
    limite_superior NUMERIC,
    subsidio        NUMERIC NOT NULL
);

-- Parámetros IMSS (cuotas obrero-patronales, valores configurables)
CREATE TABLE IF NOT EXISTS imss_parametros (
    id                          SERIAL PRIMARY KEY,
    clave                       TEXT UNIQUE NOT NULL,
    descripcion                 TEXT,
    porcentaje_obrero           NUMERIC NOT NULL DEFAULT 0
);

-- ─── Log de conversaciones WhatsApp (auditoría + contexto IA) ─────────────
CREATE TABLE IF NOT EXISTS mensajes_wa (
    id              BIGSERIAL PRIMARY KEY,
    whatsapp        TEXT NOT NULL,
    empleado_id     INT REFERENCES empleados(id),
    direccion       TEXT NOT NULL,     -- entrante | saliente
    texto           TEXT,
    intencion       TEXT,              -- intención detectada por IA
    entidades       JSONB,
    tipo_mensaje    TEXT DEFAULT 'texto', -- texto | ubicacion | archivo | boton
    creado_en       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mensajes_wa_whatsapp ON mensajes_wa(whatsapp);

-- Estado conversacional (para flujos multi-paso: p.ej. esperando ubicación)
CREATE TABLE IF NOT EXISTS conversacion_estado (
    whatsapp        TEXT PRIMARY KEY,
    esperando       TEXT,              -- ubicacion_entrada | ubicacion_salida | comprobante | null
    contexto        JSONB,
    actualizado_en  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Multi-empresa: número de WhatsApp propio por empresa (opcional) ───────
-- Si están vacíos, la empresa usa el número compartido (env WA_CLOUD_*).
-- Preparado para "graduar" a una empresa a su propio número en el futuro.
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS wa_phone_id TEXT;
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS wa_token    TEXT;

-- ─── Horario por día (opcional) ───────────────────────────────────────────
-- Objeto JSON por día de la semana: { "1": {"entrada":"08:00","salida":"17:00"}, ... }
-- Claves 0=Dom .. 6=Sáb. Los días ausentes son de descanso. Si está vacío,
-- el horario usa la hora_entrada/hora_salida + dias_laborales (modo simple).
ALTER TABLE horarios ADD COLUMN IF NOT EXISTS dias_horario JSONB;
