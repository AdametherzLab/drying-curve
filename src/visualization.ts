import type { DryingSession, WeightEntry, MoistureEstimate, DryingRate } from './types.js';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { StorageError } from './storage.js';

export type ChartPoint = {
  x: string;
  y: number;
};

export type ChartDataset = {
  label: string;
  data: ChartPoint[];
  borderColor: string;
  yAxisLabel: string;
  unit: string;
};

export type SessionVisualization = {
  sessionId: string;
  foodType: string;
  targetMoisture: number;
  datasets: {
    weightLoss: ChartDataset;
    moistureContent: ChartDataset;
    dryingRate: ChartDataset;
  };
  summary: {
    totalWeightLoss: number;
    currentMoisture: number;
    targetReached: boolean;
    averageDryingRate: number;
  };
};

export type HTMLReportOptions = {
  title?: string;
  theme?: 'light' | 'dark';
  includeRawData?: boolean;
  chartHeight?: number;
};

const CHART_COLORS = {
  weightLoss: 'rgb(99, 102, 241)',
  moistureContent: 'rgb(14, 165, 233)',
  dryingRate: 'rgb(22, 163, 74)',
  targetLine: 'rgb(234, 179, 8)'
};

/**
 * Transforms drying session data into structured visualization format
 * @param session - Drying session to visualize
 * @returns Processed visualization data with chart datasets
 */
export function generateVisualizationData(session: DryingSession): SessionVisualization {
  const weightLossData: ChartPoint[] = [];
  const moistureData: ChartPoint[] = [];
  const rateData: ChartPoint[] = [];

  session.measurements.forEach((entry, index) => {
    // Weight loss = initial weight - current weight
    const weightLoss = session.config.initialWeightGrams - entry.weightGrams;
    weightLossData.push({
      x: entry.timestamp,
      y: Number(weightLoss.toFixed(1))
    });

    // Moisture content from estimates
    if (session.moistureEstimates[index]) {
      moistureData.push({
        x: entry.timestamp,
        y: session.moistureEstimates[index].moisturePercent
      });
    }
  });

  // Drying rates between consecutive measurements
  session.dryingRates.forEach(rate => {
    rateData.push({
      x: rate.endTimestamp,
      y: rate.gramsPerHour
    });
  });

  return {
    sessionId: session.config.sessionId,
    foodType: session.config.foodType,
    targetMoisture: session.config.targetMoisturePercent,
    datasets: {
      weightLoss: {
        label: 'Weight Loss',
        data: weightLossData,
        borderColor: CHART_COLORS.weightLoss,
        yAxisLabel: 'Weight Loss (g)',
        unit: 'g'
      },
      moistureContent: {
        label: 'Moisture Content',
        data: moistureData,
        borderColor: CHART_COLORS.moistureContent,
        yAxisLabel: 'Moisture (%)',
        unit: '%'
      },
      dryingRate: {
        label: 'Drying Rate',
        data: rateData,
        borderColor: CHART_COLORS.dryingRate,
        yAxisLabel: 'Rate (g/hour)',
        unit: 'g/h'
      }
    },
    summary: {
      totalWeightLoss: session.summary.totalWeightLossGrams,
      currentMoisture: session.summary.currentMoisturePercent,
      targetReached: session.summary.targetReached,
      averageDryingRate: session.summary.averageDryingRateGramsPerHour
    }
  };
}

/**
 * Generates interactive HTML report with Chart.js visualizations
 * @param session - Drying session to visualize
 * @param options - Report customization options
 * @returns HTML string with embedded charts and data
 */
export function generateHTMLReport(session: DryingSession, options: HTMLReportOptions = {}): string {
  const viz = generateVisualizationData(session);
  const chartHeight = options.chartHeight ?? 300;
  const hasMeasurements = session.measurements.length > 0;
  
  const themeStyles = options.theme === 'dark' ? {
    background: '#1f2937',
    text: '#f3f4f6',
    grid: '#374151'
  } : {
    background: '#ffffff',
    text: '#111827',
    grid: '#e5e7eb'
  };

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${options.title ?? 'Drying Curve Report'}</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <style>
    body {
      font-family: system-ui, sans-serif;
      padding: 2rem;
      background-color: ${themeStyles.background};
      color: ${themeStyles.text};
    }
    .chart-container {
      margin: 2rem 0;
      max-width: 1000px;
    }
    .status-badge {
      padding: 0.5rem 1rem;
      border-radius: 0.375rem;
      font-weight: 500;
    }
    .target-reached {
      background-color: #059669;
    }
    .target-pending {
      background-color: #dc2626;
    }
    table {
      border-collapse: collapse;
      margin-top: 2rem;
    }
    th, td {
      padding: 0.5rem 1rem;
      border: 1px solid ${themeStyles.grid};
    }
  </style>
</head>
<body>
  <h1>${options.title ?? 'Drying Progress Report'}</h1>
  <div class="status-badge ${viz.summary.targetReached ? 'target-reached' : 'target-pending'}">
    Target ${viz.summary.targetReached ? 'Reached' : 'Pending'} • Current Moisture: ${viz.summary.currentMoisture.toFixed(1)}%
  </div>

  <div class="chart-container">
    <canvas id="weightChart" style="height: ${chartHeight}px"></canvas>
  </div>
  
  <div class="chart-container">
    <canvas id="moistureChart" style="height: ${chartHeight}px"></canvas>
  </div>
  
  <div class="chart-container">
    <canvas id="rateChart" style="height: ${chartHeight}px"></canvas>
  </div>

  ${options.includeRawData ? generateDataTable(session) : ''}

  <script>
    function createChart(canvasId, datasetConfig) {
      new Chart(document.getElementById(canvasId), {
        type: 'line',
        data: {
          datasets: [{
            label: datasetConfig.label,
            data: datasetConfig.data,
            borderColor: datasetConfig.borderColor,
            tension: 0.2,
            borderWidth: 2,
            pointRadius: 3
          }, ...(datasetConfig.extraDatasets || [])]
        },
        options: {
          responsive: true,
          scales: {
            x: {
              type: 'time',
              time: { unit: 'hour' },
              grid: { color: '${themeStyles.grid}' },
              ticks: { color: '${themeStyles.text}' }
            },
            y: {
              title: { 
                display: true, 
                text: datasetConfig.yLabel,
                color: '${themeStyles.text}'
              },
              grid: { color: '${themeStyles.grid}' },
              ticks: { color: '${themeStyles.text}' }
            }
          },
          plugins: {
            legend: { labels: { color: '${themeStyles.text}' } }
          }
        }
      });
    }

    // Initialize charts
    document.addEventListener('DOMContentLoaded', () => {
      createChart('weightChart', {
        label: '${viz.datasets.weightLoss.label}',
        data: ${JSON.stringify(viz.datasets.weightLoss.data)},
        borderColor: '${viz.datasets.weightLoss.borderColor}',
        yLabel: '${viz.datasets.weightLoss.yAxisLabel}'
      });

      createChart('moistureChart', {
        label: '${viz.datasets.moistureContent.label}',
        data: ${JSON.stringify(viz.datasets.moistureContent.data)},
        borderColor: '${viz.datasets.moistureContent.borderColor}',
        yLabel: '${viz.datasets.moistureContent.yAxisLabel}',
        extraDatasets: ${hasMeasurements ? `[{
          label: 'Target (${viz.targetMoisture}%)',
          borderColor: '${CHART_COLORS.targetLine}',
          borderDash: [5,5],
          data: [{
            x: '${session.measurements[0].timestamp}',
            y: ${viz.targetMoisture}
          }, {
            x: '${session.measurements[session.measurements.length-1].timestamp}',
            y: ${viz.targetMoisture}
          }]
        }]` : '[]'}
      });

      createChart('rateChart', {
        label: '${viz.datasets.dryingRate.label}',
        data: ${JSON.stringify(viz.datasets.dryingRate.data)},
        borderColor: '${viz.datasets.dryingRate.borderColor}',
        yLabel: '${viz.datasets.dryingRate.yAxisLabel}'
      });
    });
  </script>
</body>
</html>
  `;
}

function generateDataTable(session: DryingSession): string {
  return `
    <h2>Raw Measurements</h2>
    <table>
      <thead>
        <tr>
          <th>Timestamp</th>
          <th>Weight (g)</th>
          <th>Temp (°C)</th>
          <th>Humidity (%)</th>
        </tr>
      </thead>
      <tbody>
        ${session.measurements.map(entry => `
          <tr>
            <td>${new Date(entry.timestamp).toLocaleString()}</td>
            <td>${entry.weightGrams}</td>
            <td>${entry.temperatureCelsius ?? '-'}</td>
            <td>${entry.humidityPercent ?? '-'}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

/**
 * Saves interactive HTML report to disk
 * @param session - Drying session to visualize
 * @param filePath - Absolute path for output HTML file
 * @param options - Report customization options
 */
export async function saveVisualizationReport(
  session: DryingSession,
  filePath: string,
  options?: HTMLReportOptions
): Promise<void> {
  if (!filePath || typeof filePath !== 'string') {
    throw new StorageError('INVALID_PATH', 'File path must be a non-empty string');
  }
  if (!path.isAbsolute(filePath)) {
    throw new StorageError('INVALID_PATH', 'File path must be absolute');
  }

  const html = generateHTMLReport(session, options);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.promises.writeFile(filePath, html, 'utf-8');
}
