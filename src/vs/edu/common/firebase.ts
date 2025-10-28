/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Utility helpers for loading Firebase configuration at runtime.
 *
 * Configuration can be supplied via (in priority order):
 *  - Environment variables prefixed with `VSCODE_EDU_FIREBASE_`
 *  - A global object exposed as `globalThis.__FIREBASE_CONFIG__`
 *  - A JSON document served from `VSCODE_EDU_FIREBASE_CONFIG_URL` (or `/config/firebase.json` by default)
 *
 * Supported environment variables:
 *  - `VSCODE_EDU_FIREBASE_API_KEY`
 *  - `VSCODE_EDU_FIREBASE_AUTH_DOMAIN`
 *  - `VSCODE_EDU_FIREBASE_PROJECT_ID`
 *  - `VSCODE_EDU_FIREBASE_APP_ID`
 *  - `VSCODE_EDU_FIREBASE_STORAGE_BUCKET`
 *  - `VSCODE_EDU_FIREBASE_MESSAGING_SENDER_ID`
 *  - `VSCODE_EDU_FIREBASE_DATABASE_URL`
 *  - `VSCODE_EDU_FIREBASE_MEASUREMENT_ID`
 *  - `VSCODE_EDU_FIREBASE_CONFIG_URL` (optional, overrides the default runtime JSON location)
 *  - `VSCODE_EDU_FIREBASE_AUTH_EMULATOR_HOST` (optional)
 *  - `VSCODE_EDU_FIREBASE_FIRESTORE_EMULATOR_HOST` (optional)
 *  - `VSCODE_EDU_FIREBASE_AUTH_PERSISTENCE` (optional: `local`, `session`, or `none`)
 */

declare const process: { env?: Record<string, string | undefined> } | undefined;

import type { FirebaseOptions } from 'firebase/app';

export type FirebaseConfigSource = 'environment' | 'runtime' | 'remote';

const REQUIRED_OPTION_KEYS = ['apiKey', 'authDomain', 'projectId', 'appId'] as const satisfies ReadonlyArray<keyof FirebaseOptions>;
const OPTIONAL_OPTION_KEYS = ['messagingSenderId', 'storageBucket', 'databaseURL', 'measurementId'] as const satisfies ReadonlyArray<keyof FirebaseOptions>;
const ALL_OPTION_KEYS = new Set<string>([...REQUIRED_OPTION_KEYS, ...OPTIONAL_OPTION_KEYS]);
const CONFIG_ENV_PREFIX = 'VSCODE_EDU_FIREBASE_';
const DEFAULT_RUNTIME_CONFIG_PATH = '/config/firebase.json';

const AUTH_PERSISTENCE_VALUES = new Set(['local', 'session', 'none']);

export type RuntimeFirebaseOptions = FirebaseOptions & Record<string, string>;

export interface FirebaseEmulatorConfiguration {
    auth?: string;
    firestore?: string;
}

export interface FirebaseAuthPreferences {
    persistence?: 'local' | 'session' | 'none';
}

export interface FirebaseRuntimeConfiguration {
    options: RuntimeFirebaseOptions;
    emulators?: FirebaseEmulatorConfiguration;
    auth?: FirebaseAuthPreferences;
}

export interface ResolvedFirebaseConfiguration {
    source: FirebaseConfigSource;
    config: FirebaseRuntimeConfiguration;
}

export class FirebaseConfigError extends Error {
    constructor(message: string, readonly cause?: unknown) {
        super(message);
        this.name = 'FirebaseConfigError';
    }
}

let cachedConfigPromise: Promise<ResolvedFirebaseConfiguration> | undefined;

/**
 * Resolves the Firebase runtime configuration, caching the result across calls.
 */
export async function getFirebaseRuntimeConfiguration(): Promise<FirebaseRuntimeConfiguration> {
    const { config } = await resolveConfig();
    return config;
}

/**
 * Returns the Firebase options used to initialise the SDK.
 */
export async function getFirebaseOptions(): Promise<RuntimeFirebaseOptions> {
    const config = await getFirebaseRuntimeConfiguration();
    return config.options;
}

/**
 * Returns the source from which the configuration was resolved.
 */
export async function getFirebaseConfigSource(): Promise<FirebaseConfigSource> {
    const { source } = await resolveConfig();
    return source;
}

/**
 * Ensures configuration is loaded and cached (useful during application bootstrap).
 */
export async function prefetchFirebaseConfig(): Promise<void> {
    await resolveConfig();
}

/**
 * Clears the cached configuration. Intended for use in tests only.
 */
export function resetFirebaseConfigCacheForTests(): void {
    cachedConfigPromise = undefined;
}

async function resolveConfig(): Promise<ResolvedFirebaseConfiguration> {
    if (!cachedConfigPromise) {
        cachedConfigPromise = doResolveConfig();
    }

    return cachedConfigPromise;
}

async function doResolveConfig(): Promise<ResolvedFirebaseConfiguration> {
    const env = getProcessEnv();

    const envConfig = readEnvConfig(env);
    if (envConfig) {
        return { source: 'environment', config: envConfig };
    }

    const runtimeConfig = readRuntimeGlobalConfig();
    if (runtimeConfig) {
        return { source: 'runtime', config: runtimeConfig };
    }

    const remoteConfig = await fetchRemoteConfig(env);
    if (remoteConfig) {
        return { source: 'remote', config: remoteConfig };
    }

    throw new FirebaseConfigError('Failed to resolve Firebase configuration. Ensure environment variables or runtime config JSON are provided.');
}

function readEnvConfig(env: Record<string, string | undefined> | undefined): FirebaseRuntimeConfiguration | undefined {
    if (!env) {
        return undefined;
    }

    const options: Record<string, string> = Object.create(null);
    let isEmpty = true;

    for (const key of ALL_OPTION_KEYS) {
        const envKey = CONFIG_ENV_PREFIX + key.toUpperCase();
        const value = env[envKey];
        if (typeof value === 'string' && value.trim()) {
            options[key] = value.trim();
            isEmpty = false;
        }
    }

    if (isEmpty) {
        return undefined;
    }

    const configuration: FirebaseRuntimeConfiguration = {
        options: normaliseOptions(options, 'environment')
    };

    const authEmulator = env[CONFIG_ENV_PREFIX + 'AUTH_EMULATOR_HOST'];
    const firestoreEmulator = env[CONFIG_ENV_PREFIX + 'FIRESTORE_EMULATOR_HOST'];
    const persistence = env[CONFIG_ENV_PREFIX + 'AUTH_PERSISTENCE'];

    const emulators = normaliseEmulators({ auth: authEmulator, firestore: firestoreEmulator });
    if (emulators) {
        configuration.emulators = emulators;
    }

    const authPreferences = normaliseAuthPreferences({ persistence });
    if (authPreferences) {
        configuration.auth = authPreferences;
    }

    return configuration;
}

interface GlobalRuntimeConfig {
    __FIREBASE_CONFIG__?: unknown;
    __FIREBASE_CONFIG_URL__?: unknown;
}

function readRuntimeGlobalConfig(): FirebaseRuntimeConfiguration | undefined {
    const globalCandidate = (globalThis as GlobalRuntimeConfig).__FIREBASE_CONFIG__;
    if (globalCandidate === undefined) {
        return undefined;
    }

    return normaliseRuntimeConfig(globalCandidate, 'runtime');
}

async function fetchRemoteConfig(env: Record<string, string | undefined> | undefined): Promise<FirebaseRuntimeConfiguration | undefined> {
    const runtimeUrl = resolveRuntimeConfigUrl(env);
    if (!runtimeUrl || typeof fetch !== 'function') {
        return undefined;
    }

    try {
        const response = await fetch(runtimeUrl, { cache: 'no-store' });
        if (!response.ok) {
            if (response.status === 404) {
                return undefined;
            }
            throw new FirebaseConfigError(`Failed to load Firebase configuration from ${runtimeUrl}: ${response.status} ${response.statusText}`);
        }

        const payload = await response.json();
        return normaliseRuntimeConfig(payload, 'remote');
    } catch (error) {
        throw new FirebaseConfigError('Unable to fetch Firebase configuration from remote endpoint.', error);
    }
}

function resolveRuntimeConfigUrl(env: Record<string, string | undefined> | undefined): string | undefined {
    const globalUrl = (globalThis as GlobalRuntimeConfig).__FIREBASE_CONFIG_URL__;
    if (typeof globalUrl === 'string' && globalUrl.trim()) {
        return globalUrl.trim();
    }

    const envUrl = env?.[CONFIG_ENV_PREFIX + 'CONFIG_URL'];
    if (typeof envUrl === 'string' && envUrl.trim()) {
        return envUrl.trim();
    }

    return DEFAULT_RUNTIME_CONFIG_PATH;
}

function normaliseRuntimeConfig(raw: unknown, source: FirebaseConfigSource): FirebaseRuntimeConfiguration {
    if (!raw || typeof raw !== 'object') {
        throw new FirebaseConfigError(`Invalid Firebase configuration from ${source}. Expected an object.`);
    }

    const candidate = raw as Record<string, unknown>;
    const hasOptionsProperty = Object.prototype.hasOwnProperty.call(candidate, 'options');

    if (!hasOptionsProperty) {
        return {
            options: normaliseOptions(candidate, source),
            emulators: normaliseEmulators(candidate.emulators),
            auth: normaliseAuthPreferences(candidate.auth)
        };
    }

    const options = normaliseOptions(candidate.options, source);
    const emulators = normaliseEmulators(candidate.emulators);
    const auth = normaliseAuthPreferences(candidate.auth);

    const config: FirebaseRuntimeConfiguration = { options };
    if (emulators) {
        config.emulators = emulators;
    }
    if (auth) {
        config.auth = auth;
    }

    return config;
}

function normaliseOptions(raw: unknown, source: FirebaseConfigSource | 'environment'): RuntimeFirebaseOptions {
    if (!raw || typeof raw !== 'object') {
        throw new FirebaseConfigError(`Invalid Firebase options from ${source}.`);
    }

    const input = raw as Record<string, unknown>;
    const result: Record<string, string> = Object.create(null);

    for (const key of Object.keys(input)) {
        const value = input[key];
        if (typeof value === 'string' && value.trim()) {
            if (ALL_OPTION_KEYS.has(key) || key.startsWith('auth') || key.startsWith('svc')) {
                result[key] = value.trim();
            }
        }
    }

    for (const required of REQUIRED_OPTION_KEYS) {
        if (!result[required]) {
            throw new FirebaseConfigError(`Missing Firebase option '${required}' from ${source}.`);
        }
    }

    return Object.freeze(result) as RuntimeFirebaseOptions;
}

function normaliseEmulators(raw: unknown): FirebaseEmulatorConfiguration | undefined {
    if (!raw || typeof raw !== 'object') {
        return undefined;
    }

    const candidate = raw as Record<string, unknown>;
    const emulators: FirebaseEmulatorConfiguration = {};

    const auth = candidate.auth;
    if (typeof auth === 'string' && auth.trim()) {
        emulators.auth = auth.trim();
    }

    const firestore = candidate.firestore;
    if (typeof firestore === 'string' && firestore.trim()) {
        emulators.firestore = firestore.trim();
    }

    return Object.keys(emulators).length ? emulators : undefined;
}

function normaliseAuthPreferences(raw: unknown): FirebaseAuthPreferences | undefined {
    if (!raw || typeof raw !== 'object') {
        return undefined;
    }

    const candidate = raw as Record<string, unknown>;
    const persistenceValue = candidate.persistence;
    if (typeof persistenceValue !== 'string') {
        return undefined;
    }

    const lowerValue = persistenceValue.toLowerCase();
    if (!AUTH_PERSISTENCE_VALUES.has(lowerValue)) {
        return undefined;
    }

    return { persistence: lowerValue as FirebaseAuthPreferences['persistence'] };
}

function getProcessEnv(): Record<string, string | undefined> | undefined {
    if (typeof process === 'undefined') {
        return undefined;
    }

    try {
        return process?.env;
    } catch {
        return undefined;
    }
}
