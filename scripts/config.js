/**
 * config.js
 * BigQuery scripts configuration and shared utilities.
 */
import path from 'path';
import process from 'process';

// User Home Directory detection
const USER_HOME = process.env.USERPROFILE || process.env.HOME || 'C:\\Users\\gogow';

// BigQuery Configuration
export const DATASET_ID = process.env.BQ_DATASET_ID || 'thinktank';
export const TABLE_ID = process.env.BQ_TABLE_ID || 'files';

// File System Paths
export const MEMO_DIR = process.env.MEMO_DIR || path.join(USER_HOME, 'Documents', 'Memo');
export const THINKTANK_FILE = process.env.THINKTANK_FILE || path.join(USER_HOME, 'Documents', 'Thinktank', 'thinktank.md');
export const BACKUP_DIR = process.env.BACKUP_DIR || path.join(USER_HOME, 'Documents', 'Thinktank_Backup');

/**
 * Retrieves and parses Google Cloud credentials from the environment variable.
 * @returns {object} Parsed JSON credentials
 * @throws {Error} If credentials are missing or invalid
 */
export function getCredentials() {
    const credentials = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
    if (!credentials) {
        const errorMsg = 'Error: GOOGLE_SERVICE_ACCOUNT_KEY environment variable is not set.\n' +
            'Usage (Windows): set GOOGLE_SERVICE_ACCOUNT_KEY=<JSON Content>\n' +
            'Or (PowerShell): $env:GOOGLE_SERVICE_ACCOUNT_KEY = Get-Content <path-to-json> -Raw';
        throw new Error(errorMsg);
    }

    try {
        return JSON.parse(credentials);
    } catch (e) {
        throw new Error('Error: Failed to parse GOOGLE_SERVICE_ACCOUNT_KEY as JSON.');
    }
}
