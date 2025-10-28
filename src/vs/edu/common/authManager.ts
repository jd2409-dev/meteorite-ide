/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event.js';
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle.js';

import type { User, UserCredential } from 'firebase/auth';

import { FirebaseAuthService, type AuthProviderOptions, type IFirebaseAuthService } from 'vs/edu/common/firebaseAuthService.js';

export interface AuthErrorDetail {
    readonly code: string;
    readonly message: string;
    readonly cause?: unknown;
}

export interface AuthState {
    readonly user: User | null;
    readonly token: string | null;
    readonly loading: boolean;
    readonly error: AuthErrorDetail | null;
    readonly lastUpdated: number;
}

export type ProtectedRoute = 'notebook' | 'lesson' | 'ai-assistant';

export interface RouteGuardOptions {
    readonly redirectPath?: string;
    readonly requireEmailVerified?: boolean;
}

export type RouteGuardReason = 'loading' | 'unauthenticated' | 'error' | 'unverified';

export interface RouteGuardResult {
    readonly allowed: boolean;
    readonly reason?: RouteGuardReason;
    readonly redirectTo?: string;
}

export class AuthManager extends Disposable {
    private readonly service: IFirebaseAuthService;
    private readonly disposables = new DisposableStore();
    private readonly _onDidChange = this._register(new Emitter<AuthState>());
    private _state: AuthState = {
        user: null,
        token: null,
        loading: true,
        error: null,
        lastUpdated: Date.now()
    };
    private initialized = false;

    constructor(service: IFirebaseAuthService = new FirebaseAuthService()) {
        super();
        this.service = service;
        this._register(this.disposables);
    }

    public get state(): AuthState {
        return this._state;
    }

    public get onDidChange(): Event<AuthState> {
        return this._onDidChange.event;
    }

    public async initialize(): Promise<void> {
        if (this.initialized) {
            return;
        }

        this.initialized = true;

        try {
            const unsubscribe = await this.service.subscribe({
                onUser: user => this.applyState({ user, loading: false, error: null }),
                onToken: token => this.applyState({ token }),
                onError: error => this.applyState({ error: toAuthError(error), loading: false })
            });

            this.disposables.add({ dispose: unsubscribe });
        } catch (error) {
            this.applyState({ error: toAuthError(error), loading: false });
        }
    }

    public async signInWithEmailAndPassword(email: string, password: string): Promise<UserCredential> {
        return this.runWithLoading(() => this.service.signInWithEmailAndPassword(email, password));
    }

    public async signUpWithEmailAndPassword(email: string, password: string): Promise<UserCredential> {
        return this.runWithLoading(() => this.service.createUserWithEmailAndPassword(email, password));
    }

    public async signInWithProvider(options: AuthProviderOptions): Promise<UserCredential> {
        return this.runWithLoading(() => this.service.signInWithProvider(options));
    }

    public async signOut(): Promise<void> {
        await this.runWithLoading(async () => {
            await this.service.signOut();
            this.applyState({ user: null, token: null });
        });
    }

    public async refreshToken(force?: boolean): Promise<string | null> {
        const token = await this.service.refreshToken(force);
        this.applyState({ token });
        return token;
    }

    public clearError(): void {
        this.applyState({ error: null });
    }

    public isAuthenticated(): boolean {
        return Boolean(this._state.user);
    }

    public getToken(): string | null {
        return this._state.token;
    }

    public guard(feature: ProtectedRoute, options?: RouteGuardOptions): RouteGuardResult {
        return guardProtectedRoute(this._state, feature, options);
    }

    private async runWithLoading<T>(operation: () => Promise<T>): Promise<T> {
        this.applyState({ loading: true, error: null });
        try {
            const result = await operation();
            this.applyState({ loading: false });
            return result;
        } catch (error) {
            const authError = toAuthError(error);
            this.applyState({ loading: false, error: authError });
            throw authError;
        }
    }

    private applyState(update: Partial<AuthState>): void {
        const next: AuthState = {
            user: update.user ?? this._state.user,
            token: update.token === undefined ? this._state.token : update.token,
            loading: update.loading ?? this._state.loading,
            error: update.error === undefined ? this._state.error : update.error,
            lastUpdated: Date.now()
        };

        if (!authStatesEqual(this._state, next)) {
            this._state = next;
            this._onDidChange.fire(this._state);
        }
    }
}

export function guardProtectedRoute(state: AuthState, _route: ProtectedRoute, options: RouteGuardOptions = {}): RouteGuardResult {
    if (state.loading) {
        return { allowed: false, reason: 'loading' };
    }

    if (state.error) {
        return { allowed: false, reason: 'error' };
    }

    if (!state.user) {
        return { allowed: false, reason: 'unauthenticated', redirectTo: options.redirectPath ?? '/login' };
    }

    if (options.requireEmailVerified && state.user.email && !state.user.emailVerified) {
        return { allowed: false, reason: 'unverified', redirectTo: options.redirectPath ?? '/verify-email' };
    }

    return { allowed: true };
}

function authStatesEqual(a: AuthState, b: AuthState): boolean {
    return a.user === b.user
        && a.token === b.token
        && a.loading === b.loading
        && errorsEqual(a.error, b.error);
}

function errorsEqual(a: AuthErrorDetail | null, b: AuthErrorDetail | null): boolean {
    if (a === b) {
        return true;
    }

    if (!a || !b) {
        return false;
    }

    return a.code === b.code && a.message === b.message;
}

function toAuthError(error: unknown): AuthErrorDetail {
    if (!error) {
        return { code: 'unknown', message: 'Unknown authentication error', cause: error };
    }

    if (typeof error === 'string') {
        return { code: 'error', message: error, cause: error };
    }

    if (typeof error === 'object') {
        const candidate = error as { code?: string; message?: string };
        const code = typeof candidate.code === 'string' && candidate.code ? candidate.code : 'error';
        const message = typeof candidate.message === 'string' && candidate.message ? candidate.message : defaultErrorMessageForCode(code);
        return { code, message, cause: error };
    }

    return { code: 'error', message: String(error), cause: error };
}

function defaultErrorMessageForCode(code: string): string {
    if (code.startsWith('auth/')) {
        switch (code) {
            case 'auth/invalid-password':
                return 'The supplied password is invalid.';
            case 'auth/user-not-found':
                return 'No user was found for the provided credentials.';
            case 'auth/email-already-in-use':
                return 'An account already exists with the given email.';
            default:
                return 'An authentication error occurred.';
        }
    }

    return 'An authentication error occurred.';
}
