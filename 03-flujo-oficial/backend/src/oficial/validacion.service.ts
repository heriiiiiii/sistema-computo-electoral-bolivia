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

@Injectable()
export class ValidacionService {
  validate(d: VoteData): ValidationResult[] {
    const results: ValidationResult[] = [];
    const n = (v: any) => Number(v) || 0;

    const p1 = n(d.p1), p2 = n(d.p2), p3 = n(d.p3), p4 = n(d.p4);
    const validos = n(d.votosValidos), blancos = n(d.votosBlancos), nulos = n(d.votosNulos);
    const anfora = n(d.papeletasAnfora), habilitados = n(d.habilitados);
    const pSum = p1 + p2 + p3 + p4;
    const total = validos + blancos + nulos;

    // Votos no negativos por partido
    [['P1', p1], ['P2', p2], ['P3', p3], ['P4', p4]].forEach(([label, val]: any) => {
      results.push(val < 0
        ? { regla: `VOTOS_NO_NEGATIVOS_${label}`, resultado: 'ERROR', mensaje: `${label} tiene valor negativo: ${val}`, severidad: 'ALTA' }
        : { regla: `VOTOS_NO_NEGATIVOS_${label}`, resultado: 'OK', mensaje: `${label} = ${val}`, severidad: 'BAJA' },
      );
    });

    // Votos validos/blancos/nulos no negativos
    [['VOTOS_VALIDOS', validos], ['VOTOS_BLANCOS', blancos], ['VOTOS_NULOS', nulos]].forEach(([label, val]: any) => {
      results.push(val < 0
        ? { regla: `NO_NEGATIVO_${label}`, resultado: 'ERROR', mensaje: `${label} tiene valor negativo: ${val}`, severidad: 'ALTA' }
        : { regla: `NO_NEGATIVO_${label}`, resultado: 'OK', mensaje: `${label} = ${val}`, severidad: 'BAJA' },
      );
    });

    // Suma partidos = votos validos
    results.push(pSum !== validos
      ? { regla: 'SUMA_PARTIDOS_IGUAL_VOTOS_VALIDOS', resultado: 'ERROR', mensaje: `Suma partidos (${pSum}) ≠ VotosValidos (${validos})`, severidad: 'CRITICA' }
      : { regla: 'SUMA_PARTIDOS_IGUAL_VOTOS_VALIDOS', resultado: 'OK', mensaje: `Suma partidos = ${pSum}`, severidad: 'BAJA' },
    );

    // Total <= habilitados
    results.push(total > habilitados
      ? { regla: 'TOTAL_MENOR_IGUAL_HABILITADOS', resultado: 'ERROR', mensaje: `TotalVotos (${total}) > Habilitados (${habilitados})`, severidad: 'CRITICA' }
      : { regla: 'TOTAL_MENOR_IGUAL_HABILITADOS', resultado: 'OK', mensaje: `TotalVotos (${total}) <= Habilitados (${habilitados})`, severidad: 'BAJA' },
    );

    // Total = papeletas en anfora
    results.push(total !== anfora
      ? { regla: 'TOTAL_IGUAL_PAPELETAS_ANFORA', resultado: 'WARNING', mensaje: `TotalVotos (${total}) ≠ PapeletasAnfora (${anfora})`, severidad: 'MEDIA' }
      : { regla: 'TOTAL_IGUAL_PAPELETAS_ANFORA', resultado: 'OK', mensaje: `TotalVotos = PapeletasAnfora = ${anfora}`, severidad: 'BAJA' },
    );

    return results;
  }
}
