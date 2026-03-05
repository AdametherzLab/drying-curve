import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import * as path from "path";
import * as os from "os";
import * as fs from "fs";
import {
  createSession,
  addWeightEntry,
  estimateMoisture,
  calculateDryingRate,
  detectTargetReached,
  getSessionSummary,
  saveSession,
  loadSession,
  loadAllSessions,
  deleteSession,
  type DryingSession,
  type DryingConfig,
  type WeightEntry,
} from "../src/index.js";

describe("drying-curve public API", () => {
  let testSession: DryingSession;
  let testConfig: Omit<DryingConfig, "sessionId" | "createdAt">;

  beforeEach(() => {
    testConfig = {
      foodType: "Beef Jerky",
      initialWeightGrams: 1000,
      targetMoisturePercent: 15,
    };
    testSession = createSession(testConfig);
  });

  describe("createSession", () => {
    it("creates a valid session with correct initial state", () => {
      expect(testSession.config.sessionId).toBeDefined();
      expect(testSession.config.sessionId.length).toBeGreaterThan(0);
      expect(testSession.config.foodType).toBe("Beef Jerky");
      expect(testSession.config.initialWeightGrams).toBe(1000);
      expect(testSession.config.targetMoisturePercent).toBe(15);
      expect(testSession.config.createdAt).toBeDefined();
      expect(new Date(testSession.config.createdAt).getTime()).not.toBeNaN();
      expect(testSession.measurements).toEqual([]);
      expect(testSession.moistureEstimates).toEqual([]);
      expect(testSession.dryingRates).toEqual([]);
      expect(testSession.summary).toBeDefined();
      expect(testSession.summary.measurementsCount).toBe(0);
      expect(testSession.summary.targetReached).toBe(false);
    });

    it("throws when initial weight is zero", () => {
      expect(() =>
        createSession({
          foodType: "Invalid",
          initialWeightGrams: 0,
          targetMoisturePercent: 10,
        })
      ).toThrow("Initial weight must be positive");
    });
  });

  describe("addWeightEntry", () => {
    it("appends entries and updates session state", () => {
      const entry1: WeightEntry = {
        timestamp: "2024-01-01T10:00:00Z",
        weightGrams: 950,
        temperatureCelsius: 60,
        humidityPercent: 20,
      };
      const entry2: WeightEntry = {
        timestamp: "2024-01-01T12:00:00Z",
        weightGrams: 900,
      };

      const session1 = addWeightEntry(testSession, entry1);
      expect(session1.measurements).toHaveLength(1);
      expect(session1.measurements[0].weightGrams).toBe(950);
      expect(session1.moistureEstimates).toHaveLength(1);
      expect(session1.dryingRates).toHaveLength(0); // Need 2 entries for rate

      const session2 = addWeightEntry(session1, entry2);
      expect(session2.measurements).toHaveLength(2);
      expect(session2.measurements[1].weightGrams).toBe(900);
      expect(session2.moistureEstimates).toHaveLength(2);
      expect(session2.dryingRates).toHaveLength(1);
      expect(session2.summary.measurementsCount).toBe(2);
    });

    it("rejects entry with weight greater than initial weight", () => {
      const invalidEntry: WeightEntry = {
        timestamp: "2024-01-01T10:00:00Z",
        weightGrams: 1200,
      };
      expect(() => addWeightEntry(testSession, invalidEntry)).toThrow(
        "Measurement validation failed: Weight must be positive"
      );
    });
  });

  describe("estimateMoisture", () => {
    it("returns correct moisture percentage and sets targetReached flag", () => {
      const entry1: WeightEntry = {
        timestamp: "2024-01-01T10:00:00Z",
        weightGrams: 950,
      };
      const session1 = addWeightEntry(testSession, entry1);
      const latestEstimate = session1.moistureEstimates[0];

      expect(latestEstimate.moisturePercent).toBeCloseTo(10.53, 1);
      expect(latestEstimate.dryWeightGrams).toBeCloseTo(850, 1);
      expect(latestEstimate.currentWeightGrams).toBe(950);
      expect(latestEstimate.timestamp).toBeDefined();

      expect(session1.summary.targetReached).toBe(false);

      const entry2: WeightEntry = {
        timestamp: "2024-01-01T14:00:00Z",
        weightGrams: 850,
      };
      const session2 = addWeightEntry(session1, entry2);
      expect(session2.summary.targetReached).toBe(true);
    });

    it("handles edge case where current weight equals initial weight", () => {
      const entry: WeightEntry = {
        timestamp: "2024-01-01T10:00:00Z",
        weightGrams: 1000,
      };
      const session = addWeightEntry(testSession, entry);
      const estimate = session.moistureEstimates[0];
      expect(estimate.moisturePercent).toBe(15);
      expect(estimate.dryWeightGrams).toBe(850);
    });
  });

  describe("calculateDryingRate", () => {
    it("returns null for fewer than 2 entries", () => {
      const entry: WeightEntry = {
        timestamp: "2024-01-01T10:00:00Z",
        weightGrams: 950,
      };
      const session = addWeightEntry(testSession, entry);
      expect(session.dryingRates).toHaveLength(0);
      expect(session.summary.averageDryingRateGramsPerHour).toBe(0);
    });

    it("returns correct rates for 2+ entries", () => {
      const entry1: WeightEntry = {
        timestamp: "2024-01-01T10:00:00Z",
        weightGrams: 950,
      };
      const entry2: WeightEntry = {
        timestamp: "2024-01-01T12:00:00Z",
        weightGrams: 900,
      };
      const session1 = addWeightEntry(testSession, entry1);
      const session2 = addWeightEntry(session1, entry2);

      expect(session2.dryingRates).toHaveLength(1);
      const rate = session2.dryingRates[0];
      expect(rate.weightLossGrams).toBe(50);
      expect(rate.hoursElapsed).toBe(2);
      expect(rate.gramsPerHour).toBe(25);
      expect(rate.startTimestamp).toBe("2024-01-01T10:00:00Z");
      expect(rate.endTimestamp).toBe("2024-01-01T12:00:00Z");
    });
  });

  describe("storage operations", () => {
    let tempDir: string;

    beforeEach(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "drying-curve-test-"));
    });

    afterEach(() => {
      fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it("round-trips a session through the file system", async () => {
      const entry: WeightEntry = {
        timestamp: "2024-01-01T10:00:00Z",
        weightGrams: 950,
      };
      const session = addWeightEntry(testSession, entry);

      await saveSession(session, tempDir);
      const loaded = await loadSession(session.config.sessionId, tempDir);

      expect(loaded).not.toBeNull();
      expect(loaded!.config.sessionId).toBe(session.config.sessionId);
      expect(loaded!.config.foodType).toBe("Beef Jerky");
      expect(loaded!.measurements).toHaveLength(1);
      expect(loaded!.measurements[0].weightGrams).toBe(950);
    });

    it("returns null for unknown session IDs", async () => {
      const result = await loadSession("non-existent-id", tempDir);
      expect(result).toBeNull();
    });

    it("returns all saved sessions", async () => {
      const session1 = createSession({
        foodType: "Apples",
        initialWeightGrams: 800,
        targetMoisturePercent: 20,
      });
      const session2 = createSession({
        foodType: "Bananas",
        initialWeightGrams: 600,
        targetMoisturePercent: 25,
      });

      await saveSession(session1, tempDir);
      await saveSession(session2, tempDir);

      const allSessions = await loadAllSessions(tempDir);
      expect(allSessions).toHaveLength(2);
      expect(allSessions.map((s) => s.config.foodType)).toEqual(
        expect.arrayContaining(["Apples", "Bananas"])
      );
    });

    it("deletes a session and returns true, false for missing IDs", async () => {
      const entry: WeightEntry = {
        timestamp: "2024-01-01T10:00:00Z",
        weightGrams: 950,
      };
      const session = addWeightEntry(testSession, entry);

      await saveSession(session, tempDir);

      const deleted1 = await deleteSession(session.config.sessionId, tempDir);
      expect(deleted1).toBe(true);

      const deleted2 = await deleteSession(session.config.sessionId, tempDir);
      expect(deleted2).toBe(false);

      const loaded = await loadSession(session.config.sessionId, tempDir);
      expect(loaded).toBeNull();
    });
  });
});