/**
 * Today as an ISO date in the viewer's own timezone.
 *
 * Deliberately not `toISOString().slice(0, 10)` — that returns the UTC date,
 * which is the previous day for anyone in IST before 05:30. For a product
 * answering "what is on tonight", being a day out is the worst possible bug.
 */
export function todayISO(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}
