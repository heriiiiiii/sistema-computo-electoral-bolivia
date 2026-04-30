import { Eye } from 'lucide-react';
import type { ActaDigitalizada } from '../../types/dashboard.types';
import { formatDateTime, getStatusClass } from '../../utils/formatters';

interface ActasTableProps {
  data: ActaDigitalizada[];
}

export default function ActasTable({ data }: ActasTableProps) {
  return (
    <div className="table-wrapper">
      <table className="data-table">
        <thead>
          <tr>
            <th>Acta ID</th>
            <th>Código Mesa</th>
            <th>Recinto</th>
            <th>Municipio</th>
            <th>Departamento</th>
            <th>Fuente</th>
            <th>Estado</th>
            <th>Fecha</th>
            <th>Acción</th>
          </tr>
        </thead>

        <tbody>
          {data.map((acta) => (
            <tr key={acta.id}>
              <td className="mono">{acta.id}</td>
              <td className="mono">{acta.codigoMesa}</td>
              <td>{acta.recinto}</td>
              <td>{acta.municipio}</td>
              <td>{acta.departamento}</td>
              <td>
                <span className="source-pill">{acta.fuente}</span>
              </td>
              <td>
                <span className={getStatusClass(acta.estado)}>{acta.estado}</span>
              </td>
              <td>{formatDateTime(acta.fecha)}</td>
              <td>
                <button type="button" className="table-action">
                  <Eye size={15} />
                  Ver detalle
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}