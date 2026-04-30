import type { ComparacionResultado } from '../../types/dashboard.types';
import { formatNumber, formatPercent, getStatusClass } from '../../utils/formatters';

interface ComparacionTableProps {
  data: ComparacionResultado[];
}

export default function ComparacionTable({ data }: ComparacionTableProps) {
  return (
    <div className="table-wrapper">
      <table className="data-table">
        <thead>
          <tr>
            <th>Partido</th>
            <th>Candidato</th>
            <th>Votos RRV</th>
            <th>Votos Oficial</th>
            <th>Diferencia</th>
            <th>Diferencia %</th>
            <th>Estado</th>
          </tr>
        </thead>

        <tbody>
          {data.map((row) => (
            <tr key={row.partido}>
              <td>
                <span className="party-pill" style={{ borderColor: row.color }}>
                  {row.partido}
                </span>
              </td>
              <td>{row.candidato}</td>
              <td>{formatNumber(row.votosRRV)}</td>
              <td>{formatNumber(row.votosOficial)}</td>
              <td>{formatNumber(row.diferencia)}</td>
              <td>{formatPercent(row.diferenciaPorcentual)}</td>
              <td>
                <span className={getStatusClass(row.estado)}>{row.estado}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}