import type { DryingSession } from "./types.js";
import { StorageError } from "./storage.js";
import * as fs from "fs/promises";
import * as path from "path";

/**
 * Data point for chart visualization.
 * @property x - ISO 8601 timestamp
 * @property y - Numeric value for the metric
 */
export interface ChartPoint {
  x: string;
  y: number;
}

/**
 * Dataset configuration for a chart.
 * @property label - Display name for the dataset
 * @property data - Array of chart points
 * @property borderColor - CSS color for the line
 * @property backgroundColor - CSS color for the fill
 * @property yAxisLabel - Label for the Y-axis
 * @property unit - Unit of measurement (displayed in tooltips)
 */
export interface ChartDataset {
  label: string;
  data: ChartPoint[];
  borderColor: string;
  backgroundColor: string;
  yAxisLabel: string;
  unit: string;
}

/**
 * Complete visualization data for a drying session.
 * @property sessionId - Unique session identifier
 * @property foodType - Type of food being dried
 * @property createdAt - Session creation timestamp
 * @property targetMoisture - Target moisture percentage
 * @property datasets - Three main curves: weight loss, moisture content, and drying rate
 * @property summary - Aggregated statistics for display
 */
export interface SessionVisualization {
  sessionId: string;
  foodType: string;
  createdAt: string;
  targetMoisture: number;
  datasets: {
    weightLoss: ChartDataset;
    moistureContent: ChartDataset;
    dryingRate: ChartDataset;
  };
  summary: {
    totalWeightLoss: number;
    currentMoisture: number;
    averageDryingRate: number;
    targetReached: boolean;
  };
}

/**
 * Options for generating HTML reports.
 * @property title - Custom report title (defaults to food type)
 * @property includeRawData - Whether to include the raw measurements table
 * @property theme - Color theme for the report
 * @property chartHeight - Height of charts in pixels
 * @property chartJsCdn - URL for Chart.js CDN
 */
export interface HTMLReportOptions {
  title?: string;
  includeRawData?: boolean;
  theme?: "light" | "dark";
  chartHeight?: number;
  chartJsCdn?: string;
}

/**
 * Generates visualization-ready data from a drying session.
 * Transforms session measurements into chart-friendly data structures
 * for weight loss curves, moisture content trends, and drying rate analysis.
 * 
 * @param session - The drying session to visualize
 * @returns Structured visualization data with three datasets and summary statistics
 * @example
 * const viz = generateVisualizationData(session);
 * console.log(viz.datasets.moistureContent.data);
 */
export function generateVisualizationData(session: DryingSession): SessionVisualization {
  const { config, measurements, moistureEstimates, dryingRates, summary } = session;
  
  // Weight loss curve: cumulative weight loss over time
  const weightLossData: ChartPoint[] = measurements.map((m) => ({
    x: m.timestamp,
    y: config.initialWeightGrams - m.weightGrams
  }));

  // Moisture content curve from estimates
  const moistureData: ChartPoint[] = moistureEstimates.map((e) => ({
    x: e.timestamp,
    y: e.moisturePercent
  }));

  // Drying rate curve (stepped line at end of each interval)
  const rateData: ChartPoint[] = dryingRates.map((r) => ({
    x: r.endTimestamp,
    y: r.gramsPerHour
  }));

  return {
    sessionId: config.sessionId,
    foodType: config.foodType,
    createdAt: config.createdAt,
    targetMoisture: config.targetMoisturePercent,
    datasets: {
      weightLoss: {
        label: "Weight Loss",
        data: weightLossData,
        borderColor: "rgb(239, 68, 68)",
        backgroundColor: "rgba(239, 68, 68, 0.1)",
        yAxisLabel: "Weight Loss (g)",
        unit: "g"
      },
      moistureContent: {
        label: "Moisture Content",
        data: moistureData,
        borderColor: "rgb(59, 130, 246)",
        backgroundColor: "rgba(59, 130, 246, 0.1)",
        yAxisLabel: "Moisture (%)",
        unit: "%"
      },
      dryingRate: {
        label: "Drying Rate",
        data: rateData,
        borderColor: "rgb(16, 185, 129)",
        backgroundColor: "rgba(16, 185, 129, 0.1)",
        yAxisLabel: "Rate (g/h)",
        unit: "g/h"
      }
    },
    summary: {
      totalWeightLoss: summary.totalWeightLossGrams,
      currentMoisture: summary.currentMoisturePercent,
      averageDryingRate: summary.averageDryingRateGramsPerHour,
      targetReached: summary.targetReached
    }
  };
}

/**
 * Generates a complete HTML report with interactive Chart.js visualizations.
 * Creates a standalone HTML file containing three interactive charts
 * (weight loss, moisture content, drying rate) and a summary dashboard.
 * 
 * @param session - The drying session to visualize
 * @param options - Configuration for the HTML output (theme, title, etc.)
 * @returns Complete HTML document as a string
 * @example
 * const html = generateHTMLReport(session, { theme: "dark", includeRawData: true });
 * await fs.writeFile("report.html", html);
 */
export function generateHTMLReport(
  session: DryingSession,
  options: HTMLReportOptions = {}
): string {
  const viz = generateVisualizationData(session);
  const {
    title = `${viz.foodType} Drying Session`,
    includeRawData = true,
    theme = "light",
    chartHeight = 300,
    chartJsCdn = "https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"
  } = options;

  const isDark = theme === "dark";
  const bgColor = isDark ? "#1f2937" : "#ffffff";
  const textColor = isDark ? "#f3f4f6" : "#111827";
  const gridColor = isDark ? "#374151" : "#e5e7eb";

  const chartConfigs = [
    {
      id: "weightChart",
      label: viz.datasets.weightLoss.label,
      data: viz.datasets.weightLoss.data,
      color: viz.datasets.weightLoss.borderColor,
      bg: viz.datasets.weightLoss.backgroundColor,
      yLabel: viz.datasets.weightLoss.yAxisLabel,
      unit: viz.datasets.weightLoss.unit
    },
    {
      id: "moistureChart",
      label: viz.datasets.moistureContent.label,
      data: viz.datasets.moistureContent.data,
      color: viz.datasets.moistureContent.borderColor,
      bg: viz.datasets.moistureContent.backgroundColor,
      yLabel: viz.datasets.moistureContent.yAxisLabel,
      unit: viz.datasets.moistureContent.unit,
      targetLine: viz.targetMoisture
    },
    {
      id: "rateChart",
      label: viz.datasets.dryingRate.label,
      data: viz.datasets.dryingRate.data,
      color: viz.datasets.dryingRate.borderColor,
      bg: viz.datasets.dryingRate.backgroundColor,
      yLabel: viz.datasets.dryingRate.yAxisLabel,
      unit: viz.datasets.dryingRate.unit
    }
  ];

  const chartsHtml = chartConfigs.map(cfg => `
    <div class="chart-container">
      <h3>${cfg.label}</h3>
      <canvas id="${cfg.id}"></canvas>
    </div>
  `).join("\n");

  const chartsJs = chartConfigs.map(cfg => {
    const targetLinePlugin = cfg.targetLine !== undefined ? `
      ,{
        type: 'line',
        label: 'Target (${cfg.targetLine}%)',
        data: ${JSON.stringify(cfg.data.map(() => cfg.targetLine))},
        borderColor: 'rgb(234, 179, 8)',
        borderDash: [5, 5],
        pointRadius: 0,
        fill: false
      }` : '';
    
    return `
    new Chart(document.getElementById('${cfg.id}'), {
      type: 'line',
      data: {
        labels: ${JSON.stringify(cfg.data.map(d => new Date(d.x).toLocaleString()))},
        datasets: [{
          label: '${cfg.label} (${cfg.unit})',
          data: ${JSON.stringify(cfg.data.map(d => d.y))},
          borderColor: '${cfg.color}',
          backgroundColor: '${cfg.bg}',
          tension: 0.1,
          fill: true
        }${targetLinePlugin}]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false
        },
        plugins: {
          legend: { labels: { color: '${textColor}' } },
          tooltip: {
            callbacks: {
              label: function(context) {
                return context.dataset.label + ': ' + context.parsed.y.toFixed(2) + '${cfg.unit}';
              }
            }
          }
        },
        scales: {
          x: {
            ticks: { color: '${textColor}' },
            grid: { color: '${gridColor}' }
          },
          y: {
            title: { display: true, text: '${cfg.yLabel}', color: '${textColor}' },
            ticks: { color: '${textColor}' },
            grid: { color: '${gridColor}' }
          }
        }
      }
    });`;
  }).join("\n");

  const rawDataHtml = includeRawData ? `
    <div class="raw-data">
      <h3>Raw Measurements</h3>
      <table>
        <thead>
          <tr>
            <th>Time</th>
            <th>Weight (g)</th>
            <th>Moisture (%)</th>
            <th>Rate (g/h)</th>
          </tr>
        </thead>
        <tbody>
          ${session.measurements.map((m, i) => `
            <tr>
              <td>${new Date(m.timestamp).toLocaleString()}</td>
              <td>${m.weightGrams}</td>
              <td>${session.moistureEstimates[i]?.moisturePercent.toFixed(2) ?? '-'}</td>
              <td>${session.dryingRates[i-1]?.gramsPerHour.toFixed(2) ?? '-'}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  ` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <script src="${chartJsCdn}"></script>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      margin: 0;
      padding: 20px;
      background: ${bgColor};
      color: ${textColor};
      line-height: 1.5;
    }
    .container { max-width: 1200px; margin: 0 auto; }
    h1 { margin-bottom: 0.5em; }
    .subtitle { 
      color: ${isDark ? '#9ca3af' : '#6b7280'}; 
      margin-bottom: 2em; 
      font-size: 0.9em;
    }
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1rem;
      margin-bottom: 2rem;
    }
    .stat-card {
      background: ${isDark ? '#374151' : '#f3f4f6'};
      padding: 1rem;
      border-radius: 8px;
      border-left: 4px solid rgb(59, 130, 246);
    }
    .stat-label { font-size: 0.875rem; opacity: 0.8; }
    .stat-value { font-size: 1.5rem; font-weight: bold; margin-top: 0.25rem; }
    .chart-container {
      background: ${isDark ? '#111827' : '#ffffff'};
      padding: 1rem;
      border-radius: 8px;
      margin-bottom: 2rem;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      height: ${chartHeight + 80}px;
    }
    .chart-container h3 { margin-top: 0; margin-bottom: 1rem; }
    canvas { max-height: ${chartHeight}px !important; }
    .raw-data { margin-top: 2rem; }
    table {
      width: 100%;
      border-collapse: collapse;
      background: ${isDark ? '#111827' : '#ffffff'};
      border-radius: 8px;
      overflow: hidden;
      font-size: 0.9em;
    }
    th, td {
      padding: 0.75rem;
      text-align: left;
      border-bottom: 1px solid ${gridColor};
    }
    th {
      background: ${isDark ? '#1f2937' : '#f3f4f6'};
      font-weight: 600;
    }
    tr:hover { background: ${isDark ? '#374151' : '#f9fafb'}; }
    .target-reached { color: rgb(16, 185, 129); font-weight: bold; }
    .target-pending { color: rgb(245, 158, 11); }
  </style>
</head>
<body>
  <div class="container">
    <h1>${title}</h1>
    <div class="subtitle">
      Session: ${viz.sessionId} | Started: ${new Date(viz.createdAt).toLocaleString()} | 
      Target Moisture: ${viz.targetMoisture}%
      <span class="${viz.summary.targetReached ? 'target-reached' : 'target-pending'}">
        (${viz.summary.targetReached ? 'TARGET REACHED' : 'IN PROGRESS'})
      </span>
    </div>
    
    <div class="summary-grid">
      <div class="stat-card">
        <div class="stat-label">Total Weight Loss</div>
        <div class="stat-value">${viz.summary.totalWeightLoss.toFixed(1)}g</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Current Moisture</div>
        <div class="stat-value">${viz.summary.currentMoisture.toFixed(1)}%</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Avg Drying Rate</div>
        <div class="stat-value">${viz.summary.averageDryingRate.toFixed(2)}g/h</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Measurements</div>
        <div class="stat-value">${session.measurements.length}</div>
      </div>
    </div>

    ${chartsHtml}
    ${rawDataHtml}
  </div>

  <script>
    Chart.defaults.color = '${textColor}';
    Chart.defaults.borderColor = '${gridColor}';
    ${chartsJs}
  </script>
</body>
</html>`;
}

/**
 * Saves an interactive HTML report to the filesystem.
 * Generates the HTML report and writes it to the specified absolute path,
 * creating parent directories as needed.
 * 
 * @param session - The drying session to visualize
 * @param filePath - Absolute path where the HTML file should be saved
 * @param options - Configuration for the HTML output
 * @throws {StorageError} If the file path is invalid or the file cannot be written
 * @example
 * await saveVisualizationReport(session, "/home/user/reports/jerky-session.html", {
 *   theme: "dark",
 *   includeRawData: true
 * });
 */
export async function saveVisualizationReport(
  session: DryingSession,
  filePath: string,
  options: HTMLReportOptions = {}
): Promise<void> {
  if (!filePath || typeof filePath !== "string") {
    throw new StorageError("File path must be a non-empty string", undefined, "INVALID_PATH");
  }
  if (!path.isAbsolute(filePath)) {
    throw new StorageError(`File path must be absolute, got: ${filePath}`, undefined, "INVALID_PATH");
  }

  const html = generateHTMLReport(session, options);
  
  try {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, html, "utf-8");
  } catch (error) {
    const errno = (error as NodeJS.ErrnoException).code;
    if (errno === "EACCES" || errno === "EPERM") {
      throw new StorageError(`Permission denied writing report: ${filePath}`, error, errno);
    }
    if (errno === "ENOSPC") {
      throw new StorageError(`Disk full writing report: ${filePath}`, error, errno);
    }
    throw new StorageError(`Failed to write visualization report: ${filePath}`, error, "WRITE_ERROR");
  }
}
