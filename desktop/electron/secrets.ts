import { app, safeStorage } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Secret storage backed by Electron's `safeStorage` (OS keychain on macOS,
 * DPAPI on Windows, libsecret on Linux). Plaintext is never written to disk.
 * The `secrets.json` file under `<userData>` only contains base64-encoded
 * encrypted blobs that can only be decrypted on the same machine + user.
 *
 * Hard-fail design: if the OS doesn't expose an encryption backend
 * (e.g. headless Linux without a keyring), every operation throws rather
 * than silently falling back to plaintext storage.
 */

const SCHEMA_VERSION = 1;

export interface SecretEntry {
  /** Last 4 plaintext characters — for UI hinting. Never the full value. */
  hint: string;
  /** ISO-8601 timestamp of when the entry was last set. */
  updatedAt: string;
  /** Base64 of the safeStorage-encrypted bytes. */
  cipher: string;
}

interface SecretsFile {
  version: number;
  entries: Record<string, SecretEntry>;
}

export interface SecretListing {
  key: string;
  hint: string;
  updatedAt: string;
}

export class EncryptionUnavailableError extends Error {
  constructor() {
    super(
      'Encryption backend unavailable on this OS — refusing to store secrets ' +
      'in plaintext. On Linux this typically means no keyring is running.',
    );
    this.name = 'EncryptionUnavailableError';
  }
}

function secretsFilePath(): string {
  return path.join(app.getPath('userData'), 'secrets.json');
}

function ensureEncryption(): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new EncryptionUnavailableError();
  }
}

function readFile(): SecretsFile {
  const file = secretsFilePath();
  if (!fs.existsSync(file)) {
    return { version: SCHEMA_VERSION, entries: {} };
  }
  const raw = fs.readFileSync(file, 'utf8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`secrets.json is corrupt: ${(err as Error).message}`);
  }
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    typeof (parsed as SecretsFile).version !== 'number'
  ) {
    throw new Error('secrets.json missing version — refusing to read');
  }
  if ((parsed as SecretsFile).version > SCHEMA_VERSION) {
    throw new Error(
      `secrets.json version ${(parsed as SecretsFile).version} is newer than ` +
      `this app supports (${SCHEMA_VERSION}); refusing to overwrite`,
    );
  }
  return parsed as SecretsFile;
}

function writeFile(data: SecretsFile): void {
  const file = secretsFilePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  // Write atomically: write tmp + rename.
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), {
    encoding: 'utf8',
    mode: 0o600,
  });
  fs.renameSync(tmp, file);
}

function hintOf(value: string): string {
  if (value.length <= 4) return '*'.repeat(value.length);
  return `…${value.slice(-4)}`;
}

export function isEncryptionAvailable(): boolean {
  return safeStorage.isEncryptionAvailable();
}

export function setSecret(key: string, value: string): SecretEntry {
  ensureEncryption();
  if (!key) throw new Error('secret key required');
  if (!value) throw new Error('secret value required');

  const data = readFile();
  const cipher = safeStorage.encryptString(value).toString('base64');
  const entry: SecretEntry = {
    hint: hintOf(value),
    updatedAt: new Date().toISOString(),
    cipher,
  };
  data.entries[key] = entry;
  data.version = SCHEMA_VERSION;
  writeFile(data);
  return entry;
}

export function getSecret(key: string): string | null {
  ensureEncryption();
  const data = readFile();
  const entry = data.entries[key];
  if (!entry) return null;
  const buf = Buffer.from(entry.cipher, 'base64');
  return safeStorage.decryptString(buf);
}

export function deleteSecret(key: string): boolean {
  // Note: deletion does not technically need encryption; we still call it for
  // consistency with the rest of the surface.
  ensureEncryption();
  const data = readFile();
  if (!(key in data.entries)) return false;
  delete data.entries[key];
  data.version = SCHEMA_VERSION;
  writeFile(data);
  return true;
}

export function listSecrets(): SecretListing[] {
  ensureEncryption();
  const data = readFile();
  return Object.entries(data.entries).map(([key, entry]) => ({
    key,
    hint: entry.hint,
    updatedAt: entry.updatedAt,
  }));
}

export function secretsFileLocation(): string {
  return secretsFilePath();
}
