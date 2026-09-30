type QueryValue = string | undefined;

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const firstValue = (value: unknown): QueryValue => {
  if (Array.isArray(value)) {
    return value.length > 0 ? String(value[0]) : undefined;
  }

  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  return String(value);
};

const parseOffset = (value: unknown) => {
  const rawOffset = firstValue(value);
  if (!rawOffset) return 0;

  const offset = Number(rawOffset);
  return Number.isFinite(offset) ? offset : 0;
};

const parseDateBoundary = (
  value: unknown,
  boundary: 'start' | 'end',
  timezoneOffsetMinutes: number
) => {
  const rawDate = firstValue(value);
  if (!rawDate) return undefined;

  if (DATE_ONLY_PATTERN.test(rawDate)) {
    const [year, month, day] = rawDate.split('-').map(Number);
    const utcHour = boundary === 'start' ? 0 : 23;
    const utcMinute = boundary === 'start' ? 0 : 59;
    const utcSecond = boundary === 'start' ? 0 : 59;
    const utcMs = boundary === 'start' ? 0 : 999;
    const timestamp =
      Date.UTC(year, month - 1, day, utcHour, utcMinute, utcSecond, utcMs) +
      timezoneOffsetMinutes * 60_000;

    return new Date(timestamp);
  }

  const parsed = new Date(rawDate);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
};

export const getLeadDateFilter = (query: Record<string, unknown>) => {
  const timezoneOffsetMinutes = parseOffset(query.timezoneOffsetMinutes);
  const filter: Record<string, Record<string, Date>> = {};

  const addRange = (field: 'createdAt' | 'updatedAt' | 'lastContactedAt', from: unknown, to: unknown) => {
    const start = parseDateBoundary(from, 'start', timezoneOffsetMinutes);
    const end = parseDateBoundary(to, 'end', timezoneOffsetMinutes);
    if (!start && !end) return;

    const range: Record<string, Date> = {};
    if (start) range.$gte = start;
    if (end) range.$lte = end;
    filter[field] = range;
  };

  addRange('createdAt', query.createdFromDate, query.createdToDate);
  addRange('updatedAt', query.modifiedFromDate, query.modifiedToDate);
  addRange('lastContactedAt', query.lastContactedFromDate, query.lastContactedToDate);

  // Preserve the original single-field date API used by dashboard and analytics screens.
  const exactDate = firstValue(query.date);
  const legacyFrom = exactDate || query.fromDate;
  const legacyTo = exactDate || query.toDate;
  const legacyField = firstValue(query.dateField) === 'updatedAt' ? 'updatedAt' : 'createdAt';
  if (!filter[legacyField]) addRange(legacyField, legacyFrom, legacyTo);

  return filter;
};

export const applyLeadDateFilter = (filter: Record<string, unknown>, query: Record<string, unknown>) => {
  Object.assign(filter, getLeadDateFilter(query));
};
