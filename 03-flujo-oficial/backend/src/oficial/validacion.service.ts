import { Injectable } from '@nestjs/common';

export interface ValidationResult {
  regla: string;
  resultado: 'OK' | 'WARNING' | 'ERROR';
  mensaje: string;
  severidad: 'BAJA' | 'MEDIA' | 'ALTA' | 'CRITICA';
}

export interface VoteData {
  p1: number;
  p2: number;
  p3: number;
  p4: number;
  votosValidos: number;
  votosBlancos: number;
  votosNulos: number;
  papeletasAnfora: number;
  papeletasNoUtilizadas: number;
  habilitados: number;
  // Campos opcionales — sólo presentes en flujo CSV / formulario.
  aperturaHora?: number;
  aperturaMinutos?: number;
  cierreHora?: number;
  cierreMinutos?: number;
  observaciones?: string;
}

// Rango legal de apertura de mesa (Ley 026 / OEP). Tomado del validador RRV.
const APERTURA_HORA_MIN = 7;   // 07:00
const APERTURA_HORA_MAX = 10;  // hasta 10:59 sigue siendo apertura legal
const DURACION_MIN_MIN  = 8 * 60; // 8 horas mínimas de votación

// Patrones de observaciones del CSV que mapean a una categoría interna.
//
// El CSV ES la verdad oficial transcrita por el OEP. Si la columna
// `Observaciones` reporta una causal de la Ley 026, el acta se marca como
// OBSERVADA aunque los números calzen — fidelidad 100% al texto del CSV.
const OBS_PATTERNS: Array<{ regla: string; severidad: ValidationResult['severidad']; resultado: 'WARNING' | 'ERROR'; patrones: RegExp[]; resumen: string }> = [
  {
    regla: 'OBS_FORMULARIO_NO_OFICIAL',
    severidad: 'CRITICA',
    resultado: 'ERROR',
    patrones: [/formulari[oa]s? no oficial/i, /papeleta no oficial/i, /uso de formulari[oa]s? no oficial/i],
    resumen: 'El CSV reporta uso de formularios no oficiales (Ley 026, causal grave).',
  },
  {
    regla: 'OBS_PAPELETAS_NO_AUTORIZADAS',
    severidad: 'ALTA',
    resultado: 'ERROR',
    patrones: [/papeletas? no autorizadas?/i],
    resumen: 'El CSV reporta papeletas sin medidas de seguridad o diseño oficial del OEP.',
  },
  {
    regla: 'OBS_ACTA_DUPLICADA_REPORTADA',
    severidad: 'ALTA',
    resultado: 'ERROR',
    patrones: [/acta duplicada/i, /duplicaci[oó]n de acta/i],
    resumen: 'El CSV reporta posible duplicación de acta. Verificar con el código de mesa.',
  },
  {
    regla: 'OBS_INCONSISTENCIA_ARITMETICA',
    severidad: 'ALTA',
    resultado: 'ERROR',
    patrones: [/inconsistencias? aritm[eé]tic/i, /error aritm[eé]tic/i],
    resumen: 'El CSV reporta inconsistencia aritmética entre votos por candidato y totales.',
  },
  {
    regla: 'OBS_TACHADURA_O_ENMIENDA',
    severidad: 'MEDIA',
    resultado: 'ERROR',
    patrones: [/tachadur/i, /enmiend/i, /borr[oó]n/i, /alteraci[oó]n/i, /correcci[oó]n sin aclarar/i, /errores? de transcripci[oó]n/i],
    resumen: 'El CSV reporta tachaduras o enmiendas en casillas de resultados sin aclarar con "corre y vale".',
  },
  {
    regla: 'OBS_FALTA_FIRMAS_HUELLAS',
    severidad: 'MEDIA',
    resultado: 'ERROR',
    patrones: [/falta de firmas?/i, /falta de huellas?/i, /firmas?\s*(y|o)\s*huellas?/i],
    resumen: 'El CSV reporta falta de firmas o huellas de jurados electorales.',
  },
  {
    regla: 'OBS_DELEGADOS_AUSENTES',
    severidad: 'MEDIA',
    resultado: 'WARNING',
    patrones: [/ausencia de delegados/i, /delegados? ausentes?/i, /sin delegados?/i],
    resumen: 'El CSV reporta ausencia de delegados de organizaciones políticas acreditados.',
  },
  {
    regla: 'OBS_UBICACION_INCORRECTA',
    severidad: 'MEDIA',
    resultado: 'ERROR',
    patrones: [/mesa en lugar (distinto|diferente)/i, /ubicaci[oó]n incorrecta/i],
    resumen: 'El CSV reporta que la mesa funcionó en un recinto distinto al autorizado.',
  },
  {
    regla: 'OBS_FECHA_INCORRECTA',
    severidad: 'ALTA',
    resultado: 'ERROR',
    patrones: [/fecha incorrecta/i, /fecha de elecci[oó]n/i],
    resumen: 'El CSV reporta escrutinio realizado en fecha distinta a la oficial.',
  },
  {
    regla: 'OBS_FALTA_DATOS_HORARIO',
    severidad: 'MEDIA',
    resultado: 'WARNING',
    patrones: [/falta de datos de apertura/i, /falta de datos de cierre/i, /datos de apertura o cierre/i],
    resumen: 'El CSV reporta omisión de hora de apertura o cierre.',
  },
];

// Tolerancia para H4: aceptamos hasta 5 minutos por debajo de las 8h legales.
// 08:03 → 16:02 = 7h 59m no debe disparar; 06:00 → 13:00 (7h) sí debe.
const DURACION_TOLERANCIA_MIN = 5;

// Reglas oficiales (README — Reglas de Validación) + extensiones del validador RRV
// de tu amigo, adaptadas al flujo CSV (sin OCR/imágenes):
//
//   R1. P1..P4 >= 0
//   R2. VotosValidos = P1 + P2 + P3 + P4
//   R3. TotalVotos   = VotosValidos + VotosBlancos + VotosNulos
//   R4. TotalVotos  <= VotantesHabilitados
//   R5. TotalVotos   = PapeletasAnfora
//   R6. Habilitados / Papeletas / VotosBlancos / VotosNulos no negativos
//   R7. PapeletasAnfora + PapeletasNoUtilizadas = Habilitados   (papeletas entregadas)
//   H1. Hora apertura/cierre con formato válido (0..23 / 0..59)
//   H2. Cierre > apertura
//   H3. Apertura dentro de rango legal (07:00 .. 10:59)
//   H4. Duración de votación >= 8 horas
//   OBS_*. Categorización de observaciones del CSV (Ley 026): formulario no
//          oficial, papeletas no autorizadas, acta duplicada, inconsistencia
//          aritmética, tachaduras/enmiendas, falta de firmas/huellas,
//          delegados ausentes, ubicación incorrecta, fecha incorrecta, falta
//          de datos de horario. Si el CSV reporta una causal grave, el acta
//          va a OBSERVADA aunque los números calzen — fidelidad 100% al CSV.
//
// Acta con cualquier ERROR -> OBSERVADA + inconsistencia.
// Acta sin errores         -> VALIDADA.
// WARNING no degrada el estado, pero queda persistido para auditoría.
@Injectable()
export class ValidacionService {
  // Devuelve TODAS las reglas evaluadas (incluye OKs).
  // Para persistir y mostrar en UI usamos validateFailed() para evitar ruido.
  validateFailed(d: VoteData): ValidationResult[] {
    return this.validate(d).filter(r => r.resultado !== 'OK');
  }

  validate(d: VoteData): ValidationResult[] {
    const results: ValidationResult[] = [];
    const n = (v: any) => Number(v) || 0;

    const p1 = n(d.p1), p2 = n(d.p2), p3 = n(d.p3), p4 = n(d.p4);
    const validos = n(d.votosValidos);
    const blancos = n(d.votosBlancos);
    const nulos   = n(d.votosNulos);
    const anfora  = n(d.papeletasAnfora);
    const noUsadas = n(d.papeletasNoUtilizadas);
    const habilitados  = n(d.habilitados);
    const sumaPartidos = p1 + p2 + p3 + p4;
    const total        = validos + blancos + nulos;

    // ── R1. P1..P4 >= 0 ─────────────────────────────────────────────────────────
    const partidos: Array<[string, number]> = [['P1', p1], ['P2', p2], ['P3', p3], ['P4', p4]];
    for (const [label, val] of partidos) {
      results.push(val < 0
        ? { regla: `R1_VOTOS_NO_NEGATIVOS_${label}`, resultado: 'ERROR', mensaje: `${label} tiene valor negativo: ${val}`, severidad: 'ALTA' }
        : { regla: `R1_VOTOS_NO_NEGATIVOS_${label}`, resultado: 'OK',    mensaje: `${label} = ${val}`,                    severidad: 'BAJA' },
      );
    }

    // ── R6. Soporte no negativo (blancos, nulos, válidos, papeletas, habilitados)
    const soporte: Array<[string, number]> = [
      ['VOTOS_VALIDOS', validos],
      ['VOTOS_BLANCOS', blancos],
      ['VOTOS_NULOS',   nulos],
      ['PAPELETAS_ANFORA', anfora],
      ['PAPELETAS_NO_UTILIZADAS', noUsadas],
      ['HABILITADOS', habilitados],
    ];
    for (const [label, val] of soporte) {
      results.push(val < 0
        ? { regla: `R6_NO_NEGATIVO_${label}`, resultado: 'ERROR', mensaje: `${label} tiene valor negativo: ${val}`, severidad: 'ALTA' }
        : { regla: `R6_NO_NEGATIVO_${label}`, resultado: 'OK',    mensaje: `${label} = ${val}`,                    severidad: 'BAJA' },
      );
    }

    // ── R2. VotosValidos = P1 + P2 + P3 + P4 ────────────────────────────────────
    results.push(sumaPartidos !== validos
      ? { regla: 'R2_VOTOS_VALIDOS_IGUAL_SUMA_PARTIDOS', resultado: 'ERROR', mensaje: `VotosValidos (${validos}) != P1+P2+P3+P4 (${sumaPartidos})`,    severidad: 'CRITICA' }
      : { regla: 'R2_VOTOS_VALIDOS_IGUAL_SUMA_PARTIDOS', resultado: 'OK',    mensaje: `VotosValidos = ${validos} = P1+P2+P3+P4`,                       severidad: 'BAJA' },
    );

    // ── R3. TotalVotos = VotosValidos + VotosBlancos + VotosNulos ───────────────
    // Identidad derivada — sólo OK silencioso.
    results.push({
      regla:    'R3_TOTAL_VOTOS_IGUAL_VALIDOS_BLANCOS_NULOS',
      resultado:'OK',
      mensaje:  `TotalVotos = ${total}`,
      severidad:'BAJA',
    });

    // ── R4. TotalVotos <= VotantesHabilitados ───────────────────────────────────
    results.push(total > habilitados
      ? { regla: 'R4_TOTAL_VOTOS_MENOR_IGUAL_HABILITADOS', resultado: 'ERROR', mensaje: `TotalVotos (${total}) > Habilitados (${habilitados})`, severidad: 'CRITICA' }
      : { regla: 'R4_TOTAL_VOTOS_MENOR_IGUAL_HABILITADOS', resultado: 'OK',    mensaje: `TotalVotos (${total}) <= Habilitados (${habilitados})`, severidad: 'BAJA' },
    );

    // ── R5. TotalVotos = PapeletasAnfora ────────────────────────────────────────
    results.push(total !== anfora
      ? { regla: 'R5_TOTAL_VOTOS_IGUAL_PAPELETAS_ANFORA', resultado: 'ERROR', mensaje: `TotalVotos (${total}) != PapeletasAnfora (${anfora})`, severidad: 'ALTA' }
      : { regla: 'R5_TOTAL_VOTOS_IGUAL_PAPELETAS_ANFORA', resultado: 'OK',    mensaje: `TotalVotos = PapeletasAnfora = ${anfora}`,             severidad: 'BAJA' },
    );

    // ── R7. PapeletasAnfora + PapeletasNoUtilizadas = Habilitados ───────────────
    // (cuántas papeletas se entregaron a la mesa). Si todos los campos son 0, no
    // tiene sentido aplicarla — sólo cuando hay datos.
    if (habilitados > 0 && (anfora > 0 || noUsadas > 0)) {
      const entregadas = anfora + noUsadas;
      results.push(entregadas !== habilitados
        ? { regla: 'R7_PAPELETAS_ENTREGADAS_IGUAL_HABILITADOS', resultado: 'WARNING', mensaje: `Anfora+NoUtilizadas (${entregadas}) != Habilitados (${habilitados})`, severidad: 'MEDIA' }
        : { regla: 'R7_PAPELETAS_ENTREGADAS_IGUAL_HABILITADOS', resultado: 'OK',      mensaje: `Anfora+NoUtilizadas = Habilitados = ${habilitados}`,                  severidad: 'BAJA' },
      );
    }

    // ── H1..H4. Reglas horarias ────────────────────────────────────────────────
    const aH = n(d.aperturaHora), aM = n(d.aperturaMinutos);
    const cH = n(d.cierreHora),   cM = n(d.cierreMinutos);
    const tieneHoras = aH || aM || cH || cM;

    if (tieneHoras) {
      const formatoOk =
        aH >= 0 && aH <= 23 && aM >= 0 && aM <= 59 &&
        cH >= 0 && cH <= 23 && cM >= 0 && cM <= 59;

      results.push(formatoOk
        ? { regla: 'H1_HORA_FORMATO_VALIDO',  resultado: 'OK',    mensaje: `Apertura ${aH}:${aM} / Cierre ${cH}:${cM}`, severidad: 'BAJA' }
        : { regla: 'H1_HORA_FORMATO_INVALIDO', resultado: 'WARNING', mensaje: `Hora fuera de rango (apertura ${aH}:${aM}, cierre ${cH}:${cM})`, severidad: 'MEDIA' },
      );

      if (formatoOk) {
        const aTotal = aH * 60 + aM;
        const cTotal = cH * 60 + cM;

        results.push(cTotal <= aTotal
          ? { regla: 'H2_CIERRE_DESPUES_DE_APERTURA', resultado: 'WARNING', mensaje: `Cierre (${cH}:${cM}) <= Apertura (${aH}:${aM})`, severidad: 'ALTA' }
          : { regla: 'H2_CIERRE_DESPUES_DE_APERTURA', resultado: 'OK',      mensaje: `Cierre posterior a apertura`,                    severidad: 'BAJA' },
        );

        results.push(aH < APERTURA_HORA_MIN || aH > APERTURA_HORA_MAX
          ? { regla: 'H3_APERTURA_FUERA_RANGO_LEGAL', resultado: 'WARNING', mensaje: `Apertura ${aH}:${aM} fuera de ${APERTURA_HORA_MIN}:00..${APERTURA_HORA_MAX}:59`, severidad: 'MEDIA' }
          : { regla: 'H3_APERTURA_FUERA_RANGO_LEGAL', resultado: 'OK',      mensaje: `Apertura dentro del rango legal`,                                              severidad: 'BAJA' },
        );

        if (cTotal > aTotal) {
          const dur = cTotal - aTotal;
          const horas = Math.floor(dur / 60);
          const mins  = dur % 60;
          const fmt   = `${horas}h ${mins}m`;
          // Tolerancia: aceptamos hasta DURACION_TOLERANCIA_MIN minutos por debajo
          // de las 8h legales para evitar falsos positivos por minutos de retraso.
          results.push(dur < (DURACION_MIN_MIN - DURACION_TOLERANCIA_MIN)
            ? { regla: 'H4_DURACION_VOTACION_MINIMA', resultado: 'WARNING', mensaje: `Duración ${fmt} < 8h legales (tolerancia ${DURACION_TOLERANCIA_MIN}min)`, severidad: 'MEDIA' }
            : { regla: 'H4_DURACION_VOTACION_MINIMA', resultado: 'OK',      mensaje: `Duración ${fmt}`,                                                       severidad: 'BAJA' },
          );
        }
      }
    }

    // ── OBS_*. Categorización de observaciones del CSV ─────────────────────────
    const obs = String(d.observaciones || '').trim();
    if (obs) {
      for (const cat of OBS_PATTERNS) {
        const matched = cat.patrones.some(rx => rx.test(obs));
        if (matched) {
          results.push({
            regla: cat.regla,
            resultado: cat.resultado,
            mensaje: `${cat.resumen} (CSV: "${obs.slice(0, 100)}${obs.length > 100 ? '…' : ''}")`,
            severidad: cat.severidad,
          });
        }
      }
    }

    return results;
  }
}
