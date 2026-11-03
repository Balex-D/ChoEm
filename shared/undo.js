const copy = (value) => structuredClone(value);
const periodPart = (state) => ({
  starts: [...state.starts].sort(),
  ends: state.ends,
  periodEstimates: state.periodEstimates || {},
});
const part = (state, scope) =>
  scope.kind === "entry"
    ? (state.entries[scope.date] ?? null)
    : periodPart(state);
const equal = (a, b) => {
  const stable = (value) =>
    value && typeof value === "object"
      ? Array.isArray(value)
        ? value.map(stable)
        : Object.fromEntries(
            Object.keys(value)
              .sort()
              .map((key) => [key, stable(value[key])]),
          )
      : value;
  return JSON.stringify(stable(a)) === JSON.stringify(stable(b));
};
export function undoRecord(before, after, scope, owner, now = Date.now()) {
  return {
    before: copy(part(before, scope)),
    after: copy(part(after, scope)),
    scope,
    owner,
    expiresAt: now + 60000,
  };
}
export function restoreUndo(state, record, owner, now = Date.now()) {
  if (!record || record.owner !== owner || now >= record.expiresAt)
    throw new Error("Thao tác hoàn tác đã hết hạn hoặc tài khoản đã thay đổi.");
  if (!equal(part(state, record.scope), record.after))
    throw new Error(
      "Dữ liệu này đã thay đổi sau thao tác. Không thể hoàn tác để tránh ghi đè.",
    );
  if (record.scope.kind === "entry") {
    const entries = { ...state.entries };
    if (record.before === null) delete entries[record.scope.date];
    else
      entries[record.scope.date] = {
        ...copy(record.before),
        shared: false,
        needsShared: false,
      };
    return { ...state, entries };
  }
  return { ...state, ...copy(record.before) };
}
