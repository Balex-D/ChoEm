export const CALENDAR_PATH =
  '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 11h18m-13 4h1m3 0h1m3 0h1m-9 3h1m3 0h1"/>';
export function calendarIcon() {
  return `<span class="icon" aria-hidden="true"><svg viewBox="0 0 24 24">${CALENDAR_PATH}</svg></span>`;
}
export const JOURNAL_PATH =
  '<path d="M4 4h12a3 3 0 0 1 3 3v14H7a3 3 0 0 1-3-3Zm0 13h15M8 8h7m-7 4h5"/>';
export function journalIcon() {
  return `<span class="icon" aria-hidden="true"><svg viewBox="0 0 24 24">${JOURNAL_PATH}</svg></span>`;
}
