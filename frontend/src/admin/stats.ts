import { HttpError, fetchJson } from "../http";
import { renderStatsCharts, renderWebStatsChart } from "./charts";
import { requireElement } from "./dom";

type StatsResponse = {
  summary: {
    searchCount: number;
    clickCount: number;
    uniqueSessionCount: number;
  };
  landSummary: {
    totalLands: number;
  };
  topRegions: Array<{ region: string; count: number }>;
  topMinAreaBuckets: Array<{ bucket: string; count: number }>;
  topClickedLands: Array<{ address: string; clickCount: number; uniqueSessionCount: number }>;
  dailyTrend: Array<{ date: string; searchCount: number; clickCount: number }>;
};

type WebStatsResponse = {
  summary: {
    dailyVisitors: number;
    totalVisitors: number;
    avgDwellMinutes: number;
    sessionCount: number;
  };
  dailyTrend: Array<{
    date: string;
    visitors: number;
    sessions: number;
    avgDwellMinutes: number;
  }>;
};

let hasLoadedStats = false;

function renderTopList<T>(
  id: string,
  items: T[],
  formatter: (item: T, index: number) => string,
  emptyText: string
): void {
  const el = document.getElementById(id);
  if (!el) {
    return;
  }
  if (!items.length) {
    el.textContent = emptyText;
    return;
  }
  el.style.whiteSpace = "pre-line";
  el.textContent = items.map((item, index) => formatter(item, index)).join("\n");
}

export async function loadStats(force = false): Promise<void> {
  if (!force && hasLoadedStats) {
    return;
  }

  const status = requireElement("statsStatus", HTMLDivElement);
  const searchCount = requireElement("stats-search-count", HTMLInputElement);
  const clickCount = requireElement("stats-click-count", HTMLInputElement);
  const uniqueSessionCount = requireElement("stats-unique-session-count", HTMLInputElement);
  const totalLands = requireElement("stats-total-lands", HTMLInputElement);
  const webDailyVisitors = requireElement("web-daily-visitors", HTMLInputElement);
  const webTotalVisitors = requireElement("web-total-visitors", HTMLInputElement);
  const webAvgDwell = requireElement("web-avg-dwell", HTMLInputElement);
  const webSessionCount = requireElement("web-session-count", HTMLInputElement);
  const webStatus = requireElement("webStatsStatus", HTMLDivElement);

  if (
    !status ||
    !searchCount ||
    !clickCount ||
    !uniqueSessionCount ||
    !totalLands ||
    !webDailyVisitors ||
    !webTotalVisitors ||
    !webAvgDwell ||
    !webSessionCount ||
    !webStatus
  ) {
    return;
  }

  status.style.color = "#6b7280";
  status.innerText = "통계를 불러오는 중입니다...";
  webStatus.style.color = "#6b7280";
  webStatus.innerText = "웹 통계를 불러오는 중입니다...";

  try {
    const [payload, webPayload] = await Promise.all([
      fetchJson<StatsResponse>("/admin/stats?limit=10", { timeoutMs: 10000 }),
      fetchJson<WebStatsResponse>("/admin/stats/web?days=30", { timeoutMs: 10000 })
    ]);

    searchCount.value = String(payload.summary.searchCount);
    clickCount.value = String(payload.summary.clickCount);
    uniqueSessionCount.value = String(payload.summary.uniqueSessionCount);
    totalLands.value = String(payload.landSummary.totalLands);
    webDailyVisitors.value = String(webPayload.summary.dailyVisitors);
    webTotalVisitors.value = String(webPayload.summary.totalVisitors);
    webAvgDwell.value = String(webPayload.summary.avgDwellMinutes);
    webSessionCount.value = String(webPayload.summary.sessionCount);

    renderTopList(
      "statsTopRegions",
      payload.topRegions,
      (item, index) => `${index + 1}. ${item.region} (${item.count})`,
      "지역 검색 데이터 없음"
    );
    renderTopList(
      "statsTopBuckets",
      payload.topMinAreaBuckets,
      (item, index) => `${index + 1}. ${item.bucket}㎡ (${item.count})`,
      "최소 면적 검색 데이터 없음"
    );
    renderTopList(
      "statsTopClickedLands",
      payload.topClickedLands,
      (item, index) =>
        `${index + 1}. ${item.address}\n   총 클릭: ${item.clickCount}, 고유 세션: ${item.uniqueSessionCount}`,
      "클릭 데이터 없음"
    );

    renderStatsCharts(payload);
    renderWebStatsChart(webPayload);
    hasLoadedStats = true;
    status.style.color = "#16a34a";
    status.innerText = "통계 갱신 완료";
    webStatus.style.color = "#16a34a";
    webStatus.innerText = "웹 통계 갱신 완료";
  } catch (error) {
    const message = error instanceof HttpError ? error.message : "통계를 불러오지 못했습니다.";
    status.style.color = "#dc2626";
    status.innerText = message;
    webStatus.style.color = "#dc2626";
    webStatus.innerText = message;
  }
}
