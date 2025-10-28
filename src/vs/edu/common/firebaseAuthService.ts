/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getFirebaseRuntimeConfiguration, FirebaseRuntimeConfiguration } from 'vs/edu/common/firebase.js';

import type { FirebaseOptions } from 'firebase/app';
import type { Auth, Persistence, User, UserCredential } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';

export interface AuthProviderOptions {
    readonly providerId: string;
    readonly scopes?: readonly string[];
    readonly customParameters?: Record<string, string>;
}

export interface FirebaseAuthListener {
    onUser?(user: User | null): void;
    onToken?(token: string | null): void;
    onError?(error: unknown): void;
}

export interface FirebaseAuthModuleLoader {
    loadAppModule(): Promise<typeof import('firebase/app')>;
    loadAuthModule(): Promise<typeof import('firebase/auth')>;
    loadFirestoreModule(): Promise<typeof import('firebase/firestore')>;
}

export interface IFirebaseAuthService {
    subscribe(listener: FirebaseAuthListener): Promise<() => void>;
    signInWithEmailAndPassword(email: string, password: string): Promise<UserCredential>;
    createUserWithEmailAndPassword(email: string, password: string): Promise<UserCredential>;
    signInWithProvider(options: AuthProviderOptions): Promise<UserCredential>;
    signOut(): Promise<void>;
    refreshToken(force?: boolean): Promise<string | null>;
    getFirestore(): Promise<Firestore>;
    getCachedToken(uid: string): string | undefined;
}

const defaultLoader: FirebaseAuthModuleLoader = {
    loadAppModule: () => import('firebase/app'),
    loadAuthModule: () => import('firebase/auth'),
    loadFirestoreModule: () => import('firebase/firestore')
};

interface AuthBindings {
    auth: Auth;
    module: typeof import('firebase/auth');
    config: FirebaseRuntimeConfiguration;
}

export class FirebaseAuthService implements IFirebaseAuthService {
    private readonly loader: FirebaseAuthModuleLoader;
    private appPromise: Promise<import('firebase/app').App> | undefined;
    private bindingsPromise: Promise<AuthBindings> | undefined;
    private firestorePromise: Promise<Firestore> | undefined;
    private runtimeConfigPromise: Promise<FirebaseRuntimeConfiguration> | undefined;
    private readonly tokenCache = new Map<string, string>();

    constructor(loader: FirebaseAuthModuleLoader = defaultLoader) {
        this.loader = loader;
    }

    public async subscribe(listener: FirebaseAuthListener): Promise<() => void> {
        const bindings = await this.getAuthBindings();
        const authModule = bindings.module;
        const auth = bindings.auth;

        const unsubscribeAuthState = authModule.onAuthStateChanged(auth, user => {
            listener.onUser?.(user ?? null);
        }, listener.onError ?? undefined);

        const unsubscribeToken = authModule.onIdTokenChanged(auth, user => {
            if (!listener.onToken) {
                return;
            }

            if (!user) {
                this.tokenCache.clear();
                listener.onToken(null);
                return;
            }

            void user.getIdToken().then(token => {
                this.tokenCache.set(user.uid, token);
                listener.onToken?.(token);
            }, err => listener.onError?.(err));
        }, listener.onError ?? undefined);

        listener.onUser?.(auth.currentUser ?? null);

        if (listener.onToken) {
            const currentUser = auth.currentUser;
            if (currentUser) {
                void currentUser.getIdToken().then(token => {
                    this.tokenCache.set(currentUser.uid, token);
                    listener.onToken?.(token);
                }, err => listener.onError?.(err));
            } else {
                listener.onToken(null);
            }
        }

        return () => {
            unsubscribeAuthState();
            unsubscribeToken();
        };
    }

    public async signInWithEmailAndPassword(email: string, password: string): Promise<UserCredential> {
        const bindings = await this.getAuthBindings();
        return bindings.module.signInWithEmailAndPassword(bindings.auth, email, password);
    }

    public async createUserWithEmailAndPassword(email: string, password: string): Promise<UserCredential> {
        const bindings = await this.getAuthBindings();
        return bindings.module.createUserWithEmailAndPassword(bindings.auth, email, password);
    }

    public async signInWithProvider(options: AuthProviderOptions): Promise<UserCredential> {
        const bindings = await this.getAuthBindings();
        const provider = this.createProvider(bindings.module, options);
        return bindings.module.signInWithPopup(bindings.auth, provider);
    }

    public async signOut(): Promise<void> {
        const bindings = await this.getAuthBindings();
        await bindings.module.signOut(bindings.auth);
        this.tokenCache.clear();
    }

    public async refreshToken(force = false): Promise<string | null> {
        const bindings = await this.getAuthBindings();
        const currentUser = bindings.auth.currentUser;
        if (!currentUser) {
            return null;
        }

        const token = await currentUser.getIdToken(force);
        this.tokenCache.set(currentUser.uid, token);
        return token;
    }

    public getCachedToken(uid: string): string | undefined {
        return this.tokenCache.get(uid);
    }

    public async getFirestore(): Promise<Firestore> {
        if (!this.firestorePromise) {
            this.firestorePromise = this.createFirestore();
        }

        return this.firestorePromise;
    }

    private async createFirestore(): Promise<Firestore> {
        const [{ getFirestore, connectFirestoreEmulator }, app, config] = await Promise.all([
            this.loader.loadFirestoreModule(),
            this.getFirebaseApp(),
            this.getRuntimeConfig()
        ]);

        const firestore = getFirestore(app);

        const emulatorHost = config.emulators?.firestore;
        if (emulatorHost && typeof connectFirestoreEmulator === 'function') {
            const parsed = parseHostAndPort(emulatorHost);
            if (parsed) {
                connectFirestoreEmulator(firestore, parsed.host, parsed.port);
            }
        }

        return firestore;
    }

    private async getFirebaseApp(): Promise<import('firebase/app').App> {
        if (!this.appPromise) {
            this.appPromise = this.loadFirebaseApp();
        }

        return this.appPromise;
    }

    private async loadFirebaseApp(): Promise<import('firebase/app').App> {
        const [{ getApps, initializeApp }, config] = await Promise.all([
            this.loader.loadAppModule(),
            this.getRuntimeConfig()
        ]);

        const existing = getApps().find(app => app.name === '[DEFAULT]');
        if (existing) {
            return existing;
        }

        return initializeApp(config.options as FirebaseOptions);
    }

    private async getAuthBindings(): Promise<AuthBindings> {
        if (!this.bindingsPromise) {
            this.bindingsPromise = this.createAuthBindings();
        }

        return this.bindingsPromise;
    }

    private async createAuthBindings(): Promise<AuthBindings> {
        const [authModule, app, config] = await Promise.all([
            this.loader.loadAuthModule(),
            this.getFirebaseApp(),
            this.getRuntimeConfig()
        ]);

        const { getAuth, browserLocalPersistence, browserSessionPersistence, inMemoryPersistence, setPersistence, connectAuthEmulator } = authModule;
        const auth = getAuth(app);

        const persistencePreference = config.auth?.persistence ?? 'local';
        const persistenceCandidates: Persistence[] = [];

        if (persistencePreference === 'session') {
            persistenceCandidates.push(browserSessionPersistence, browserLocalPersistence, inMemoryPersistence);
        } else if (persistencePreference === 'none') {
            persistenceCandidates.push(inMemoryPersistence);
        } else {
            persistenceCandidates.push(browserLocalPersistence, browserSessionPersistence, inMemoryPersistence);
        }

        let persistenceSet = false;
        let lastError: unknown;
        for (const candidate of persistenceCandidates) {
            if (!candidate) {
                continue;
            }

            try {
                await setPersistence(auth, candidate);
                persistenceSet = true;
                break;
            } catch (error) {
                lastError = error;
            }
        }

        if (!persistenceSet && lastError) {
            throw lastError;
        }

        const emulatorHost = config.emulators?.auth;
        if (emulatorHost && typeof connectAuthEmulator === 'function') {
            try {
                connectAuthEmulator(auth, ensureHttpProtocol(emulatorHost), { disableWarnings: true });
            } catch (error) {
                // Ignore failures to connect to emulator so production does not break if misconfigured.
                if (typeof console !== 'undefined' && typeof console.error === 'function') {
                    console.error(error);
                }
            }
        }

        return {
            auth,
            module: authModule,
            config
        };
    }

    private async getRuntimeConfig(): Promise<FirebaseRuntimeConfiguration> {
        if (!this.runtimeConfigPromise) {
            this.runtimeConfigPromise = getFirebaseRuntimeConfiguration();
        }

        return this.runtimeConfigPromise;
    }

    private createProvider(module: typeof import('firebase/auth'), options: AuthProviderOptions) {
        const providerId = normaliseProviderId(options.providerId);

        const provider = buildProviderInstance(module, providerId);

        if (options.scopes?.length) {
            const addScope = (provider as { addScope?: (scope: string) => void }).addScope;
            if (typeof addScope === 'function') {
                for (const scope of options.scopes) {
                    if (scope && typeof scope === 'string') {
                        addScope.call(provider, scope);
                    }
                }
            }
        }

        if (options.customParameters) {
            const setCustomParameters = (provider as { setCustomParameters?: (params: Record<string, string>) => void }).setCustomParameters;
            if (typeof setCustomParameters === 'function') {
                setCustomParameters.call(provider, options.customParameters);
            }
        }

        return provider;
    }
}

function buildProviderInstance(module: typeof import('firebase/auth'), providerId: string) {
    if (providerId === 'google.com' && module.GoogleAuthProvider) {
        return new module.GoogleAuthProvider();
    }

    if (providerId === 'github.com' && module.GithubAuthProvider) {
        return new module.GithubAuthProvider();
    }

    if (providerId === 'facebook.com' && module.FacebookAuthProvider) {
        return new module.FacebookAuthProvider();
    }

    if (providerId === 'password' || providerId === 'phone') {
        throw new Error(`Provider '${providerId}' does not support popup flows.`);
    }

    if (module.OAuthProvider) {
        return new module.OAuthProvider(providerId);
    }

    throw new Error(`Unsupported OAuth provider '${providerId}'.`);
}

function normaliseProviderId(raw: string): string {
    const value = raw?.toLowerCase?.() ?? '';
    if (value === 'password' || value === 'phone' || value === 'anonymous') {
        return value;
    }

    if (!value.endsWith('.com')) {
        return `${value}.com`;
    }
    return value;
}

function ensureHttpProtocol(host: string): string {
    if (host.startsWith('http://') || host.startsWith('https://')) {
        return host;
    }

    return `http://${host}`;
}

function parseHostAndPort(value: string): { host: string; port: number } | undefined {
    try {
        const url = new URL(value.includes('://') ? value : `http://${value}`);
        const port = url.port ? Number(url.port) : undefined;
        if (!url.hostname || !port || Number.isNaN(port)) {
            return undefined;
        }

        return { host: url.hostname, port };
    } catch {
        const [host, portString] = value.split(':');
        const port = Number(portString);
        if (!host || !portString || Number.isNaN(port)) {
            return undefined;
        }

        return { host, port };
    }
}
