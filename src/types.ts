import type { ReadonlyDeep } from "./utils";

/**
 * Represents a single weight measurement at a specific timestamp.
 * @property timestamp - ISO 8601 string of when measurement was taken
 * @property weightGrams - Weight in grams (must be positive)
 * @property temperatureCelsius - Optional temperature reading in Celsius
 * @property humidityPercent - Optional relative humidity percentage (0-100)
 */
export interface WeightEntry {
  readonly timestamp: string;
  readonly weightGrams: number;
  readonly temperatureCelsius?: number;
  readonly humidityPercent?: number;
}

/**
 * Configuration for a drying session.
 * @property sessionId - Unique identifier for the session
 * @property foodType - Descriptive label for the food being dried
 * @property initialWeightGrams - Starting weight in grams (must be positive)
 * @property targetMoisturePercent - Target moisture content percentage (0-100)
 * @property createdAt - ISO 8601 string of when session was created
 * @property notes - Optional free-form notes about the session
 */
export interface DryingConfig {
  readonly sessionId: string;
  readonly foodType: string;
  readonly initialWeightGrams: number;
  readonly targetMoisturePercent: number;
  readonly createdAt: string;
  readonly notes?: string;
}

/**
 * Estimated moisture content at a specific point in time.
 * @property timestamp - ISO 8601 string of when estimate was calculated
 * @property moisturePercent - Estimated moisture content percentage (0-100)
 * @property dryWeightGrams - Estimated dry matter weight in grams
 * @property currentWeightGrams - Actual measured weight at this time
 */
export interface MoistureEstimate {
  readonly timestamp: string;
  readonly moisturePercent: number;
  readonly dryWeightGrams: number;
  readonly currentWeightGrams: number;
}

/**
 * Drying rate calculation between two measurements.
 * @property startTimestamp - ISO 8601 string of the earlier measurement
 * @property endTimestamp - ISO 8601 string of the later measurement
 * @property weightLossGrams - Total weight lost between measurements
 * @property hoursElapsed - Time difference in hours
 * @property gramsPerHour - Weight loss rate in grams per hour
 */
export interface DryingRate {
  readonly startTimestamp: string;
  readonly endTimestamp: string;
  readonly weightLossGrams: number;
  readonly hoursElapsed: number;
  readonly gramsPerHour: number;
}

/**
 * Aggregated statistics for a drying session.
 * @property sessionId - Unique identifier for the session
 * @property totalWeightLossGrams - Cumulative weight loss from start to latest measurement
 * @property averageDryingRateGramsPerHour - Mean drying rate across all intervals
 * @property estimatedTimeRemainingHours - Predicted hours until target moisture reached
 * @property currentMoisturePercent - Latest moisture estimate
 * @property targetReached - Whether target moisture percentage has been achieved
 * @property measurementsCount - Total number of weight entries recorded
 */
export interface SessionSummary {
  readonly sessionId: string;
  readonly totalWeightLossGrams: number;
  readonly averageDryingRateGramsPerHour: number;
  readonly estimatedTimeRemainingHours: number;
  readonly currentMoisturePercent: number;
  readonly targetReached: boolean;
  readonly measurementsCount: number;
}

/**
 * Complete drying session with configuration and measurement history.
 * @property config - Session configuration and metadata
 * @property measurements - Chronologically ordered weight measurements
 * @property moistureEstimates - Calculated moisture content over time
 * @property dryingRates - Rate calculations between consecutive measurements
 * @property summary - Aggregated statistics for the session
 */
export interface DryingSession {
  readonly config: ReadonlyDeep<DryingConfig>;
  readonly measurements: readonly ReadonlyDeep<WeightEntry>[];
  readonly moistureEstimates: readonly ReadonlyDeep<MoistureEstimate>[];
  readonly dryingRates: readonly ReadonlyDeep<DryingRate>[];
  readonly summary: ReadonlyDeep<SessionSummary>;
}

/**
 * Validation error for weight measurements.
 * @property kind - Specific type of validation failure
 * @property message - Human-readable error description
 * @property value - The invalid value that caused the error
 */
export interface WeightValidationError {
  readonly kind: "negative-weight" | "invalid-temperature" | "invalid-humidity" | "future-timestamp";
  readonly message: string;
  readonly value: number | string;
}

/**
 * Result of attempting to add a weight measurement.
 * @property success - Whether the measurement was accepted
 * @property measurement - The validated weight entry if successful
 * @property error - Validation error details if unsuccessful
 */
export type AddMeasurementResult =
  | { readonly success: true; readonly measurement: ReadonlyDeep<WeightEntry> }
  | { readonly success: false; readonly error: WeightValidationError };

/**
 * Storage location configuration.
 * @property dataDir - Directory where session data is stored
 * @property filenamePattern - Pattern for session filenames (default: `${sessionId}.json`)
 */
export interface StorageConfig {
  readonly dataDir: string;
  readonly filenamePattern: string;
}

/**
 * Options for calculating drying rates.
 * @property minHoursBetweenMeasurements - Minimum time difference to calculate rate (default: 0.1)
 * @property maxHoursBetweenMeasurements - Maximum time difference to include (default: 24)
 */
export interface RateCalculationOptions {
  readonly minHoursBetweenMeasurements: number;
  readonly maxHoursBetweenMeasurements: number;
}

/**
 * Options for estimating moisture content.
 * @property assumedDryMatterDensity - Density of dry matter in g/cm³ (default: 1.5)
 * @property precisionDigits - Number of decimal places in results (default: 2)
 */
export interface MoistureEstimationOptions {
  readonly assumedDryMatterDensity: number;
  readonly precisionDigits: number;
}