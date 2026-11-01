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
export function renderCycleNotices(a, { rangeScoped = false } = {}) {
  const messages = [a.cycleNotice, a.periodNotice, a.timingNotice].filter(
    Boolean,
  );
  if (a.cycles?.length === 0 || a.completed?.length === 0)
    messages.unshift(
      rangeScoped
        ? "Khoảng đang xem chưa đủ mẫu để tính cả hai chỉ số trung bình. Dự đoán kỳ tiếp theo vẫn dùng lịch sử gần nhất; chỉ dùng mặc định khi thiếu dữ liệu thực tế."
        : "Khi chưa đủ lịch sử thực tế, ứng dụng dùng chu kỳ 28 ngày và thời gian hành kinh 5 ngày làm mặc định cho chỉ số còn thiếu.",
    );
  return messages.length
    ? `<div class="cycle-analysis-notices">${messages.map((message) => `<p>${message}</p>`).join("")}</div>`
    : "";
}
export function renderCycleCharts(a, { rangeLabel } = {}) {
  const chart = (title, rows, average) => {
    if (!rows.length)
      return `<section class="card analysis-chart"><h3>${title}</h3><p>Chưa đủ dữ liệu. Em tiếp tục ghi nhận những kỳ kinh thực tế nhé.</p></section>`;
    const maximum =
      Math.max(...rows.map((row) => row.value), average || 0) * 1.2;
    const chartWidth = Math.max(400, rows.length * 54 + 100);
    const plotHeight = 140,
      width = (chartWidth - 100) / rows.length;
    const caption = rangeLabel
      ? `${rows.length} mẫu trong khoảng ${rangeLabel.toLowerCase()} · Ngày bắt đầu trên trục ngang. Kéo ngang để xem thêm.`
      : "Tối đa 6 mẫu gần nhất · Ngày bắt đầu trên trục ngang.";
    const averageY = 165 - (average / maximum) * plotHeight;
    return `<section class="card analysis-chart"><h3>${title}</h3><div class="analysis-chart-scroll"><svg viewBox="0 0 ${chartWidth} 220" width="${chartWidth}" role="img" aria-label="${title}, đơn vị ngày"><line x1="45" y1="25" x2="45" y2="165" stroke="currentColor"/><line x1="45" y1="165" x2="${chartWidth - 35}" y2="165" stroke="currentColor"/><text x="4" y="18">Số ngày</text><text x="21" y="169">0</text><text x="12" y="37">${Math.ceil(maximum)}</text>${rows
      .map((row, i) => {
        const height = (row.value / maximum) * plotHeight;
        const x = 55 + i * width;
        return `<rect x="${x}" y="${165 - height}" width="${width - 12}" height="${height}" rx="4" fill="#dfa2b7"/><text text-anchor="middle" x="${x + (width - 12) / 2}" y="${158 - height}">${row.value}</text><text text-anchor="middle" x="${x + (width - 12) / 2}" y="187">${row.start.slice(5).split("-").reverse().join("/")}</text>`;
      })
      .join(
        "",
      )}${average !== null ? `<line x1="45" y1="${averageY}" x2="${chartWidth - 35}" y2="${averageY}" stroke="#795789" stroke-dasharray="5 4"/><text x="45" y="213">Trung bình: ${average} ngày</text>` : ""}</svg></div><p>${caption}</p></section>`;
  };
  return `<div class="cycle-analysis-charts">${chart("Độ dài chu kỳ", a.cycles, a.averageCycleLength)}${chart("Số ngày hành kinh", a.completed, a.averagePeriodLength)}</div>`;
}
