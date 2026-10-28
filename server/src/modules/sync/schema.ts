import { z } from "zod";
export const dateSchema = z
  .string()
  .regex(/^(19|20|21)\d{2}-\d{2}-\d{2}$/)
  .refine((s) => {
    const d = new Date(s + "T12:00:00Z");
    return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, "Ngày không hợp lệ");
export const stateSchema = z
  .object({
    name: z.string().trim().min(1).max(24),
    length: z.number().int().min(15).max(90),
    duration: z.number().int().min(1).max(15),
    starts: z.array(dateSchema).max(1000),
    ends: z.record(dateSchema, dateSchema),
    entries: z.record(
      dateSchema,
      z.object({
        mood: z
          .enum([
            "",
            "Vui vẻ",
            "Yêu đời",
            "Mệt mỏi",
            "Buồn chút",
            "Cáu kỉnh",
            "Nhạy cảm",
          ])
          .default(""),
        symptoms: z
          .array(z.enum(["Đau bụng", "Đau lưng", "Đau đầu", "Căng ngực"]))
          .max(4)
          .default([]),
        note: z.string().max(2000).default(""),
      }),
    ),
    privacy: z.object({
      cycle: z.boolean(),
      mood: z.boolean(),
      notes: z.boolean(),
    }),
  })
  .superRefine((state, ctx) => {
    const error = (message: string) =>
      ctx.addIssue({ code: "custom", message });
    if (state.duration >= state.length)
      error("Số ngày hành kinh phải nhỏ hơn chu kỳ");
    if (new Set(state.starts).size !== state.starts.length)
      error("Ngày bắt đầu bị trùng");
    if (
      Object.keys(state.entries).length > 10000 ||
      Object.keys(state.ends).length > 1000
    )
      error("Quá nhiều bản ghi");
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Ho_Chi_Minh",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    for (const start of state.starts)
      if (start > today) error("Ngày bắt đầu không thể ở tương lai");
    const sorted = [...state.starts].sort();
    for (const [start, end] of Object.entries(state.ends)) {
      if (!state.starts.includes(start) || end < start || end > today)
        error("Ngày kết thúc không hợp lệ");
      const next = sorted[sorted.indexOf(start) + 1];
      if (next && end >= next) error("Các kỳ kinh không được chồng ngày");
    }
  });
export type AppState = z.infer<typeof stateSchema>;
export const writeSchema = z.object({
  revision: z.number().int().min(0).max(2147483646),
  state: stateSchema,
});
