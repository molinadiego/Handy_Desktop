interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

function zonedParts(date: Date, timeZone: string): ZonedParts {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  return { year: value("year"), month: value("month"), day: value("day"), hour: value("hour"), minute: value("minute") };
}

function utcLike(parts: ZonedParts): number {
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
}

export function utcToDateTimeLocal(value: string | null | undefined, timeZone: string): string {
  if (!value) return "";
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) return "";
  const parts = zonedParts(instant, timeZone);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}T${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;
}

export function dateTimeLocalToUtc(value: string, timeZone: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new Error("Ingresa una fecha y hora de visita válidas.");
  const target: ZonedParts = {
    year: Number(match[1]), month: Number(match[2]), day: Number(match[3]),
    hour: Number(match[4]), minute: Number(match[5]),
  };
  let instant = utcLike(target);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const offset = utcLike(zonedParts(new Date(instant), timeZone)) - instant;
    instant += utcLike(target) - instant - offset;
  }
  const resolved = zonedParts(new Date(instant), timeZone);
  if (utcLike(resolved) !== utcLike(target)) {
    throw new Error("Esa hora no existe en la zona horaria configurada por el cambio de horario.");
  }
  return new Date(instant).toISOString();
}

export function formatWorkspaceDateTime(value: string, locale: string, timeZone: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone }).format(new Date(value));
}
