/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';

import { FirebaseConfigError, getFirebaseConfigSource, getFirebaseOptions, getFirebaseRuntimeConfiguration, prefetchFirebaseConfig, resetFirebaseConfigCacheForTests } from 'vs/edu/common/firebase.js';

const ENV_KEYS = [
	'VSCODE_EDU_FIREBASE_API_KEY',
	'VSCODE_EDU_FIREBASE_AUTH_DOMAIN',
	'VSCODE_EDU_FIREBASE_PROJECT_ID',
	'VSCODE_EDU_FIREBASE_APP_ID',
	'VSCODE_EDU_FIREBASE_STORAGE_BUCKET',
	'VSCODE_EDU_FIREBASE_MESSAGING_SENDER_ID',
	'VSCODE_EDU_FIREBASE_DATABASE_URL',
	'VSCODE_EDU_FIREBASE_MEASUREMENT_ID',
	'VSCODE_EDU_FIREBASE_CONFIG_URL',
	'VSCODE_EDU_FIREBASE_AUTH_EMULATOR_HOST',
	'VSCODE_EDU_FIREBASE_FIRESTORE_EMULATOR_HOST',
	'VSCODE_EDU_FIREBASE_AUTH_PERSISTENCE'
];

suite('Firebase configuration loader', () => {
	const originalEnv: Record<string, string | undefined> = Object.create(null);
	const originalFetch = globalThis.fetch;
	let originalRuntimeConfig: unknown;
	let originalRuntimeUrl: unknown;

	suiteSetup(() => {
		for (const key of ENV_KEYS) {
			originalEnv[key] = process.env[key];
		}
	});

	setup(() => {
		resetFirebaseConfigCacheForTests();

		originalRuntimeConfig = (globalThis as { __FIREBASE_CONFIG__?: unknown }).__FIREBASE_CONFIG__;
		originalRuntimeUrl = (globalThis as { __FIREBASE_CONFIG_URL__?: unknown }).__FIREBASE_CONFIG_URL__;
		delete (globalThis as { __FIREBASE_CONFIG__?: unknown }).__FIREBASE_CONFIG__;
		delete (globalThis as { __FIREBASE_CONFIG_URL__?: unknown }).__FIREBASE_CONFIG_URL__;

		for (const key of ENV_KEYS) {
			delete process.env[key];
		}

		globalThis.fetch = originalFetch;
	});

	teardown(() => {
		resetFirebaseConfigCacheForTests();

		if (originalRuntimeConfig === undefined) {
			delete (globalThis as { __FIREBASE_CONFIG__?: unknown }).__FIREBASE_CONFIG__;
		} else {
			(globalThis as { __FIREBASE_CONFIG__?: unknown }).__FIREBASE_CONFIG__ = originalRuntimeConfig;
		}

		if (originalRuntimeUrl === undefined) {
			delete (globalThis as { __FIREBASE_CONFIG_URL__?: unknown }).__FIREBASE_CONFIG_URL__;
		} else {
			(globalThis as { __FIREBASE_CONFIG_URL__?: unknown }).__FIREBASE_CONFIG_URL__ = originalRuntimeUrl;
		}

		for (const key of ENV_KEYS) {
			const value = originalEnv[key];
			if (value === undefined) {
				delete process.env[key];
			} else {
				process.env[key] = value;
			}
		}

		globalThis.fetch = originalFetch;
	});

	test('prefers environment variables when provided', async () => {
		process.env.VSCODE_EDU_FIREBASE_API_KEY = 'env-key';
		process.env.VSCODE_EDU_FIREBASE_AUTH_DOMAIN = 'auth.dev.test';
		process.env.VSCODE_EDU_FIREBASE_PROJECT_ID = 'project-env';
		process.env.VSCODE_EDU_FIREBASE_APP_ID = 'app-env';
		process.env.VSCODE_EDU_FIREBASE_STORAGE_BUCKET = 'bucket-env';
		process.env.VSCODE_EDU_FIREBASE_AUTH_PERSISTENCE = 'session';
		process.env.VSCODE_EDU_FIREBASE_AUTH_EMULATOR_HOST = 'localhost:9099';

		const options = await getFirebaseOptions();
		assert.strictEqual(options.apiKey, 'env-key');
		assert.strictEqual(options.authDomain, 'auth.dev.test');
		assert.strictEqual(options.projectId, 'project-env');
		assert.strictEqual(options.appId, 'app-env');
		assert.strictEqual(options.storageBucket, 'bucket-env');

		const config = await getFirebaseRuntimeConfiguration();
		assert.strictEqual(config.auth?.persistence, 'session');
		assert.strictEqual(config.emulators?.auth, 'localhost:9099');

		const source = await getFirebaseConfigSource();
		assert.strictEqual(source, 'environment');
	});

	test('reads runtime configuration from global scope', async () => {
		const runtimeOptions = {
			options: {
				apiKey: 'runtime-key',
				authDomain: 'runtime.dev',
				projectId: 'runtime-project',
				appId: 'runtime-app',
				measurementId: 'G-12345'
			},
			emulators: {
				auth: 'http://localhost:9000',
				firestore: 'localhost:8080'
			},
			auth: {
				persistence: 'none'
			}
		};

		(globalThis as { __FIREBASE_CONFIG__?: unknown }).__FIREBASE_CONFIG__ = runtimeOptions;

		const options = await getFirebaseOptions();
		assert.strictEqual(options.apiKey, 'runtime-key');
		assert.strictEqual(options.measurementId, 'G-12345');

		const config = await getFirebaseRuntimeConfiguration();
		assert.strictEqual(config.auth?.persistence, 'none');
		assert.strictEqual(config.emulators?.firestore, 'localhost:8080');

		const source = await getFirebaseConfigSource();
		assert.strictEqual(source, 'runtime');
	});

	test('fetches remote configuration as a fallback', async () => {
		let requestedUrl: string | undefined;

		globalThis.fetch = async (input: RequestInfo | URL) => {
			requestedUrl = typeof input === 'string' ? input : input.toString();
			const body = JSON.stringify({
				options: {
					apiKey: 'remote-key',
					authDomain: 'remote.dev',
					projectId: 'remote-project',
					appId: 'remote-app'
				}
			});
			return new Response(body, { status: 200, headers: { 'Content-Type': 'application/json' } });
		};

		const options = await getFirebaseOptions();
		assert.strictEqual(options.apiKey, 'remote-key');
		assert.strictEqual(requestedUrl, '/config/firebase.json');

		const source = await getFirebaseConfigSource();
		assert.strictEqual(source, 'remote');
	});

	test('fails when required keys are missing', async () => {
		(globalThis as { __FIREBASE_CONFIG__?: unknown }).__FIREBASE_CONFIG__ = {
			options: {
				apiKey: 'partial-key',
				authDomain: 'partial.dev',
				projectId: 'partial-project'
			}
		};

		await assert.rejects(async () => {
			await prefetchFirebaseConfig();
		}, (error) => error instanceof FirebaseConfigError);
	});
});
