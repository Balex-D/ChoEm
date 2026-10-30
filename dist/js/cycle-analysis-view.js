const displayDate = (day) => (day ? day.split("-").reverse().join("/") : "--");
export function renderCycleOverview(a) {
  return `<div class="stat-grid analysis-stats">${[
    [
      a.averageCycleLength === null ? "--" : `${a.averageCycleLength} ngày`,
      "Chu kỳ trung bình",
    ],
    [
      a.averagePeriodLength === null ? "--" : `${a.averagePeriodLength} ngày`,
      "Số ngày hành kinh trung bình",
    ],
    [displayDate(a.lastPeriodStart), "Kỳ kinh gần nhất"],
    [displayDate(a.nextPeriodStart), "Kỳ kinh tiếp theo dự kiến"],
  ]
    .map(
      ([value, label]) =>
        `<div class="card stat"><b>${value}</b><span>${label}</span></div>`,
    )
    .join("")}</div>`;
}
export function renderCycleNotices(a) {
  const messages = [a.cycleNotice, a.periodNotice, a.timingNotice].filter(
    Boolean,
  );
  if (a.averageCycleLength === null || a.averagePeriodLength === null)
    messages.unshift(
      "Chưa đủ dữ liệu để dự kiến kỳ kinh tiếp theo. Mỗi lần ghi nhận sẽ giúp Em hiểu nhịp điệu của mình hơn một chút.",
    );
  return messages.length
    ? `<div class="cycle-analysis-notices">${messages.map((message) => `<p>${message}</p>`).join("")}</div>`
    : "";
}
export function renderCycleCharts(a) {
  const chart = (title, rows, average) => {
    if (!rows.length)
      return `<section class="card analysis-chart"><h3>${title}</h3><p>Chưa đủ dữ liệu. Em tiếp tục ghi nhận những kỳ kinh thực tế nhé.</p></section>`;
    const maximum =
      Math.max(...rows.map((row) => row.value), average || 0) * 1.2;
    const plotHeight = 140,
      width = 300 / rows.length;
    const averageY = 165 - (average / maximum) * plotHeight;
    return `<section class="card analysis-chart"><h3>${title}</h3><svg viewBox="0 0 400 220" role="img" aria-label="${title}, đơn vị ngày"><line x1="45" y1="25" x2="45" y2="165" stroke="currentColor"/><line x1="45" y1="165" x2="365" y2="165" stroke="currentColor"/><text x="4" y="18">Số ngày</text><text x="21" y="169">0</text><text x="12" y="37">${Math.ceil(maximum)}</text>${rows
      .map((row, i) => {
        const height = (row.value / maximum) * plotHeight;
        const x = 55 + i * width;
        return `<rect x="${x}" y="${165 - height}" width="${width - 12}" height="${height}" rx="4" fill="#dfa2b7"/><text text-anchor="middle" x="${x + (width - 12) / 2}" y="${158 - height}">${row.value}</text><text text-anchor="middle" x="${x + (width - 12) / 2}" y="187">${row.start.slice(5).split("-").reverse().join("/")}</text>`;
      })
      .join(
        "",
      )}${average !== null ? `<line x1="45" y1="${averageY}" x2="365" y2="${averageY}" stroke="#795789" stroke-dasharray="5 4"/><text x="45" y="213">Trung bình: ${average} ngày</text>` : ""}</svg><p>Tối đa 6 ${title === "Độ dài chu kỳ" ? "khoảng chu kỳ" : "kỳ đã hoàn tất"} gần nhất · Ngày bắt đầu trên trục ngang.</p></section>`;
  };
  return `<div class="cycle-analysis-charts">${chart("Độ dài chu kỳ", a.cycles, a.averageCycleLength)}${chart("Số ngày hành kinh", a.completed, a.averagePeriodLength)}</div>`;
}
