import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config/index.js';
import { logger } from '../config/logger.js';

const client = config.ai.apiKey ? new Anthropic({ apiKey: config.ai.apiKey }) : null;

// Catálogo de intenciones que entiende el sistema
export const INTENCIONES = [
  'entrada', // marcar entrada / llegué / ya estoy en la obra
  'salida', // marcar salida / ya terminé / me retiro
  'solicitar_permiso', // necesito permiso / llegaré tarde / saldré 2 horas
  'solicitar_vacaciones', // quiero vacaciones del X al Y
  'consultar_vacaciones', // ¿cuántas vacaciones me quedan?
  'reportar_incapacidad', // tengo incapacidad / me dieron incapacidad
  'consultar_incapacidad', // ¿cómo va mi incapacidad?
  'consultar_nomina', // ¿cuánto voy a cobrar?
  'consultar_horas_extra', // ¿cuántas horas extra llevo?
  'consultar_horas_trabajadas', // ¿cuántas horas/días trabajé (en un rango)?
  'consultar_estatus_solicitud', // ¿ya aprobaron mi permiso?
  'saludo', // hola / buenos días
  'ayuda', // ¿qué puedo hacer?
  'desconocido',
];

const TOOL = {
  name: 'registrar_intencion',
  description:
    'Registra la intención del empleado y las entidades extraídas de su mensaje de WhatsApp.',
  input_schema: {
    type: 'object',
    properties: {
      intencion: { type: 'string', enum: INTENCIONES },
      confianza: { type: 'number', description: '0 a 1' },
      entidades: {
        type: 'object',
        properties: {
          fecha_inicio: { type: 'string', description: 'YYYY-MM-DD si aplica' },
          fecha_fin: { type: 'string', description: 'YYYY-MM-DD si aplica' },
          horas: { type: 'number', description: 'horas de permiso si aplica' },
          motivo: { type: 'string' },
          tipo: {
            type: 'string',
            description: 'para incapacidad/permiso: enfermedad, médico, personal, etc.',
          },
        },
      },
      respuesta_sugerida: {
        type: 'string',
        description: 'Respuesta breve y cordial en español mexicano para el empleado.',
      },
    },
    required: ['intencion', 'confianza'],
  },
};

function systemPrompt(hoy) {
  return `Eres el asistente de Recursos Humanos de una empresa mexicana que atiende empleados por WhatsApp.
Tu trabajo es identificar la INTENCIÓN del mensaje y extraer entidades (fechas, horas, motivo).
La fecha de hoy es ${hoy} (zona horaria America/Mexico_City).
Resuelve fechas relativas: "mañana", "el lunes", "la próxima semana", "en 3 días" → formato YYYY-MM-DD.
Sé tolerante a errores de ortografía y lenguaje coloquial ("ya llegue", "ia me boi", "kiero mis vacaciones").
Ejemplos de intención:
- "Entrada", "Llegué", "Ya estoy en la obra" → entrada
- "Salida", "Ya terminé", "Me retiro", "ya me voy" → salida
- "Necesito permiso mañana", "Saldré dos horas al médico", "llegaré tarde" → solicitar_permiso
- "¿Cuántas vacaciones me quedan?" → consultar_vacaciones
- "Quiero vacaciones del 5 al 10 de agosto" → solicitar_vacaciones
- "Tengo incapacidad", "me dieron 3 días de incapacidad" → reportar_incapacidad
- "¿Cuánto voy a cobrar esta semana?" → consultar_nomina
- "¿Cuántas horas extra llevo?" → consultar_horas_extra
- "¿Cuántas horas trabajé?", "¿cuántos días trabajé del 1 al 15?" → consultar_horas_trabajadas (extrae fecha_inicio y fecha_fin si el usuario da un rango)
- "¿Ya aprobaron mi permiso?" → consultar_estatus_solicitud
Usa SIEMPRE la herramienta registrar_intencion.`;
}

/**
 * Analiza un texto y devuelve { intencion, confianza, entidades, respuesta_sugerida }.
 * Si no hay API key configurada, cae a un clasificador por palabras clave.
 */
export async function analizarIntencion(texto, { hoy } = {}) {
  const fecha = hoy || new Date().toISOString().slice(0, 10);

  if (!client) {
    logger.warn('ANTHROPIC_API_KEY no configurada: usando clasificador de respaldo.');
    return fallbackClasificador(texto);
  }

  try {
    const res = await client.messages.create({
      model: config.ai.model,
      max_tokens: 500,
      system: systemPrompt(fecha),
      tools: [TOOL],
      tool_choice: { type: 'tool', name: 'registrar_intencion' },
      messages: [{ role: 'user', content: texto }],
    });
    const toolUse = res.content.find((c) => c.type === 'tool_use');
    if (!toolUse) return fallbackClasificador(texto);
    return { entidades: {}, ...toolUse.input };
  } catch (err) {
    logger.error({ err }, 'Error consultando Claude; usando respaldo');
    return fallbackClasificador(texto);
  }
}

// Clasificador simple por palabras clave (respaldo si falla la IA)
function fallbackClasificador(texto) {
  const t = (texto || '').toLowerCase();
  const has = (...ws) => ws.some((w) => t.includes(w));
  let intencion = 'desconocido';
  if (has('entrada', 'llegue', 'llegué', 'ya estoy', 'presente')) intencion = 'entrada';
  else if (has('salida', 'termine', 'terminé', 'me retiro', 'me voy', 'ya me voy'))
    intencion = 'salida';
  else if (has('permiso', 'llegare tarde', 'llegaré tarde', 'saldre', 'saldré'))
    intencion = 'solicitar_permiso';
  else if (has('cuantas vacaciones', 'cuántas vacaciones', 'dias de vacaciones'))
    intencion = 'consultar_vacaciones';
  else if (has('vacaciones')) intencion = 'solicitar_vacaciones';
  else if (has('incapacidad')) intencion = 'reportar_incapacidad';
  else if (has('cobrar', 'nomina', 'nómina', 'sueldo', 'pago')) intencion = 'consultar_nomina';
  else if (has('cuantas horas', 'cuántas horas', 'cuantos dias', 'cuántos días', 'horas trabaje', 'horas trabajadas', 'dias trabaje', 'días trabajados'))
    intencion = 'consultar_horas_trabajadas';
  else if (has('horas extra', 'tiempo extra')) intencion = 'consultar_horas_extra';
  else if (has('aprobaron', 'estatus', 'como va', 'cómo va')) intencion = 'consultar_estatus_solicitud';
  else if (has('hola', 'buenos', 'buenas', 'que tal')) intencion = 'saludo';
  return { intencion, confianza: 0.5, entidades: {}, respuesta_sugerida: null };
}
