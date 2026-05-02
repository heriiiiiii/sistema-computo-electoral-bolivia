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
            <th>Código mesa</th>
            <th>Recinto</th>
            <th>Municipio</th>
            <th>Departamento</th>
            <th>Fuente</th>
            <th>Estado</th>
            <th>Fecha</th>
          </tr>
        </thead>

        <tbody>
          {data.length === 0 ? (
            <tr>
              <td colSpan={8}>No existen actas para los filtros seleccionados.</td>
            </tr>
          ) : (
            data.map((acta) => (
              <tr key={`${acta.fuente}-${acta.id}`}>
                <td>{acta.id}</td>
                <td>{acta.codigoMesa}</td>
                <td>{acta.recinto || '—'}</td>
                <td>{acta.municipio || '—'}</td>
                <td>{acta.departamento || '—'}</td>
                <td>
                  <span className="status-pill info">
                    {acta.fuente}
                  </span>
                </td>
                <td>
                  <span className={getStatusClass(acta.estado)}>
                    {acta.estado}
                  </span>
                </td>
                <td>{formatDateTime(acta.fecha)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}