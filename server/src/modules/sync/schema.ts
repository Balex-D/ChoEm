// @ts-ignore Shared timezone helper.
import { vietnamDay } from "../../../../shared/dates.js";
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
    symptomSuggestions: z
      .array(z.string().trim().min(1).max(60))
      .max(50)
      .default(["Đau bụng", "Đau lưng", "Đau đầu", "Căng ngực"]),
    starts: z.array(dateSchema).max(1000),
    ends: z.record(dateSchema, dateSchema),
    intimacyDates: z.array(dateSchema).max(10000).optional(),
    periodEstimates: z
      .record(dateSchema, z.number().int().min(1).max(1000))
      .default({}),
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
        symptoms: z.array(z.string().trim().min(1).max(60)).max(50).default([]),
        note: z.string().max(2000).default(""),
        shared: z.boolean().default(false),
        pain: z.number().int().min(0).max(10).nullable().default(null),
        flow: z.enum(["", "spotting", "light", "medium", "heavy"]).default(""),
        needs: z
          .array(z.enum(["listen", "rest", "company"]))
          .max(3)
          .transform((x) => [...new Set(x)])
          .default([]),
        needsShared: z.boolean().default(false),
        needsText: z.string().trim().max(500).default(""),
      }),
    ),
    privacy: z.object({
      cycle: z.boolean(),
      mood: z.boolean(),
      notes: z.boolean(),
      symptoms: z.boolean().default(false),
      paused: z.boolean().default(false),
      intimacy: z.boolean().default(false),
      intimacyEdit: z.boolean().default(false),
    }),
  })
  .superRefine((state, ctx) => {
    const error = (message: string) =>
      ctx.addIssue({ code: "custom", message });
    if (new Set(state.starts).size !== state.starts.length)
      error("Ngày bắt đầu bị trùng");
    if (
      Object.keys(state.entries).length > 10000 ||
      Object.keys(state.ends).length > 1000
    )
      error("Quá nhiều bản ghi");
    const today = vietnamDay();
    if (
      state.intimacyDates &&
      (new Set(state.intimacyDates).size !== state.intimacyDates.length ||
        state.intimacyDates.some((date) => date > today))
    )
      error("Ngày quan hệ phải là ngày đã diễn ra và không được trùng.");
    for (const start of state.starts)
      if (start > today) error("Ngày bắt đầu không thể ở tương lai");
    const sorted = [...state.starts].sort();
    for (const [start, duration] of Object.entries(state.periodEstimates)) {
      if (!state.starts.includes(start))
        error("Ước tính không có kỳ kinh tương ứng");
      const expected = new Date(
        Date.parse(start + "T12:00:00Z") + (duration - 1) * 86400000,
      )
        .toISOString()
        .slice(0, 10);
      if (state.ends[start] && state.ends[start] !== expected)
        error("Ngày kết thúc ước tính không khớp thời lượng");
      const next = sorted[sorted.indexOf(start) + 1];
      if (next && expected >= next) error("Các kỳ kinh không được chồng ngày");
    }
    for (const [start, end] of Object.entries(state.ends)) {
      if (
        !state.starts.includes(start) ||
        end < start ||
        (end > today && !state.periodEstimates[start])
      )
        error("Ngày kết thúc không hợp lệ");
      const next = sorted[sorted.indexOf(start) + 1];
      if (next && end >= next) error("Các kỳ kinh không được chồng ngày");
    }
  });
export type CycleForecast = {
  anchor: string;
  start: string;
  end: string;
  issuedAt: string;
};
export type AppState = z.infer<typeof stateSchema> & {
  forecasts?: CycleForecast[];
};
export const writeSchema = z.object({
  revision: z.number().int().min(0).max(2147483646),
  state: stateSchema,
});
