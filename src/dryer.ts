import * as crypto from "crypto";
import type {
  DryingConfig,
  WeightEntry,
  MoistureEstimate,
  DryingRate,
  SessionSummary,
  DryingSession,
  WeightValidationError,
  AddMeasurementResult,
  StorageConfig,
  RateCalculationOptions,
  MoistureEstimationOptions
} from "./types.js";

/** Default options for rate calculations. */
const DEFAULT_RATE_OPTIONS: RateCalculationOptions = {
  minHoursBetweenMeasurements: 0.1,
  maxHoursBetweenMeasurements: 24
} as const;

/** Default options for moisture estimation. */
const DEFAULT_MOISTURE_OPTIONS: MoistureEstimationOptions = {
  assumedDryMatterDensity: 1.0,
  precisionDigits: 2
} as const;

/** Error thrown when session validation fails. */
export class SessionValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SessionValidationError";
  }
}

/** Error thrown when measurement validation fails. */
export class MeasurementValidationError extends Error {
  constructor(
    public readonly validationErrors: readonly WeightValidationError[],
    message: string
  ) {
    super(message);
    this.name = "MeasurementValidationError";
  }
}

/**
 * Creates a new drying session with a unique ID.
 * @param config - Configuration for the drying session
 * @returns A new drying session with empty measurements
 * @throws {SessionValidationError} If config validation fails
 * @example
 * const session = createSession({
 *   foodType: "Beef Jerky",
 *   initialWeightGrams: 1000,
 *   targetMoisturePercent: 15
 * });
 */
export function createSession(config: Omit<DryingConfig, "sessionId" | "createdAt">): DryingSession {
  if (config.initialWeightGrams <= 0) {
    throw new SessionValidationError("Initial weight must be positive");
  }
  if (config.targetMoisturePercent < 0 || config.targetMoisturePercent > 100) {
    throw new SessionValidationError("Target moisture must be between 0 and 100 percent");
  }

  const sessionId = crypto.randomUUID();
  const createdAt = new Date().toISOString();

  const fullConfig: DryingConfig = {
    ...config,
    sessionId,
    createdAt
  };

  return {
    config: fullConfig,
    measurements: [],
    moistureEstimates: [],
    dryingRates: [],
    summary: {
      sessionId,
      totalWeightLossGrams: 0,
      averageDryingRateGramsPerHour: 0,
      estimatedTimeRemainingHours: 0,
      currentMoisturePercent: 100,
      targetReached: false,
      measurementsCount: 0
    }
  };
}

/**
 * Validates a weight measurement entry.
 * @param entry - The weight entry to validate
 * @returns Array of validation errors (empty if valid)
 */
export function validateWeightEntry(entry: WeightEntry): readonly WeightValidationError[] {
  const errors: WeightValidationError[] = [];

  if (entry.weightGrams <= 0) {
    errors.push({
      kind: "negative-weight",
      message: "Weight must be positive",
      value: entry.weightGrams
    });
  }

  if (entry.temperatureCelsius !== undefined) {
    if (entry.temperatureCelsius < -50 || entry.temperatureCelsius > 200) {
      errors.push({
        kind: "invalid-temperature",
        message: "Temperature must be between -50°C and 200°C",
        value: entry.temperatureCelsius
      });
    }
  }

  if (entry.humidityPercent !== undefined) {
    if (entry.humidityPercent < 0 || entry.humidityPercent > 100) {
      errors.push({
        kind: "invalid-humidity",
        message: "Humidity must be between 0 and 100 percent",
        value: entry.humidityPercent
      });
    }
  }

  const entryTime = new Date(entry.timestamp);
  const now = new Date();
  if (entryTime > now) {
    errors.push({
      kind: "future-timestamp",
      message: "Timestamp cannot be in the future",
      value: entry.timestamp
    });
  }

  return errors;
}

/**
 * Estimates moisture percentage from weight measurements.
 * @param session - Current drying session
 * @param currentWeightGrams - Most recent weight measurement
 * @param options - Moisture estimation options
 * @returns Moisture estimate with timestamp
 */
export function estimateMoisture(
  session: DryingSession,
  currentWeightGrams: number,
  options: Partial<MoistureEstimationOptions> = {}
): MoistureEstimate {
  const mergedOptions = { ...DEFAULT_MOISTURE_OPTIONS, ...options };
  const { initialWeightGrams, targetMoisturePercent } = session.config;

  // Calculate dry matter weight (conserved during drying)
  const dryMatterWeight = initialWeightGrams * (1 - targetMoisturePercent / 100);
  
  // Moisture percentage formula: (currentWeight - dryMatterWeight) / currentWeight * 100
  const moisturePercent = ((currentWeightGrams - dryMatterWeight) / currentWeightGrams) * 100;
  
  const roundedMoisture = Number(moisturePercent.toFixed(mergedOptions.precisionDigits));
  const roundedDryWeight = Number(dryMatterWeight.toFixed(mergedOptions.precisionDigits));

  return {
    timestamp: new Date().toISOString(),
    moisturePercent: Math.max(0, roundedMoisture),
    dryWeightGrams: roundedDryWeight,
    currentWeightGrams: Number(currentWeightGrams.toFixed(mergedOptions.precisionDigits))
  };
}

/**
 * Calculates drying rate between two measurements.
 * @param previousEntry - Earlier weight measurement
 * @param currentEntry - Later weight measurement
 * @param options - Rate calculation options
 * @returns Drying rate in grams per hour, or null if invalid
 */
export function calculateDryingRate(
  previousEntry: WeightEntry,
  currentEntry: WeightEntry,
  options: Partial<RateCalculationOptions> = {}
): DryingRate | null {
  const mergedOptions = { ...DEFAULT_RATE_OPTIONS, ...options };
  
  const previousTime = new Date(previousEntry.timestamp);
  const currentTime = new Date(currentEntry.timestamp);
  const hoursElapsed = (currentTime.getTime() - previousTime.getTime()) / (1000 * 60 * 60);
  
  // Skip if measurements are too close or too far apart
  if (hoursElapsed < mergedOptions.minHoursBetweenMeasurements) {
    return null;
  }
  if (hoursElapsed > mergedOptions.maxHoursBetweenMeasurements) {
    return null;
  }
  
  const weightLossGrams = previousEntry.weightGrams - currentEntry.weightGrams;
  
  // Skip if weight increased (measurement error or rehydration)
  if (weightLossGrams <= 0) {
    return null;
  }
  
  const gramsPerHour = weightLossGrams / hoursElapsed;
  
  return {
    startTimestamp: previousEntry.timestamp,
    endTimestamp: currentEntry.timestamp,
    weightLossGrams: Number(weightLossGrams.toFixed(2)),
    hoursElapsed: Number(hoursElapsed.toFixed(2)),
    gramsPerHour: Number(gramsPerHour.toFixed(2))
  };
}

/**
 * Checks if target moisture has been reached.
 * @param session - Current drying session
 * @returns True if current moisture is at or below target
 */
export function detectTargetReached(session: DryingSession): boolean {
  if (session.moistureEstimates.length === 0) {
    return false;
  }
  
  const latestEstimate = session.moistureEstimates[session.moistureEstimates.length - 1];
  return latestEstimate.moisturePercent <= session.config.targetMoisturePercent;
}

/**
 * Adds a weight measurement to a drying session.
 * @param session - Current drying session
 * @param entry - New weight measurement
 * @returns Updated session with new measurement and recalculated values
 * @throws {MeasurementValidationError} If entry validation fails
 */
export function addWeightEntry(
  session: DryingSession,
  entry: Omit<WeightEntry, "timestamp"> & { timestamp?: string }
): DryingSession {
  const timestamp = entry.timestamp || new Date().toISOString();
  const fullEntry: WeightEntry = {
    ...entry,
    timestamp
  };
  
  const validationErrors = validateWeightEntry(fullEntry);
  if (validationErrors.length > 0) {
    throw new MeasurementValidationError(
      validationErrors,
      `Measurement validation failed: ${validationErrors.map(e => e.message).join(", ")}`
    );
  }
  
  const updatedMeasurements = [...session.measurements, fullEntry];
  
  // Calculate moisture estimate for this measurement
  const moistureEstimate = estimateMoisture(session, fullEntry.weightGrams);
  const updatedMoistureEstimates = [...session.moistureEstimates, moistureEstimate];
  
  // Calculate drying rate if we have at least two measurements
  let updatedDryingRates = [...session.dryingRates];
  if (updatedMeasurements.length >= 2) {
    const previousEntry = updatedMeasurements[updatedMeasurements.length - 2];
    const dryingRate = calculateDryingRate(previousEntry, fullEntry);
    if (dryingRate) {
      updatedDryingRates = [...updatedDryingRates, dryingRate];
    }
  }
  
  // Update session summary
  const updatedSummary = getSessionSummary({
    ...session,
    measurements: updatedMeasurements,
    moistureEstimates: updatedMoistureEstimates,
    dryingRates: updatedDryingRates
  });
  
  return {
    ...session,
    measurements: updatedMeasurements,
    moistureEstimates: updatedMoistureEstimates,
    dryingRates: updatedDryingRates,
    summary: updatedSummary
  };
}

/**
 * Generates a comprehensive session summary.
 * @param session - Current drying session
 * @returns Aggregated session statistics
 */
export function getSessionSummary(session: DryingSession): SessionSummary {
  if (session.measurements.length === 0) {
    return {
      sessionId: session.config.sessionId,
      totalWeightLossGrams: 0,
      averageDryingRateGramsPerHour: 0,
      estimatedTimeRemainingHours: 0,
      currentMoisturePercent: 100,
      targetReached: false,
      measurementsCount: 0
    };
  }
  
  const initialWeight = session.config.initialWeightGrams;
  const latestWeight = session.measurements[session.measurements.length - 1].weightGrams;
  const totalWeightLoss = initialWeight - latestWeight;
  
  const currentMoisture = session.moistureEstimates.length > 0
    ? session.moistureEstimates[session.moistureEstimates.length - 1].moisturePercent
    : 100;
  
  const targetReached = detectTargetReached(session);
  
  // Calculate average drying rate from all valid rate calculations
  let averageRate = 0;
  if (session.dryingRates.length > 0) {
    const totalGramsPerHour = session.dryingRates.reduce((sum, rate) => sum + rate.gramsPerHour, 0);
    averageRate = totalGramsPerHour / session.dryingRates.length;
  }
  
  // Estimate time remaining based on current rate and remaining moisture to lose
  let estimatedTimeRemaining = 0;
  if (averageRate > 0 && !targetReached) {
    const remainingMoisture = currentMoisture - session.config.targetMoisturePercent;
    const remainingWaterWeight = (remainingMoisture / 100) * latestWeight;
    estimatedTimeRemaining = remainingWaterWeight / averageRate;
  }
  
  return {
    sessionId: session.config.sessionId,
    totalWeightLossGrams: Number(totalWeightLoss.toFixed(2)),
    averageDryingRateGramsPerHour: Number(averageRate.toFixed(2)),
    estimatedTimeRemainingHours: Number(estimatedTimeRemaining.toFixed(1)),
    currentMoisturePercent: Number(currentMoisture.toFixed(1)),
    targetReached,
    measurementsCount: session.measurements.length
  };
}