import { requireElement } from "./dom";

declare const Chart: any;

type StatsResponse = {
  topRegions: Array<{ region: string; count: number }>;
  topMinAreaBuckets: Array<{ bucket: string; count: number }>;
  dailyTrend: Array<{ date: string; searchCount: number; clickCount: number }>;
};

type WebStatsResponse = {
  dailyTrend: Array<{
    date: string;
    visitors: number;
    sessions: number;
    avgDwellMinutes: number;
  }>;
};

let regionChart: any = null;
let minAreaChart: any = null;
let trendChart: any = null;
let webTrendChart: any = null;

export function renderStatsCharts(payload: StatsResponse): void {
  const regionCanvas = requireElement("statsRegionChart", HTMLCanvasElement);
  const minAreaCanvas = requireElement("statsMinAreaChart", HTMLCanvasElement);
  const trendCanvas = requireElement("statsTrendChart", HTMLCanvasElement);

  if (regionChart) {
    regionChart.destroy();
    regionChart = null;
  }
  if (minAreaChart) {
    minAreaChart.destroy();
    minAreaChart = null;
  }
  if (trendChart) {
    trendChart.destroy();
    trendChart = null;
  }

  if (regionCanvas) {
    regionChart = new Chart(regionCanvas, {
      type: "bar",
      data: {
        labels: payload.topRegions.map((item) => item.region),
        datasets: [
          {
            label: "검색 수",
            data: payload.topRegions.map((item) => item.count),
            backgroundColor: "#3b82f6"
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: true,
            grace: "5%",
            ticks: {
              precision: 0
            }
          }
        }
      }
    });
  }

  if (minAreaCanvas) {
    minAreaChart = new Chart(minAreaCanvas, {
      type: "bar",
      data: {
        labels: payload.topMinAreaBuckets.map((item) => item.bucket),
        datasets: [
          {
            label: "검색 수",
            data: payload.topMinAreaBuckets.map((item) => item.count),
            backgroundColor: "#16a34a"
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: true,
            grace: "5%",
            ticks: {
              precision: 0
            }
          }
        }
      }
    });
  }

  if (trendCanvas) {
    trendChart = new Chart(trendCanvas, {
      type: "line",
      data: {
        labels: payload.dailyTrend.map((item) => item.date),
        datasets: [
          {
            label: "검색",
            data: payload.dailyTrend.map((item) => item.searchCount),
            borderColor: "#3b82f6",
            backgroundColor: "rgba(59,130,246,0.2)",
            fill: true
          },
          {
            label: "클릭",
            data: payload.dailyTrend.map((item) => item.clickCount),
            borderColor: "#f97316",
            backgroundColor: "rgba(249,115,22,0.2)",
            fill: true
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: true,
            grace: "5%",
            ticks: {
              precision: 0
            }
          }
        }
      }
    });
  }
}

export function renderWebStatsChart(payload: WebStatsResponse): void {
  const canvas = requireElement("webStatsTrendChart", HTMLCanvasElement);
  if (!canvas) {
    return;
  }
  if (webTrendChart) {
    webTrendChart.destroy();
    webTrendChart = null;
  }

  webTrendChart = new Chart(canvas, {
    type: "line",
    data: {
      labels: payload.dailyTrend.map((item) => item.date),
      datasets: [
        {
          label: "방문자",
          data: payload.dailyTrend.map((item) => item.visitors),
          borderColor: "#0ea5e9",
          backgroundColor: "rgba(14,165,233,0.2)",
          fill: true
        },
        {
          label: "평균 체류(분)",
          data: payload.dailyTrend.map((item) => item.avgDwellMinutes),
          borderColor: "#22c55e",
          backgroundColor: "rgba(34,197,94,0.2)",
          fill: true
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          grace: "5%"
        }
      }
    }
  });
}
