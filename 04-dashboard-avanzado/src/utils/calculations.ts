export function calcularDiferencia(valorRRV: number, valorOficial: number): number {
  return Math.abs(valorRRV - valorOficial);
}

export function calcularDiferenciaFirmada(
  valorRRV: number,
  valorOficial: number
): number {
  return valorRRV - valorOficial;
}

export function calcularDiferenciaPorcentual(
  valorRRV: number,
  valorOficial: number
): number {
  const diferencia = Math.abs(valorRRV - valorOficial);

  /**
   * Si Oficial existe, usamos Oficial como referencia.
   * Si Oficial es 0 pero RRV tiene datos, usamos RRV para evitar devolver 0 falso.
   * Si ambos son 0, la diferencia porcentual es 0.
   */
  const base = valorOficial > 0 ? valorOficial : valorRRV;

  if (base === 0) return 0;

  return (diferencia / base) * 100;
}

export function calcularTotalVotos(params: {
  votosValidos: number;
  votosBlancos: number;
  votosNulos: number;
}): number {
  return params.votosValidos + params.votosBlancos + params.votosNulos;
}

export function calcularMargenVictoria(
  resultados: Array<{ nombre: string; votos: number }>
): number {
  const resultadosValidos = resultados.filter((item) => item.votos > 0);

  if (resultadosValidos.length < 2) return 0;

  const ordenados = [...resultadosValidos].sort((a, b) => b.votos - a.votos);
  const primero = ordenados[0];
  const segundo = ordenados[1];
  const total = resultadosValidos.reduce((acc, item) => acc + item.votos, 0);

  if (total === 0) return 0;

  return ((primero.votos - segundo.votos) / total) * 100;
}

export function calcularConfiabilidadRRV(params: {
  actasValidadas: number;
  actasProcesadas: number;
  actasSospechosas: number;
  actasRechazadas: number;
}): number {
  const { actasValidadas, actasProcesadas, actasSospechosas, actasRechazadas } =
    params;

  if (actasProcesadas === 0) return 0;

  const penalizacion = actasSospechosas * 0.6 + actasRechazadas;
  const score = ((actasValidadas - penalizacion) / actasProcesadas) * 100;

  return Math.max(0, Math.min(100, score));
}