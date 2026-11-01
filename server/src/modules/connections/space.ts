import { z } from "zod";
import type { Database, Queryable } from "../../db/database.js";
import { HttpError } from "../../common/errors.js";
import { dateSchema } from "../sync/schema.js";

export const spacePatchSchema = z
  .object({
    revision: z.number().int().min(0).max(2147483646),
    anniversary: dateSchema.nullable().optional(),
    message: z.string().trim().max(1000).optional(),
  })
  .strict()
  .refine(
    (input) => Object.keys(input).some((key) => key !== "revision"),
    "Chưa có thay đổi để lưu",
  );
type SpacePatch = z.infer<typeof spacePatchSchema>;

async function membership(
  q: Queryable,
  connectionId: string,
  userId: string,
  write = false,
) {
  const {
    rows: [link],
  } = await q.query(
    `SELECT owner_id,companion_id FROM connections WHERE id=$1 AND (owner_id=$2 OR companion_id=$2) FOR ${write ? "UPDATE" : "SHARE"}`,
    [connectionId, userId],
  );
  if (!link)
    throw new HttpError(
      404,
      "NOT_FOUND",
      "Kết nối không còn tồn tại hoặc không thuộc tài khoản này.",
    );
  return link.owner_id === userId ? ("owner" as const) : ("companion" as const);
}
async function read(q: Queryable, connectionId: string) {
  const {
    rows: [row],
  } = await q.query(
    "SELECT anniversary::text,messages,revision FROM connection_spaces WHERE connection_id=$1",
    [connectionId],
  );
  return row
    ? {
        space: {
          anniversary: row.anniversary,
          messages: row.messages,
        },
        revision: row.revision as number,
      }
    : {
        space: {
          anniversary: null,
          messages: { owner: "", companion: "" },
        },
        revision: 0,
      };
}
function response(
  current: Awaited<ReturnType<typeof read>>,
  role: "owner" | "companion",
) {
  return {
    space: {
      anniversary: current.space.anniversary,
      message: current.space.messages.companion || "",
    },
    revision: current.revision,
    role,
  };
}
export async function getConnectionSpace(
  db: Database,
  connectionId: string,
  userId: string,
) {
  return db.transaction(async (q) => {
    const role = await membership(q, connectionId, userId);
    return response(await read(q, connectionId), role);
  });
}
export async function updateConnectionSpace(
  db: Database,
  connectionId: string,
  userId: string,
  input: SpacePatch,
) {
  return db.transaction(async (q) => {
    const role = await membership(q, connectionId, userId, true);
    if (input.message !== undefined && role !== "companion")
      throw new HttpError(
        403,
        "COMPANION_ONLY",
        "Chỉ Anh được cập nhật lời nhắn gửi Em.",
      );
    const current = await read(q, connectionId);
    if (current.revision !== input.revision)
      throw new HttpError(
        409,
        "SPACE_CONFLICT",
        "Thông tin vừa được cập nhật. Bản nháp vẫn được giữ; tải bản mới trước khi sửa tiếp.",
      );
    const space = {
      anniversary:
        input.anniversary === undefined
          ? current.space.anniversary
          : input.anniversary,
      messages: {
        ...current.space.messages,
        ...(input.message === undefined ? {} : { companion: input.message }),
      },
    };
    await q.query(
      `INSERT INTO connection_spaces(connection_id,anniversary,messages,revision) VALUES($1,$2,$3::jsonb,$4)
      ON CONFLICT(connection_id) DO UPDATE SET anniversary=excluded.anniversary,messages=excluded.messages,revision=excluded.revision,updated_at=now()`,
      [
        connectionId,
        space.anniversary,
        JSON.stringify(space.messages),
        current.revision + 1,
      ],
    );
    return response({ space, revision: current.revision + 1 }, role);
  });
}
