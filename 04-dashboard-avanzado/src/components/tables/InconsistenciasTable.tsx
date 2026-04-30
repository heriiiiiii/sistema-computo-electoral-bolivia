import type { Inconsistencia } from '../../types/dashboard.types';
import {
  formatDateTime,
  getSeverityClass,
  getStatusClass
} from '../../utils/formatters';

interface InconsistenciasTableProps {
  data: Inconsistencia[];
}

export default function InconsistenciasTable({ data }: InconsistenciasTableProps) {
  return (
    <div className="table-wrapper">
      <table className="data-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Origen</th>
            <th>Tipo</th>
            <th>Severidad</th>
            <th>Estado</th>
            <th>Mesa</th>
            <th>Ubicación</th>
            <th>Descripción</th>
            <th>Fecha</th>
          </tr>
        </thead>

        <tbody>
          {data.map((item) => (
            <tr key={item.id}>
              <td className="mono">{item.id}</td>
              <td>{item.origen}</td>
              <td>{item.tipo}</td>
              <td>
                <span className={getSeverityClass(item.severidad)}>
                  {item.severidad}
                </span>
              </td>
              <td>
                <span className={getStatusClass(item.estado)}>{item.estado}</span>
              </td>
              <td className="mono">{item.codigoMesa}</td>
              <td>
                {item.municipio}, {item.departamento}
              </td>
              <td>{item.descripcion}</td>
              <td>{formatDateTime(item.fecha)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}