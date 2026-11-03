export const MOODS = [
  "",
  "Vui vẻ",
  "Yêu đời",
  "Mệt mỏi",
  "Buồn chút",
  "Cáu kỉnh",
  "Nhạy cảm",
];
export const FLOW_LABELS = {
  "": "Chưa ghi nhận",
  spotting: "Lấm tấm",
  light: "Ít",
  medium: "Vừa",
  heavy: "Nhiều",
};
export const NEED_LABELS = {
  listen: "Muốn được lắng nghe",
  rest: "Cần nghỉ ngơi",
  company: "Muốn có người bên cạnh",
};
export function checkinEntry(input, previous = {}) {
  input = { ...previous, ...input };
  const pain =
    input.pain === "" || input.pain == null ? null : Number(input.pain);
  const symptoms = input.symptoms || [];
  const needs = input.needs || [];
  const needsText = input.needsText ?? "";
  if (
    !MOODS.includes(input.mood ?? "") ||
    !Object.hasOwn(FLOW_LABELS, input.flow ?? "") ||
    (pain !== null && (!Number.isInteger(pain) || pain < 0 || pain > 10)) ||
    !Array.isArray(symptoms) ||
    symptoms.length > 50 ||
    !symptoms.every(
      (s) => typeof s === "string" && s.trim() && s.trim().length <= 60,
    ) ||
    !Array.isArray(needs) ||
    needs.length > 3 ||
    !needs.every((n) => Object.hasOwn(NEED_LABELS, n)) ||
    typeof (input.note ?? "") !== "string" ||
    (input.note ?? "").length > 2000 ||
    typeof needsText !== "string" ||
    needsText.length > 500
  )
    throw new Error("Em kiểm tra lại nội dung vừa ghi nhé.");
  return {
    ...previous,
    mood: input.mood ?? "",
    symptoms: [...new Set(symptoms.map((s) => s.trim()))],
    note: input.note ?? "",
    pain,
    flow: input.flow ?? "",
    needs: [...new Set(needs)],
    needsText: needsText.trim(),
    shared: Boolean(input.shared),
    needsShared:
      (needs.length > 0 || Boolean(needsText.trim())) &&
      Boolean(input.needsShared),
  };
}
