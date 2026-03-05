// REMOVED external import: import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";

/** Adapter for persisting and retrieving drying sessions from a file. */
export interface StorageAdapter {
  /** Save a session, overwriting any existing session with the same ID. */
  saveSession(session: DryingSession): Promise<void>;
  /** Load a single session by its unique ID. Returns `null` if not found. */
  loadSession(sessionId: string): Promise<DryingSession | null>;
  /** Load all stored sessions. Returns an empty array if none exist. */
  loadAllSessions(): Promise<DryingSession[]>;
  /** Delete a session by its ID. Returns `true` if a session was deleted. */
  deleteSession(sessionId: string): Promise<boolean>;
}

/** Error thrown when a file operation fails due to invalid data. */
export class StorageError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "StorageError";
  }
}

/** Default directory for storing session data. */
export const DEFAULT_DATA_DIR = path.join(os.homedir(), ".drying-curve");

/** Default filename for the session store. */
export const DEFAULT_SESSION_FILE = "drying-sessions.json";

/**
 * Creates a file-based storage adapter.
 * @param filePath - Absolute path to the JSON file for storage.
 * @returns A configured StorageAdapter instance.
 * @example
 * const adapter = createFileStorageAdapter("/home/user/.drying-curve/sessions.json");
 */
export function createFileStorageAdapter(filePath: string): StorageAdapter {
  return {
    saveSession: async (session) => saveSessionToFile(filePath, session),
    loadSession: async (sessionId) => loadSessionFromFile(filePath, sessionId),
    loadAllSessions: async () => loadAllSessionsFromFile(filePath),
    deleteSession: async (sessionId) => deleteSessionFromFile(filePath, sessionId),
  };
}

/**
 * Saves a session to the store file, performing an atomic write.
 * @param filePath - Path to the target JSON file.
 * @param session - The session object to save.
 * @throws {StorageError} If the file cannot be written or serialization fails.
 */
async function saveSessionToFile(filePath: string, session: DryingSession): Promise<void> {
  const allSessions = await loadAllSessionsFromFile(filePath);
  const otherSessions = allSessions.filter((s) => s.config.sessionId !== session.config.sessionId);
  const updatedSessions = [...otherSessions, session];

  const tempFilePath = `${filePath}.tmp`;
  const data = JSON.stringify(updatedSessions, null, 2);

  try {
    await fs.writeFile(tempFilePath, data, "utf-8");
    await fs.rename(tempFilePath, filePath);
  } catch (error) {
    throw new StorageError(`Failed to write session file: ${filePath}`, error);
  }
}

/**
 * Loads a single session by ID from the store file.
 * @param filePath - Path to the JSON file.
 * @param sessionId - Unique identifier of the session.
 * @returns The session if found, otherwise `null`.
 * @throws {StorageError} If the file exists but contains invalid JSON.
 */
async function loadSessionFromFile(filePath: string, sessionId: string): Promise<DryingSession | null> {
  const allSessions = await loadAllSessionsFromFile(filePath);
  return allSessions.find((s) => s.config.sessionId === sessionId) ?? null;
}

/**
 * Loads all sessions from the store file.
 * @param filePath - Path to the JSON file.
 * @returns Array of all stored sessions; empty array if file does not exist.
 * @throws {StorageError} If the file exists but contains invalid JSON or data structure.
 */
async function loadAllSessionsFromFile(filePath: string): Promise<DryingSession[]> {
  try {
    const rawData = await fs.readFile(filePath, "utf-8");
    const parsed = JSON.parse(rawData);

    if (!Array.isArray(parsed)) {
      throw new StorageError(`Session file does not contain an array: ${filePath}`);
    }

    // Basic structural validation
    const isValidSession = (obj: unknown): obj is DryingSession =>
      typeof obj === "object" &&
      obj !== null &&
      "config" in obj &&
      typeof (obj as DryingSession).config === "object" &&
      "sessionId" in (obj as DryingSession).config;

    const sessions = parsed.filter(isValidSession);
    return sessions;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw new StorageError(`Failed to load sessions from file: ${filePath}`, error);
  }
}

/**
 * Deletes a session by ID from the store file.
 * @param filePath - Path to the JSON file.
 * @param sessionId - Unique identifier of the session to delete.
 * @returns `true` if a session was deleted, `false` if not found.
 * @throws {StorageError} If the file operation fails.
 */
async function deleteSessionFromFile(filePath: string, sessionId: string): Promise<boolean> {
  const allSessions = await loadAllSessionsFromFile(filePath);
  const initialLength = allSessions.length;
  const remainingSessions = allSessions.filter((s) => s.config.sessionId !== sessionId);

  if (remainingSessions.length === initialLength) {
    return false;
  }

  const tempFilePath = `${filePath}.tmp`;
  const data = JSON.stringify(remainingSessions, null, 2);

  try {
    await fs.writeFile(tempFilePath, data, "utf-8");
    await fs.rename(tempFilePath, filePath);
    return true;
  } catch (error) {
    throw new StorageError(`Failed to delete session from file: ${filePath}`, error);
  }
}

/**
 * Convenience function to save a session using the default storage location.
 * @param session - The session to save.
 * @param dataDir - Optional custom data directory (defaults to ~/.drying-curve).
 * @throws {StorageError} If the file operation fails.
 */
export async function saveSession(session: DryingSession, dataDir?: string): Promise<void> {
  const dir = dataDir ?? DEFAULT_DATA_DIR;
  await fs.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, DEFAULT_SESSION_FILE);
  const adapter = createFileStorageAdapter(filePath);
  await adapter.saveSession(session);
}

/**
 * Convenience function to load a session by ID from the default storage location.
 * @param sessionId - Unique identifier of the session.
 * @param dataDir - Optional custom data directory (defaults to ~/.drying-curve).
 * @returns The session if found, otherwise `null`.
 * @throws {StorageError} If the file exists but contains invalid data.
 */
export async function loadSession(sessionId: string, dataDir?: string): Promise<DryingSession | null> {
  const dir = dataDir ?? DEFAULT_DATA_DIR;
  const filePath = path.join(dir, DEFAULT_SESSION_FILE);
  const adapter = createFileStorageAdapter(filePath);
  return adapter.loadSession(sessionId);
}

/**
 * Convenience function to load all sessions from the default storage location.
 * @param dataDir - Optional custom data directory (defaults to ~/.drying-curve).
 * @returns Array of all stored sessions; empty array if none exist.
 * @throws {StorageError} If the file exists but contains invalid data.
 */
export async function loadAllSessions(dataDir?: string): Promise<DryingSession[]> {
  const dir = dataDir ?? DEFAULT_DATA_DIR;
  const filePath = path.join(dir, DEFAULT_SESSION_FILE);
  const adapter = createFileStorageAdapter(filePath);
  return adapter.loadAllSessions();
}

/**
 * Convenience function to delete a session by ID from the default storage location.
 * @param sessionId - Unique identifier of the session to delete.
 * @param dataDir - Optional custom data directory (defaults to ~/.drying-curve).
 * @returns `true` if a session was deleted, `false` if not found.
 * @throws {StorageError} If the file operation fails.
 */
export async function deleteSession(sessionId: string, dataDir?: string): Promise<boolean> {
  const dir = dataDir ?? DEFAULT_DATA_DIR;
  const filePath = path.join(dir, DEFAULT_SESSION_FILE);
  const adapter = createFileStorageAdapter(filePath);
  return adapter.deleteSession(sessionId);
}