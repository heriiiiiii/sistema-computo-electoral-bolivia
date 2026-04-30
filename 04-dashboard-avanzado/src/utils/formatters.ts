export function formatNumber(value: number | string | null | undefined): string {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return '0';
  }

  return new Intl.NumberFormat('es-BO').format(parsed);
}

export function formatPercent(
  value: number | string | null | undefined,
  decimals = 2
): string {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return `${(0).toFixed(decimals)}%`;
  }

  return `${parsed.toFixed(decimals)}%`;
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return 'Fecha no disponible';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'Fecha no disponible';
  }

  return new Intl.DateTimeFormat('es-BO', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(date);
}

export function getStatusClass(status: string | null | undefined): string {
  const safeStatus = status || 'SIN_ESTADO';

  return `status status-${safeStatus.toLowerCase().replace(/_/g, '-')}`;
}

export function getSeverityClass(severity: string | null | undefined): string {
  const safeSeverity = severity || 'MEDIA';

  return `severity severity-${safeSeverity.toLowerCase()}`;
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