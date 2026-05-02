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
            <th>Candidato</th>
            <th>Votos RRV</th>
            <th>Votos Oficial</th>
            
            <th>Estado</th>
          </tr>
        </thead>

        <tbody>
          {data.map((row) => (
            <tr key={row.candidato || row.partido}>
              <td>
                <span className="party-pill" style={{ borderColor: row.color }}>
                  {row.candidato || row.partido || 'Sin dato'}
                </span>
              </td>

              <td>{formatNumber(row.votosRRV)}</td>
              <td>{formatNumber(row.votosOficial)}</td>
              

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