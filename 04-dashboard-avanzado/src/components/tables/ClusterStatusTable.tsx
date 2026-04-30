import type { ClusterStatus } from '../../types/dashboard.types';
import { formatDateTime, getStatusClass } from '../../utils/formatters';

interface ClusterStatusTableProps {
  data: ClusterStatus[];
}

export default function ClusterStatusTable({ data }: ClusterStatusTableProps) {
  return (
    <div className="table-wrapper">
      <table className="data-table">
        <thead>
          <tr>
            <th>Cluster</th>
            <th>Motor</th>
            <th>Nodo</th>
            <th>Rol</th>
            <th>Estado</th>
            <th>Latencia</th>
            <th>Última verificación</th>
            <th>Observación</th>
          </tr>
        </thead>

        <tbody>
          {data.map((cluster) => (
            <tr key={cluster.id}>
              <td>{cluster.cluster}</td>
              <td>{cluster.motor}</td>
              <td className="mono">{cluster.nodo}</td>
              <td>{cluster.rol}</td>
              <td>
                <span className={getStatusClass(cluster.estado)}>
                  {cluster.estado}
                </span>
              </td>
              <td>{cluster.latenciaMs} ms</td>
              <td>{formatDateTime(cluster.ultimaVerificacion)}</td>
              <td>{cluster.observacion}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}