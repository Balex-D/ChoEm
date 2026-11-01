import { analyzeCycles, shiftDay } from "./cycle/cycle-analysis.js";
import { vietnamDay } from "./dates.js";
export function reminderCalendar(state, daysBefore = 1, now = new Date()) {
  if (![0, 1, 2, 3, 7].includes(daysBefore))
    throw new Error("Thời gian nhắc không hợp lệ.");
  const next = analyzeCycles(state, vietnamDay(now)).nextPeriodStart;
  if (!next || next < vietnamDay(now))
    throw new Error(
      "Chưa có ngày dự kiến trong tương lai. Hãy cập nhật lịch trước.",
    );
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Cho Em//Reminder//VI",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:cho-em-${next}@cho-em.local`,
    `DTSTAMP:${now
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}Z$/, "Z")}`,
    `DTSTART;VALUE=DATE:${next.replaceAll("-", "")}`,
    `DTEND;VALUE=DATE:${shiftDay(next, 1).replaceAll("-", "")}`,
    "SUMMARY:Một chút thời gian cho mình",
    "CLASS:PRIVATE",
    "DESCRIPTION:Ngày dự kiến từ Cho Em. Hãy cập nhật lịch nếu có thay đổi.",
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    "DESCRIPTION:Một chút thời gian cho mình",
    `TRIGGER:-P${daysBefore}D`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ]
    .map(foldLine)
    .join("\r\n");
}
function foldLine(line) {
  let output = "",
    part = "";
  const encoder = new TextEncoder();
  for (const character of line) {
    if (encoder.encode(part + character).length > 75) {
      output += part + "\r\n";
      part = " ";
    }
    part += character;
  }
  return output + part;
}
