import { useState } from 'react';
import { RadioTower } from 'lucide-react';
import type { GeograficoItem } from '../../types/dashboard.types';
import { formatNumber, formatPercent } from '../../utils/formatters';

interface Props {
  data: GeograficoItem[];
  selectedDepartamento?: string;
  onDepartmentSelect?: (departamento: string) => void;
}

const DEPARTMENTS = [
  {
    id: 'pando',
    name: 'Pando',
    path: 'M 150,100 L 450,80 L 330,250 L 120,200 Z',
    labelX: 270,
    labelY: 150,
    fill: '#797072',
  },
  {
    id: 'beni',
    name: 'Beni',
    path: 'M 450,80 L 700,120 L 820,320 L 550,450 L 370,360 L 330,250 Z',
    labelX: 550,
    labelY: 260,
    fill: '#8F977A',
  },
  {
    id: 'la-paz',
    name: 'La Paz',
    path: 'M 120,200 L 330,250 L 370,360 L 290,500 L 120,550 L 80,450 Z',
    labelX: 210,
    labelY: 370,
    fill: '#7B9567',
  },
  {
    id: 'cochabamba',
    name: 'Cochabamba',
    path: 'M 370,360 L 550,450 L 460,560 L 380,600 L 290,550 L 290,500 Z',
    labelX: 410,
    labelY: 490,
    fill: '#4A9777',
  },
  {
    id: 'santa-cruz',
    name: 'Santa Cruz',
    path: 'M 550,450 L 820,320 L 900,550 L 780,750 L 580,700 L 460,560 Z',
    labelX: 680,
    labelY: 530,
    fill: '#D49A4A',
  },
  {
    id: 'oruro',
    name: 'Oruro',
    path: 'M 120,550 L 290,500 L 290,550 L 250,680 L 130,680 Z',
    labelX: 210,
    labelY: 590,
    fill: '#9A8B58',
  },
  {
    id: 'potosi',
    name: 'Potosí',
    path: 'M 290,550 L 380,600 L 390,760 L 280,860 L 160,850 L 130,680 L 250,680 Z',
    labelX: 260,
    labelY: 720,
    fill: '#436A42',
  },
  {
    id: 'chuquisaca',
    name: 'Chuquisaca',
    path: 'M 380,600 L 460,560 L 580,700 L 520,820 L 390,760 Z',
    labelX: 480,
    labelY: 690,
    fill: '#527453',
  },
  {
    id: 'tarija',
    name: 'Tarija',
    path: 'M 390,760 L 520,820 L 450,950 L 280,860 Z',
    labelX: 400,
    labelY: 850,
    fill: '#3A4B53',
  },
];

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function findDeptData(
  data: GeograficoItem[],
  deptName: string
): GeograficoItem | undefined {
  return data.find(
    (item) =>
      normalize(item.nombre) === normalize(deptName) ||
      normalize(item.departamento) === normalize(deptName)
  );
}

function findDeptByName(deptName?: string) {
  if (!deptName || deptName === 'TODOS') return null;

  return DEPARTMENTS.find((dept) => normalize(dept.name) === normalize(deptName)) ?? null;
}

export default function BoliviaMap({
  data,
  selectedDepartamento = 'TODOS',
  onDepartmentSelect,
}: Props) {
  const [hoveredDeptId, setHoveredDeptId] = useState<string | null>(null);

  const selectedDept = findDeptByName(selectedDepartamento);
  const activeDept =
    DEPARTMENTS.find((dept) => dept.id === hoveredDeptId) ?? selectedDept;

  const activeMetrics = activeDept ? findDeptData(data, activeDept.name) : null;

  function handleDepartmentClick(departamento: string) {
    onDepartmentSelect?.(departamento);
  }

  const renderDept = (dept: (typeof DEPARTMENTS)[number]) => {
    const isHovered = hoveredDeptId === dept.id;
    const isSelected =
      selectedDept !== null && normalize(selectedDept.name) === normalize(dept.name);
    const isActive = isHovered || isSelected;

    return (
      <g
        key={dept.id}
        className={`bolivia-dept${isActive ? ' active' : ''}${
          isSelected ? ' selected' : ''
        }`}
        onMouseEnter={() => setHoveredDeptId(dept.id)}
        onMouseLeave={() => setHoveredDeptId(null)}
        onClick={() => handleDepartmentClick(dept.name)}
        role="button"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            handleDepartmentClick(dept.name);
          }
        }}
      >
        <path d={dept.path} fill={dept.fill} />
        <text
          x={dept.labelX}
          y={dept.labelY}
          textAnchor="middle"
          dominantBaseline="central"
        >
          {dept.name}
        </text>
      </g>
    );
  };

  return (
    <div className="bolivia-map-content">
      <div className="bolivia-svg-wrapper">
        <svg
          className="bolivia-map-svg"
          viewBox="40 40 900 950"
          xmlns="http://www.w3.org/2000/svg"
        >
          {DEPARTMENTS.map(renderDept)}
        </svg>
      </div>

      <div className="bolivia-map-info">
        {activeDept && activeMetrics ? (
          <>
            <div className="map-info-title">
              <RadioTower size={34} />
              <div>
                <span>
                  {selectedDept && normalize(selectedDept.name) === normalize(activeDept.name)
                    ? 'DEPARTAMENTO SELECCIONADO'
                    : 'DEPARTAMENTO ACTIVO'}
                </span>
                <strong>{activeDept.name}</strong>
              </div>
            </div>

            <div className="map-info-stats">
              <div>
                <span>VOTOS RRV</span>
                <strong>{formatNumber(activeMetrics.votosRRV)}</strong>
              </div>

              <div>
                <span>VOTOS OFICIAL</span>
                <strong>{formatNumber(activeMetrics.votosOficial)}</strong>
              </div>

              <div>
                <span>ACTAS PROCESADAS</span>
                <strong>{formatNumber(activeMetrics.actasProcesadas)}</strong>
              </div>

              <div>
                <span>PARTICIPACIÓN</span>
                <strong>{formatPercent(activeMetrics.participacion)}</strong>
              </div>
            </div>
          </>
        ) : activeDept ? (
          <div className="map-info-title">
            <RadioTower size={34} strokeWidth={1.5} />
            <div>
              <span>DEPARTAMENTO ACTIVO</span>
              <strong>{activeDept.name}</strong>
              <p className="map-info-note">
                No existen datos cargados para este departamento en el nivel actual.
              </p>
            </div>
          </div>
        ) : (
          <div className="map-info-title">
            <RadioTower size={34} strokeWidth={1.5} />
            <div>
              <span>MAPA INTERACTIVO</span>
              <strong>Bolivia</strong>
              <p className="map-info-note">
                Pasa el mouse sobre un departamento para ver sus datos. Haz click
                para filtrar la tabla y el gráfico territorial.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}