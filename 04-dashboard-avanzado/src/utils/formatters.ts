export function formatNumber(value: number): string {
  return new Intl.NumberFormat('es-BO').format(value);
}

export function formatPercent(value: number, decimals = 2): string {
  return `${value.toFixed(decimals)}%`;
}

export function formatDateTime(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'Fecha no disponible';
  }

  return new Intl.DateTimeFormat('es-BO', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(date);
}

export function getStatusClass(status: string): string {
  return `status status-${status.toLowerCase().replace(/_/g, '-')}`;
}

export function getSeverityClass(severity: string): string {
  return `severity severity-${severity.toLowerCase()}`;
}

export function formatTooltipValue(value: unknown): string {
  if (typeof value === 'number') {
    return formatNumber(value);
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? value : formatNumber(parsed);
  }

  return '';
}