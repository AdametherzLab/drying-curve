export type {
  WeightEntry,
  DryingConfig,
  MoistureEstimate,
  DryingRate,
  SessionSummary,
  DryingSession,
  WeightValidationError,
  AddMeasurementResult,
  StorageConfig,
  RateCalculationOptions,
  MoistureEstimationOptions,
} from "./types.js";

export {
  SessionValidationError,
  MeasurementValidationError,
  createSession,
  validateWeightEntry,
  estimateMoisture,
  calculateDryingRate,
  detectTargetReached,
  addWeightEntry,
  getSessionSummary,
} from "./dryer.js";

export {
  StorageError,
  DEFAULT_DATA_DIR,
  DEFAULT_SESSION_FILE,
  createFileStorageAdapter,
  saveSession,
  loadSession,
  loadAllSessions,
  deleteSession,
} from "./storage.js";

export type { StorageAdapter } from "./storage.js";

// Interactive Drying Curve Visualization exports
export type {
  ChartPoint,
  ChartDataset,
  SessionVisualization,
  HTMLReportOptions,
} from "./visualization.js";

export {
  generateVisualizationData,
  generateHTMLReport,
  saveVisualizationReport,
} from "./visualization.js";
