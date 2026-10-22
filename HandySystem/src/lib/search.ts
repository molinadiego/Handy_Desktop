export interface SearchOption {
  value: string;
  label: string;
  detail?: string;
}

function normalize(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase();
}

export function filterSearchOptions<T extends SearchOption>(options: T[], query: string): T[] {
  const needle = normalize(query.trim());
  if (!needle) return options;
  return options.filter((option) => normalize(`${option.label} ${option.detail ?? ""}`).includes(needle));
}

export function hasExactSearchOption(options: SearchOption[], query: string): boolean {
  const needle = normalize(query.trim());
  return Boolean(needle) && options.some((option) => normalize(option.label) === needle);
}
