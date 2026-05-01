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
}

// 5 reglas oficiales (README — Reglas de Validación):
//   R1. P1, P2, P3, P4 >= 0
//   R2. VotosValidos = P1 + P2 + P3 + P4
//   R3. TotalVotos   = VotosValidos + VotosBlancos + VotosNulos
//   R4. TotalVotos  <= VotantesHabilitados
//   R5. TotalVotos   = PapeletasAnfora
//
// Acta con cualquier ERROR -> OBSERVADA + inconsistencia.
// Acta sin errores         -> VALIDADA.
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

    // Validación de soporte: votosValidos / blancos / nulos no negativos
    const soporte: Array<[string, number]> = [
      ['VOTOS_VALIDOS', validos],
      ['VOTOS_BLANCOS', blancos],
      ['VOTOS_NULOS',   nulos],
    ];
    for (const [label, val] of soporte) {
      results.push(val < 0
        ? { regla: `NO_NEGATIVO_${label}`, resultado: 'ERROR', mensaje: `${label} tiene valor negativo: ${val}`, severidad: 'ALTA' }
        : { regla: `NO_NEGATIVO_${label}`, resultado: 'OK',    mensaje: `${label} = ${val}`,                    severidad: 'BAJA' },
      );
    }

    // ── R2. VotosValidos = P1 + P2 + P3 + P4 ────────────────────────────────────
    results.push(sumaPartidos !== validos
      ? { regla: 'R2_VOTOS_VALIDOS_IGUAL_SUMA_PARTIDOS', resultado: 'ERROR', mensaje: `VotosValidos (${validos}) != P1+P2+P3+P4 (${sumaPartidos})`,    severidad: 'CRITICA' }
      : { regla: 'R2_VOTOS_VALIDOS_IGUAL_SUMA_PARTIDOS', resultado: 'OK',    mensaje: `VotosValidos = ${validos} = P1+P2+P3+P4`,                       severidad: 'BAJA' },
    );

    // ── R3. TotalVotos = VotosValidos + VotosBlancos + VotosNulos ───────────────
    // Es una identidad derivada — la dejamos sólo como OK silencioso (no se persiste por validateFailed).
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

    return results;
  }
}
