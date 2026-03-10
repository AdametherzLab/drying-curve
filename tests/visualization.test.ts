import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import {
  createSession,
  addWeightEntry,
  generateVisualizationData,
  generateHTMLReport,
  saveVisualizationReport,
  StorageError,
  type WeightEntry,
  type DryingSession,
} from "../src/index.js";

describe("Interactive Drying Curve Visualization", () => {
  let session: DryingSession;
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "viz-test-"));
    session = createSession({
      foodType: "Beef Jerky",
      initialWeightGrams: 1000,
      targetMoisturePercent: 15,
    });
    
    // Add sequential measurements over 6 hours
    const entries: WeightEntry[] = [
      { timestamp: "2024-01-01T10:00:00Z", weightGrams: 950, temperatureCelsius: 60, humidityPercent: 25 },
      { timestamp: "2024-01-01T12:00:00Z", weightGrams: 900, temperatureCelsius: 61, humidityPercent: 22 },
      { timestamp: "2024-01-01T14:00:00Z", weightGrams: 850, temperatureCelsius: 62, humidityPercent: 20 },
      { timestamp: "2024-01-01T16:00:00Z", weightGrams: 820, temperatureCelsius: 61, humidityPercent: 18 },
    ];
    
    entries.forEach(entry => {
      session = addWeightEntry(session, entry);
    });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe("generateVisualizationData", () => {
    it("transforms session into structured chart data with three curves", () => {
      const viz = generateVisualizationData(session);
      
      expect(viz.sessionId).toBe(session.config.sessionId);
      expect(viz.foodType).toBe("Beef Jerky");
      expect(viz.targetMoisture).toBe(15);
      
      // Verify weight loss curve (initial - current)
      expect(viz.datasets.weightLoss.data).toHaveLength(4);
      expect(viz.datasets.weightLoss.data[0].y).toBe(50);  // 1000-950
      expect(viz.datasets.weightLoss.data[1].y).toBe(100); // 1000-900
      expect(viz.datasets.weightLoss.data[3].y).toBe(180); // 1000-820
      expect(viz.datasets.weightLoss.unit).toBe("g");
      
      // Verify moisture curve has estimates for each measurement
      expect(viz.datasets.moistureContent.data).toHaveLength(4);
      expect(viz.datasets.moistureContent.data[0].y).toBeCloseTo(10.53, 1);
      expect(viz.datasets.moistureContent.yAxisLabel).toBe("Moisture (%)");
      
      // Verify drying rate curve (n-1 points for n measurements)
      expect(viz.datasets.dryingRate.data).toHaveLength(3);
      expect(viz.datasets.dryingRate.data[0].y).toBe(25); // (950-900)/2h
      expect(viz.datasets.dryingRate.data[1].y).toBe(25); // (900-850)/2h
      expect(viz.datasets.dryingRate.data[2].y).toBe(15); // (850-820)/2h
    });

    it("includes accurate summary statistics for dashboard display", () => {
      const viz = generateVisualizationData(session);
      
      expect(viz.summary.totalWeightLoss).toBe(180);
      expect(viz.summary.currentMoisture).toBeLessThanOrEqual(15);
      expect(viz.summary.targetReached).toBe(true);
      expect(viz.summary.averageDryingRate).toBeGreaterThan(0);
      // Average of 25, 25, 15 = 21.67
      expect(viz.summary.averageDryingRate).toBeCloseTo(21.67, 1);
    });

    it("handles empty sessions without errors", () => {
      const emptySession = createSession({
        foodType: "Test Empty",
        initialWeightGrams: 500,
        targetMoisturePercent: 20,
      });
      
      const viz = generateVisualizationData(emptySession);
      
      expect(viz.datasets.weightLoss.data).toHaveLength(0);
      expect(viz.datasets.moistureContent.data).toHaveLength(0);
      expect(viz.datasets.dryingRate.data).toHaveLength(0);
      expect(viz.summary.totalWeightLoss).toBe(0);
      expect(viz.summary.targetReached).toBe(false);
    });

    it("preserves ISO timestamps for proper time-axis rendering", () => {
      const viz = generateVisualizationData(session);
      
      // Verify timestamps are preserved in ISO format
      expect(viz.datasets.weightLoss.data[0].x).toBe("2024-01-01T10:00:00Z");
      expect(viz.datasets.moistureContent.data[0].x).toMatch(/^2024-01-01T/);
      
      // Verify drying rates use end timestamps
      expect(viz.datasets.dryingRate.data[0].x).toBe("2024-01-01T12:00:00Z");
    });
  });

  describe("generateHTMLReport", () => {
    it("produces valid HTML with embedded interactive charts", () => {
      const html = generateHTMLReport(session, { title: "Jerky Analysis" });
      
      expect(html).toContain("<!DOCTYPE html>");
      expect(html).toContain("<html");
      expect(html).toContain("</html>");
      expect(html).toContain("Jerky Analysis");
      expect(html).toContain("Beef Jerky");
      expect(html).toContain(session.config.sessionId);
      expect(html).toContain("chart.js"); // CDN reference
      expect(html).toContain("chart.umd.min.js");
    });

    it("includes all three interactive chart containers", () => {
      const html = generateHTMLReport(session);
      
      expect(html).toContain('id="weightChart"');
      expect(html).toContain('id="moistureChart"');
      expect(html).toContain('id="rateChart"');
      expect(html).toContain("Weight Loss");
      expect(html).toContain("Moisture Content");
      expect(html).toContain("Drying Rate");
    });

    it("renders target moisture line on moisture chart for visual reference", () => {
      const html = generateHTMLReport(session);
      
      // Should contain a dataset for the target line
      expect(html).toContain("Target (15%)");
      expect(html).toContain("borderDash"); // Dashed line style
      expect(html).toContain("rgb(234, 179, 8)"); // Yellow color for target
    });

    it("supports dark theme for low-light environments", () => {
      const html = generateHTMLReport(session, { theme: "dark" });
      
      expect(html).toContain("#1f2937"); // Dark background
      expect(html).toContain("#f3f4f6"); // Light text
      expect(html).toContain("#374151"); // Dark grid
    });

    it("supports light theme by default", () => {
      const html = generateHTMLReport(session);
      
      expect(html).toContain("#ffffff"); // Light background
      expect(html).toContain("#111827"); // Dark text
    });

    it("optionally includes raw data table for detailed analysis", () => {
      const withData = generateHTMLReport(session, { includeRawData: true });
      const withoutData = generateHTMLReport(session, { includeRawData: false });
      
      expect(withData).toContain("Raw Measurements");
      expect(withData).toContain("<table>");
      expect(withoutData).not.toContain("Raw Measurements");
      expect(withoutData).not.toContain("<table>");
    });

    it("embeds correct measurement data in Chart.js format", () => {
      const html = generateHTMLReport(session);
      
      // Weight values should appear in the JavaScript data arrays
      expect(html).toContain("950");
      expect(html).toContain("900");
      expect(html).toContain("850");
      expect(html).toContain("820");
      
      // Should contain Chart.js initialization code
      expect(html).toContain("new Chart(");
      expect(html).toContain("type: 'line'");
    });

    it("displays target reached status prominently", () => {
      const html = generateHTMLReport(session);
      
      expect(html).toContain("TARGET REACHED");
      expect(html).toContain("target-reached"); // CSS class
    });
  });

  describe("saveVisualizationReport", () => {
    it("writes interactive HTML report to filesystem", async () => {
      const filePath = path.join(tempDir, "drying-report.html");
      await saveVisualizationReport(session, filePath, { title: "Test Report" });
      
      expect(fs.existsSync(filePath)).toBe(true);
      
      const content = fs.readFileSync(filePath, "utf-8");
      expect(content).toContain("<!DOCTYPE html>");
      expect(content).toContain("Test Report");
      expect(content).toContain("Beef Jerky");
    });

    it("throws StorageError for relative file paths", async () => {
      await expect(
        saveVisualizationReport(session, "relative/path/report.html")
      ).rejects.toThrow(StorageError);
      
      await expect(
        saveVisualizationReport(session, "relative/path/report.html")
      ).rejects.toThrow("must be absolute");
    });

    it("throws StorageError for empty file paths", async () => {
      await expect(
        saveVisualizationReport(session, "")
      ).rejects.toThrow(StorageError);
      
      await expect(
        saveVisualizationReport(session, "")
      ).rejects.toThrow("non-empty string");
    });

    it("creates parent directories recursively when saving", async () => {
      const deepPath = path.join(tempDir, "level1", "level2", "report.html");
      await saveVisualizationReport(session, deepPath);
      
      expect(fs.existsSync(deepPath)).toBe(true);
      
      const content = fs.readFileSync(deepPath, "utf-8");
      expect(content).toContain("Weight Loss");
    });

    it("applies custom options when saving", async () => {
      const filePath = path.join(tempDir, "dark-report.html");
      await saveVisualizationReport(session, filePath, {
        theme: "dark",
        includeRawData: false,
        chartHeight: 400
      });
      
      const content = fs.readFileSync(filePath, "utf-8");
      expect(content).toContain("#1f2937"); // Dark theme background
      expect(content).not.toContain("Raw Measurements");
      expect(content).toContain("400px"); // Custom height
    });
  });
});
