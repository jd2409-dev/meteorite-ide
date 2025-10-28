/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';

import type { User, UserCredential } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';

import { AuthManager, guardProtectedRoute, type AuthErrorDetail, type AuthState } from 'vs/edu/common/authManager.js';
import type { AuthProviderOptions, FirebaseAuthListener, IFirebaseAuthService } from 'vs/edu/common/firebaseAuthService.js';

class FakeAuthService implements IFirebaseAuthService {
    public listener: FirebaseAuthListener | null = null;
    public currentUser: User | null = null;
    public token: string | null = null;
    public signInError: unknown = null;
    public signUpError: unknown = null;
    public providerError: unknown = null;
    public signOutError: unknown = null;
    public refreshTokenValue: string | null = null;
    private readonly cachedTokens = new Map<string, string>();

    async subscribe(listener: FirebaseAuthListener): Promise<() => void> {
        this.listener = listener;
        listener.onUser?.(this.currentUser);
        listener.onToken?.(this.token);
        return () => {
            if (this.listener === listener) {
                this.listener = null;
            }
        };
    }

    async signInWithEmailAndPassword(email: string, password: string): Promise<UserCredential> {
        if (this.signInError) {
            throw this.signInError;
        }

        const user = createUser('email-user', { email, emailVerified: true });
        const token = nextToken(user.uid);
        this.setActiveUser(user, token);
        return { user } as UserCredential;
    }

    async createUserWithEmailAndPassword(email: string, password: string): Promise<UserCredential> {
        if (this.signUpError) {
            throw this.signUpError;
        }

        const user = createUser('signup-user', { email, emailVerified: false });
        const token = nextToken(user.uid);
        this.setActiveUser(user, token);
        return { user } as UserCredential;
    }

    async signInWithProvider(options: AuthProviderOptions): Promise<UserCredential> {
        if (this.providerError) {
            throw this.providerError;
        }

        const user = createUser(`provider-${options.providerId}`, { emailVerified: true });
        const token = nextToken(user.uid);
        this.setActiveUser(user, token);
        return { user } as UserCredential;
    }

    async signOut(): Promise<void> {
        if (this.signOutError) {
            throw this.signOutError;
        }

        this.currentUser = null;
        this.token = null;
        this.cachedTokens.clear();
        this.listener?.onUser?.(null);
        this.listener?.onToken?.(null);
    }

    async refreshToken(_force?: boolean): Promise<string | null> {
        if (!this.currentUser) {
            return null;
        }

        const token = this.refreshTokenValue ?? nextToken(this.currentUser.uid);
        this.token = token;
        this.cachedTokens.set(this.currentUser.uid, token);
        this.listener?.onToken?.(token);
        return token;
    }

    async getFirestore(): Promise<Firestore> {
        return {} as Firestore;
    }

    getCachedToken(uid: string): string | undefined {
        return this.cachedTokens.get(uid);
    }

    public emitAuthState(user: User | null, token: string | null): void {
        this.setActiveUser(user, token ?? undefined);
    }

    private setActiveUser(user: User | null, token?: string): void {
        this.currentUser = user;
        if (user && token) {
            this.token = token;
            this.cachedTokens.set(user.uid, token);
        } else if (user) {
            this.token = nextToken(user.uid);
            this.cachedTokens.set(user.uid, this.token);
        } else {
            this.token = null;
            this.cachedTokens.clear();
        }

        this.listener?.onUser?.(this.currentUser);
        this.listener?.onToken?.(this.token);
    }
}

let tokenCounter = 0;
function nextToken(uid: string): string {
    tokenCounter += 1;
    return `${uid}-token-${tokenCounter}`;
}

function createUser(uid: string, overrides: Partial<User> = {}): User {
    const now = new Date().toISOString();
    const user = {
        uid,
        email: overrides.email ?? `${uid}@example.test`,
        emailVerified: overrides.emailVerified ?? true,
        displayName: overrides.displayName ?? 'Test User',
        isAnonymous: false,
        providerData: [],
        metadata: { creationTime: now, lastSignInTime: now } as unknown as User['metadata'],
        refreshToken: 'refresh-token',
        tenantId: null,
        getIdToken: async () => nextToken(uid),
        getIdTokenResult: async () => ({
            token: nextToken(uid),
            authTime: now,
            issuedAtTime: now,
            expirationTime: now,
            signInProvider: '',
            signInSecondFactor: undefined,
            claims: {}
        }),
        reload: async () => undefined,
        delete: async () => undefined,
        toJSON: () => ({ uid })
    } as unknown as User;

    return Object.assign(user, overrides);
}

suite('AuthManager', () => {
    setup(() => {
        tokenCounter = 0;
    });

    test('initialises and reflects auth state', async () => {
        const service = new FakeAuthService();
        service.currentUser = createUser('existing-user');
        service.token = 'existing-token';
        const manager = new AuthManager(service);

        const states: AuthState[] = [];
        const disposable = manager.onDidChange(state => states.push(state));

        await manager.initialize();

        assert.strictEqual(manager.state.loading, false);
        assert.strictEqual(manager.state.user?.uid, 'existing-user');
        assert.strictEqual(manager.state.token, 'existing-token');

        await manager.signInWithEmailAndPassword('user@example.com', 'secret');

        assert.strictEqual(manager.state.user?.email, 'user@example.com');
        assert.ok(manager.state.token);
        assert.strictEqual(manager.state.error, null);

        disposable.dispose();
    });

    test('surface errors during sign-in and clears them on success', async () => {
        const service = new FakeAuthService();
        const manager = new AuthManager(service);
        await manager.initialize();

        service.signInError = { code: 'auth/invalid-password', message: 'Invalid credentials' };

        await assert.rejects(async () => {
            await manager.signInWithEmailAndPassword('user@example.com', 'bad');
        }, (err: unknown) => {
            const authError = err as AuthErrorDetail;
            assert.strictEqual(authError.code, 'auth/invalid-password');
            return true;
        });

        assert.strictEqual(manager.state.error?.code, 'auth/invalid-password');

        service.signInError = null;
        await manager.signInWithEmailAndPassword('user@example.com', 'good');
        assert.strictEqual(manager.state.error, null);
    });

    test('sign-out clears session state', async () => {
        const service = new FakeAuthService();
        const manager = new AuthManager(service);
        await manager.initialize();

        await manager.signInWithProvider({ providerId: 'google.com' });
        assert.ok(manager.isAuthenticated());

        await manager.signOut();

        assert.strictEqual(manager.state.user, null);
        assert.strictEqual(manager.state.token, null);
        assert.strictEqual(manager.state.loading, false);
    });

    test('refresh token updates cached token', async () => {
        const service = new FakeAuthService();
        const manager = new AuthManager(service);
        await manager.initialize();

        await manager.signInWithEmailAndPassword('user@example.com', 'secret');
        const uid = manager.state.user?.uid;
        assert.ok(uid);

        service.refreshTokenValue = 'refreshed-token';
        const token = await manager.refreshToken(true);
        assert.strictEqual(token, 'refreshed-token');
        assert.strictEqual(manager.state.token, 'refreshed-token');
        assert.strictEqual(service.getCachedToken(uid!), 'refreshed-token');
    });

    test('route guard enforces authentication and verification', async () => {
        const service = new FakeAuthService();
        const manager = new AuthManager(service);
        await manager.initialize();

        let result = manager.guard('notebook', { redirectPath: '/signin' });
        assert.deepStrictEqual(result, { allowed: false, reason: 'unauthenticated', redirectTo: '/signin' });

        await manager.signUpWithEmailAndPassword('student@example.com', 'secret');
        result = manager.guard('lesson', { requireEmailVerified: true });
        assert.deepStrictEqual(result, { allowed: false, reason: 'unverified', redirectTo: '/verify-email' });

        service.emitAuthState(createUser('verified-user', { emailVerified: true }), 'verified-token');
        result = manager.guard('ai-assistant', { requireEmailVerified: true });
        assert.deepStrictEqual(result, { allowed: true });
    });

    test('guardProtectedRoute handles loading and error states', () => {
        const baseState: AuthState = {
            user: null,
            token: null,
            loading: true,
            error: null,
            lastUpdated: Date.now()
        };

        let result = guardProtectedRoute(baseState, 'notebook');
        assert.deepStrictEqual(result, { allowed: false, reason: 'loading' });

        result = guardProtectedRoute({ ...baseState, loading: false, error: { code: 'auth/network', message: 'offline' } }, 'lesson');
        assert.deepStrictEqual(result, { allowed: false, reason: 'error' });

        result = guardProtectedRoute({ ...baseState, loading: false, error: null }, 'lesson', { redirectPath: '/login' });
        assert.deepStrictEqual(result, { allowed: false, reason: 'unauthenticated', redirectTo: '/login' });

        const user = createUser('verified', { emailVerified: true });
        result = guardProtectedRoute({ ...baseState, loading: false, error: null, user }, 'lesson', { requireEmailVerified: true });
        assert.deepStrictEqual(result, { allowed: true });
    });
});
