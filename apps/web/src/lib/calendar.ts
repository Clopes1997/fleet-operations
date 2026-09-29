export const formatDate = (iso: string) => iso.replace(/-/g, "/");
export function parseDate(value: string): string {
  if (!/^\d{4}\/\d{2}\/\d{2}$/.test(value)) throw new Error("Use aaaa/mm/dd");
  const [year, month, day] = value.split("/").map(Number);
  const iso = value.replace(/\//g, "-");
  if (year < 1900 || year > 2100 || new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10) !== iso) throw new Error("Data inválida");
  return iso;
}
