[![CI](https://github.com/AdametherzLab/drying-curve/actions/workflows/ci.yml/badge.svg)](https://github.com/AdametherzLab/drying-curve/actions) [![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue)](https://www.typescriptlang.org/) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

# drying-curve 🍖➡️🥓

**Track weight loss, estimate moisture, and nail the perfect dry every time.** A zero-dependency TypeScript library for logging food dehydrator sessions, calculating drying rates, and predicting when your jerky, fruit leather, or herbs are perfectly ready.

## ✨ Features

✅ **Precision Moisture Estimation** – Uses dry matter conservation to calculate moisture content from weight loss.  
✅ **Real-time Drying Rates** – Track grams-per-hour loss to understand your dehydrator's performance.  
✅ **Target Detection** – Get notified when your food hits the perfect moisture level.  
✅ **TypeScript First** – Full type safety with all interfaces exported for your convenience.  
✅ **Zero Dependencies** – Built with Node.js/Bun built-ins only. No bloat, just pure logic.  
✅ **Persistent Storage** – Automatically saves sessions to `~/.drying-curve` with a clean file format.

## 📦 Installation

```bash
# Using npm
npm install @adametherzlab/drying-curve

# Using Bun
bun add @adametherzlab/drying-curve
```

## 🚀 Quick Start

```typescript
// REMOVED external import: import { createSession, addWeightEntry, getSessionSummary, saveSession } from "@adametherzlab/drying-curve";

// 1. Create a new session for your beef jerky
const session = createSession({
  foodType: "Beef Jerky",
  initialWeightGrams: 1000,
  targetMoisturePercent: 15,
  notes: "Marinated in soy sauce & honey"
});

// 2. Add weight measurements over time
const updatedSession = addWeightEntry(session, {
  timestamp: new Date().toISOString(),
  weightGrams: 850,
  temperatureCelsius: 62,
  humidityPercent: 25
});

// 3. Save to disk (default: ~/.drying-curve/{sessionId}.json)
await saveSession(updatedSession);

// 4. Get a comprehensive summary
const summary = getSessionSummary(updatedSession);
console.log(`Current moisture: ${summary.currentMoisturePercent}%`);
console.log(`Target reached? ${summary.targetReached}`);
console.log(`Avg drying rate: ${summary.averageDryingRateGramsPerHour} g/h`);
```

## 📚 API Reference

### Core Functions

#### `createSession(config)`
```typescript
// REMOVED external import: import { createSession } from "@adametherzlab/drying-curve";
// REMOVED external import: import type { DryingConfig } from "@adametherzlab/drying-curve";

const config: Omit<DryingConfig, "sessionId" | "createdAt"> = {
  foodType: "Apple Leather",
  initialWeightGrams: 500,
  targetMoisturePercent: 20
};
const session = createSession(config);
```

#### `addWeightEntry(session, entry)`
```typescript
// REMOVED external import: import { addWeightEntry } from "@adametherzlab/drying-curve";
// REMOVED external import: import type { WeightEntry } from "@adametherzlab/drying-curve";

const entry: WeightEntry = {
  timestamp: "2024-01-15T14:30:00Z",
  weightGrams: 450,
  temperatureCelsius: 57,
  humidityPercent: 30
};
const updatedSession = addWeightEntry(session, entry);
```

#### `getSessionSummary(session)`
```typescript
// REMOVED external import: import { getSessionSummary } from "@adametherzlab/drying-curve";
// REMOVED external import: import type { SessionSummary } from "@adametherzlab/drying-curve";

const summary: SessionSummary = getSessionSummary(session);
console.log(`Measurements: ${summary.measurementsCount}`);
console.log(`Time remaining: ~${summary.estimatedTimeRemainingHours} hours`);
```

#### `estimateMoisture(session, currentWeightGrams, options?)`
```typescript
// REMOVED external import: import { estimateMoisture } from "@adametherzlab/drying-curve";
// REMOVED external import: import type { MoistureEstimate } from "@adametherzlab/drying-curve";

const estimate: MoistureEstimate = estimateMoisture(session, 420);
console.log(`Moisture: ${estimate.moisturePercent}%`);
```

#### `calculateDryingRate(previousEntry, currentEntry, options?)`
```typescript
// REMOVED external import: import { calculateDryingRate } from "@adametherzlab/drying-curve";
// REMOVED external import: import type { DryingRate } from "@adametherzlab/drying-curve";

const rate: DryingRate | null = calculateDryingRate(firstEntry, secondEntry);
if (rate) console.log(`Drying rate: ${rate.gramsPerHour} g/h`);
```

#### `detectTargetReached(session)`
```typescript
// REMOVED external import: import { detectTargetReached } from "@adametherzlab/drying-curve";

if (detectTargetReached(session)) {
  console.log("🎉 Your food is ready!");
}
```

### Storage Functions

#### `saveSession(session, dataDir?)`
```typescript
// REMOVED external import: import { saveSession } from "@adametherzlab/drying-curve";

await saveSession(session); // Uses ~/.drying-curve
await saveSession(session, "./custom-data-dir"); // Custom directory
```

#### `loadSession(sessionId, dataDir?)`
```typescript
// REMOVED external import: import { loadSession } from "@adametherzlab/drying-curve";

const loaded = await loadSession("session_123");
if (loaded) console.log(`Loaded: ${loaded.config.foodType}`);
```

#### `loadAllSessions(dataDir?)`
```typescript
// REMOVED external import: import { loadAllSessions } from "@adametherzlab/drying-curve";

const allSessions = await loadAllSessions();
console.log(`Found ${allSessions.length} sessions`);
```

#### `deleteSession(sessionId, dataDir?)`
```typescript
// REMOVED external import: import { deleteSession } from "@adametherzlab/drying-curve";

const deleted = await deleteSession("session_123");
if (deleted) console.log("Session deleted");
```

## 🧠 Advanced Usage

```typescript
import {
  createSession,
  addWeightEntry,
  getSessionSummary,
  estimateMoisture,
  saveSession,
  loadAllSessions,
  detectTargetReached
} from "@adametherzlab/drying-curve";
// REMOVED external import: import type { DryingSession, WeightEntry } from "@adametherzlab/drying-curve";

// Create session
let session = createSession({
  foodType: "Teriyaki Beef Jerky",
  initialWeightGrams: 1200,
  targetMoisturePercent: 18,
  notes: "Thick-cut, 6mm slices"
});

// Simulate measurements every 2 hours
const measurements: WeightEntry[] = [
  { timestamp: "2024-01-15T10:00:00Z", weightGrams: 1200 },
  { timestamp: "2024-01-15T12:00:00Z", weightGrams: 1050, temperatureCelsius: 65 },
  { timestamp: "2024-01-15T14:00:00Z", weightGrams: 920, temperatureCelsius: 63, humidityPercent: 28 },
  { timestamp: "2024-01-15T16:00:00Z", weightGrams: 810, temperatureCelsius: 64, humidityPercent: 26 }
];

for (const entry of measurements) {
  session = addWeightEntry(session, entry);
  
  const moisture = estimateMoisture(session, entry.weightGrams);
  console.log(`At ${new Date(entry.timestamp).toLocaleTimeString()}: ${moisture.moisturePercent}% moisture`);
  
  if (detectTargetReached(session)) {
    console.log("✅ Target moisture reached!");
    break;
  }
}

// Save and analyze
await saveSession(session);
const summary = getSessionSummary(session);

console.log(`
Session Summary:
- Total weight loss: ${summary.totalWeightLossGrams}g
- Average drying rate: ${summary.averageDryingRateGramsPerHour.toFixed(1)} g/h
- Estimated time remaining: ${summary.estimatedTimeRemainingHours?.toFixed(1) || "N/A"} hours
- Measurements: ${summary.measurementsCount}
`);

// Later, load all sessions for analysis
const allSessions = await loadAllSessions();
const jerkySessions = allSessions.filter(s => s.config.foodType.includes("Jerky"));
console.log(`Found ${jerkySessions.length} jerky sessions for comparison`);
```

## 🔬 Moisture Estimation Formula

```
Moisture % = 100 × (Current Weight - Dry Weight) / Current Weight
```

Where **Dry Weight** is calculated as:

```
Dry Weight = Initial Weight × (1 - Initial Moisture Assumption / 100)
```

**Assumptions:**
- Initial moisture content is estimated based on food type (typically 70-90% for fresh foods)
- Dry matter weight remains constant during drying (water evaporates, solids don't)
- The formula provides **relative estimates** – for absolute accuracy, use a dedicated moisture analyzer

**Default initial moisture assumptions:**
- Fruits & Vegetables: 85%
- Meats (Jerky): 70%
- Herbs: 80%
- Fish: 75%

These are configurable via `MoistureEstimationOptions` if you have more precise initial data.

## 💾 Storage File Format

```json
{
  "config": {
    "sessionId": "session_abc123",
    "foodType": "Beef Jerky",
    "initialWeightGrams": 1000,
    "targetMoisturePercent": 15,
    "createdAt": "2024-01-15T09:00:00.000Z",
    "notes": "Marinated for 24 hours"
  },
  "measurements": [
    {
      "timestamp": "2024-01-15T10:00:00.000Z",
      "weightGrams": 1000,
      "temperatureCelsius": 25,
      "humidityPercent": 45
    }
  ],
  "moistureEstimates": [],
  "dryingRates": [],
  "summary": {
    "sessionId": "session_abc123",
    "totalWeightLossGrams": 0,
    "averageDryingRateGramsPerHour": 0,
    "estimatedTimeRemainingHours": null,
    "currentMoisturePercent": 70,
    "targetReached": false,
    "measurementsCount": 1
  }
}
```

The format is human-readable and can be easily imported into other tools for analysis.

## 📈 Interpreting Drying Curves

### What Drying Rates Mean in Practice

**Typical drying rates for common foods:**

| Food Type | Target Moisture | Initial Rate | Final Rate | Total Time |
|-----------|----------------|--------------|------------|------------|
| **Beef Jerky** | 15-20% | 25-35 g/h | 5-10 g/h | 4-6 hours |
| **Fruit Leather** | 20-25% | 40-50 g/h | 8-12 g/h | 6-8 hours |
| **Herbs** | 8-12% | 15-20 g/h | 2-4 g/h | 2-3 hours |
| **Fish Jerky** | 18-22% | 20-30 g/h | 4-8 g/h | 5-7 hours |

**Key patterns to watch for:**

1. **High initial rate** (first 1-2 hours): Surface moisture evaporates quickly
2. **Linear phase** (middle period): Steady rate as internal moisture migrates to surface
3. **Falling rate** (final hours): Rate decreases as food approaches target moisture
4. **Plateau**: Rate near zero indicates drying is complete

**When to stop drying:**
- Jerky: When rate drops below 5 g/h for 30 minutes
- Fruit leather: When rate drops below 8 g/h for 45 minutes
- Herbs: When leaves crumble easily (rate near 0 g/h)

## 🧪 TypeScript Usage

```typescript
import type {
  DryingSession,
  WeightEntry,
  DryingConfig,
  MoistureEstimate,
  DryingRate,
  SessionSummary,
  StorageConfig,
  RateCalculationOptions,
  MoistureEstimationOptions
} from "@adametherzlab/drying-curve";

// Use in your own functions
function analyzeSession(session: DryingSession): AnalysisResult {
  // Full type safety with autocomplete
  const latestWeight = session.measurements[session.measurements.length - 1]?.weightGrams;
  // ...
}
```

## 🤝 Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, coding standards, and pull request guidelines.

## 📄 License

MIT © [AdametherzLab](https://github.com/AdametherzLab)