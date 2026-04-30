export function calcularDiferencia(valorRRV: number, valorOficial: number): number {
  return Math.abs(valorRRV - valorOficial);
}

export function calcularDiferenciaPorcentual(
  valorRRV: number,
  valorOficial: number
): number {
  if (valorOficial === 0) return 0;
  return (Math.abs(valorRRV - valorOficial) / valorOficial) * 100;
}

export function calcularMargenVictoria(
  resultados: Array<{ nombre: string; votos: number }>
): number {
  if (resultados.length < 2) return 0;

  const ordenados = [...resultados].sort((a, b) => b.votos - a.votos);
  const primero = ordenados[0];
  const segundo = ordenados[1];
  const total = resultados.reduce((acc, item) => acc + item.votos, 0);

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