import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import type { DryingSession } from "./types.js";

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

/** Error thrown when a file operation fails. */
export class StorageError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
    public readonly code?: string
  ) {
    super(message);
    this.name = "StorageError";
  }
}

/** Default directory for storing session data. */
export const DEFAULT_DATA_DIR = path.join(os.homedir(), ".drying-curve");

/** Default filename for the session store. */
export const DEFAULT_SESSION_FILE = "drying-sessions.json";

/**
 * Classifies a file-system error into a human-readable StorageError.
 * @param error - The caught error object
 * @param operation - Description of what was being attempted
 * @param filePath - The file path involved
 * @returns A StorageError with an appropriate message and code
 */
function classifyFileError(error: unknown, operation: string, filePath: string): StorageError {
  const errno = (error as NodeJS.ErrnoException).code;
  switch (errno) {
    case "EACCES":
    case "EPERM":
      return new StorageError(
        `Permission denied while ${operation}: ${filePath}`,
        error,
        errno
      );
    case "ENOSPC":
      return new StorageError(
        `Disk full while ${operation}: ${filePath}`,
        error,
        errno
      );
    case "EISDIR":
      return new StorageError(
        `Expected a file but found a directory: ${filePath}`,
        error,
        errno
      );
    case "ENOTDIR":
      return new StorageError(
        `Parent path is not a directory: ${filePath}`,
        error,
        errno
      );
    case "EMFILE":
    case "ENFILE":
      return new StorageError(
        `Too many open files while ${operation}: ${filePath}`,
        error,
        errno
      );
    case "EROFS":
      return new StorageError(
        `Read-only file system while ${operation}: ${filePath}`,
        error,
        errno
      );
    default:
      return new StorageError(
        `Failed to ${operation}: ${filePath}`,
        error,
        errno
      );
  }
}

/**
 * Removes a temporary file if it exists, swallowing errors.
 * @param tempPath - Path to the temp file to clean up
 */
async function cleanupTempFile(tempPath: string): Promise<void> {
  try {
    await fs.unlink(tempPath);
  } catch {
    // Intentionally swallowed — temp file may not exist
  }
}

/**
 * Ensures the parent directory of a file path exists.
 * @param filePath - The file whose parent directory should be created
 * @throws {StorageError} If directory creation fails
 */
async function ensureParentDir(filePath: string): Promise<void> {
  const dir = path.dirname(filePath);
  try {
    await fs.mkdir(dir, { recursive: true });
  } catch (error) {
    throw classifyFileError(error, "create directory", dir);
  }
}

/**
 * Atomically writes JSON data to a file using a temp-file + rename strategy.
 * Cleans up the temp file on failure.
 * @param filePath - Target file path
 * @param data - Serializable data to write
 * @throws {StorageError} If serialization or file write fails
 */
async function atomicWriteJSON(filePath: string, data: unknown): Promise<void> {
  let serialized: string;
  try {
    serialized = JSON.stringify(data, null, 2);
  } catch (error) {
    throw new StorageError(
      `Failed to serialize session data for: ${filePath}`,
      error,
      "SERIALIZE"
    );
  }

  await ensureParentDir(filePath);
  const tempFilePath = `${filePath}.tmp`;

  try {
    await fs.writeFile(tempFilePath, serialized, "utf-8");
  } catch (error) {
    await cleanupTempFile(tempFilePath);
    throw classifyFileError(error, "write temp file", tempFilePath);
  }

  try {
    await fs.rename(tempFilePath, filePath);
  } catch (error) {
    await cleanupTempFile(tempFilePath);
    throw classifyFileError(error, "rename temp file", filePath);
  }
}

/**
 * Creates a file-based storage adapter.
 * @param filePath - Absolute path to the JSON file for storage.
 * @returns A configured StorageAdapter instance.
 * @example
 * const adapter = createFileStorageAdapter("/home/user/.drying-curve/sessions.json");
 */
export function createFileStorageAdapter(filePath: string): StorageAdapter {
  if (!filePath || typeof filePath !== "string") {
    throw new StorageError("File path must be a non-empty string", undefined, "INVALID_PATH");
  }
  if (!path.isAbsolute(filePath)) {
    throw new StorageError(
      `File path must be absolute, got: ${filePath}`,
      undefined,
      "INVALID_PATH"
    );
  }

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
  if (!session?.config?.sessionId) {
    throw new StorageError(
      "Cannot save session: missing config.sessionId",
      undefined,
      "INVALID_SESSION"
    );
  }

  const allSessions = await loadAllSessionsFromFile(filePath);
  const otherSessions = allSessions.filter((s) => s.config.sessionId !== session.config.sessionId);
  const updatedSessions = [...otherSessions, session];

  await atomicWriteJSON(filePath, updatedSessions);
}

/**
 * Loads a single session by ID from the store file.
 * @param filePath - Path to the JSON file.
 * @param sessionId - Unique identifier of the session.
 * @returns The session if found, otherwise `null`.
 * @throws {StorageError} If the file exists but contains invalid JSON.
 */
async function loadSessionFromFile(filePath: string, sessionId: string): Promise<DryingSession | null> {
  if (!sessionId || typeof sessionId !== "string") {
    throw new StorageError(
      "Session ID must be a non-empty string",
      undefined,
      "INVALID_SESSION_ID"
    );
  }
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
  let rawData: string;
  try {
    rawData = await fs.readFile(filePath, "utf-8");
  } catch (error) {
    const errno = (error as NodeJS.ErrnoException).code;
    if (errno === "ENOENT") {
      return [];
    }
    throw classifyFileError(error, "read session file", filePath);
  }

  if (rawData.trim().length === 0) {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawData);
  } catch (error) {
    throw new StorageError(
      `Session file contains invalid JSON: ${filePath}`,
      error,
      "INVALID_JSON"
    );
  }

  if (!Array.isArray(parsed)) {
    throw new StorageError(
      `Session file does not contain an array: ${filePath}`,
      undefined,
      "INVALID_FORMAT"
    );
  }

  const isValidSession = (obj: unknown): obj is DryingSession =>
    typeof obj === "object" &&
    obj !== null &&
    "config" in obj &&
    typeof (obj as DryingSession).config === "object" &&
    "sessionId" in (obj as DryingSession).config;

  return parsed.filter(isValidSession);
}

/**
 * Deletes a session by ID from the store file.
 * @param filePath - Path to the JSON file.
 * @param sessionId - Unique identifier of the session to delete.
 * @returns `true` if a session was deleted, `false` if not found.
 * @throws {StorageError} If the file operation fails.
 */
async function deleteSessionFromFile(filePath: string, sessionId: string): Promise<boolean> {
  if (!sessionId || typeof sessionId !== "string") {
    throw new StorageError(
      "Session ID must be a non-empty string",
      undefined,
      "INVALID_SESSION_ID"
    );
  }

  const allSessions = await loadAllSessionsFromFile(filePath);
  const initialLength = allSessions.length;
  const remainingSessions = allSessions.filter((s) => s.config.sessionId !== sessionId);

  if (remainingSessions.length === initialLength) {
    return false;
  }

  await atomicWriteJSON(filePath, remainingSessions);
  return true;
}

/**
 * Convenience function to save a session using the default storage location.
 * @param session - The session to save.
 * @param dataDir - Optional custom data directory (defaults to ~/.drying-curve).
 * @throws {StorageError} If the file operation fails.
 */
export async function saveSession(session: DryingSession, dataDir?: string): Promise<void> {
  const dir = dataDir ?? DEFAULT_DATA_DIR;
  try {
    await fs.mkdir(dir, { recursive: true });
  } catch (error) {
    throw classifyFileError(error, "create data directory", dir);
  }
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
