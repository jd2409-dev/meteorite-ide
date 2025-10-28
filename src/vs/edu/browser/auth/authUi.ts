/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { addDisposableListener, clearNode } from 'vs/base/browser/dom.js';
import { Disposable } from 'vs/base/common/lifecycle.js';

import type { AuthErrorDetail, AuthState } from 'vs/edu/common/authManager.js';
import { AuthManager } from 'vs/edu/common/authManager.js';
import type { AuthProviderOptions } from 'vs/edu/common/firebaseAuthService.js';

export interface AuthProviderButton extends AuthProviderOptions {
    readonly label: string;
}

export interface AuthPanelOptions {
    readonly providers?: readonly AuthProviderButton[];
    readonly signInLabel?: string;
    readonly signUpLabel?: string;
}

const DEFAULT_PROVIDERS: readonly AuthProviderButton[] = [
    { providerId: 'google.com', label: 'Continue with Google' },
    { providerId: 'github.com', label: 'Continue with GitHub' }
];

export class AuthPanel extends Disposable {
    private readonly manager: AuthManager;
    private readonly container: HTMLElement;
    private readonly options: AuthPanelOptions;

    private root!: HTMLElement;
    private errorElement!: HTMLElement;
    private loadingElement!: HTMLElement;
    private emailInput!: HTMLInputElement;
    private passwordInput!: HTMLInputElement;
    private emailForm!: HTMLFormElement;
    private createAccountButton!: HTMLButtonElement;
    private providerContainer!: HTMLElement;
    private profileSection!: HTMLElement;
    private signOutButton!: HTMLButtonElement;

    constructor(container: HTMLElement, manager: AuthManager, options: AuthPanelOptions = {}) {
        super();
        this.container = container;
        this.manager = manager;
        this.options = options;

        this.render();
        this._register(this.manager.onDidChange(state => this.update(state)));

        void this.manager.initialize().catch(error => this.renderError(error));
        this.update(this.manager.state);
    }

    private render(): void {
        this.root = document.createElement('div');
        this.root.className = 'edu-auth-panel';

        this.errorElement = document.createElement('div');
        this.errorElement.className = 'edu-auth-panel__error';
        this.errorElement.style.display = 'none';
        this.root.appendChild(this.errorElement);

        this.loadingElement = document.createElement('div');
        this.loadingElement.className = 'edu-auth-panel__loading';
        this.loadingElement.textContent = 'Loading…';
        this.loadingElement.style.display = 'none';
        this.root.appendChild(this.loadingElement);

        this.emailForm = document.createElement('form');
        this.emailForm.className = 'edu-auth-panel__form';
        this.emailInput = document.createElement('input');
        this.emailInput.type = 'email';
        this.emailInput.placeholder = 'Email';
        this.emailInput.autocomplete = 'email';
        this.emailInput.required = true;

        this.passwordInput = document.createElement('input');
        this.passwordInput.type = 'password';
        this.passwordInput.placeholder = 'Password';
        this.passwordInput.autocomplete = 'current-password';
        this.passwordInput.required = true;

        const buttonsRow = document.createElement('div');
        buttonsRow.className = 'edu-auth-panel__button-row';

        const submitButton = document.createElement('button');
        submitButton.type = 'submit';
        submitButton.textContent = this.options.signInLabel ?? 'Sign in';

        this.createAccountButton = document.createElement('button');
        this.createAccountButton.type = 'button';
        this.createAccountButton.textContent = this.options.signUpLabel ?? 'Create account';
        this.createAccountButton.className = 'edu-auth-panel__secondary-button';

        buttonsRow.append(submitButton, this.createAccountButton);
        this.emailForm.append(this.emailInput, this.passwordInput, buttonsRow);

        this._register(addDisposableListener(this.emailForm, 'submit', event => {
            event.preventDefault();
            void this.handleEmailSubmission('signin');
        }));
        this._register(addDisposableListener(this.createAccountButton, 'click', () => {
            void this.handleEmailSubmission('signup');
        }));
        this._register(addDisposableListener(this.emailInput, 'input', () => this.manager.clearError()));
        this._register(addDisposableListener(this.passwordInput, 'input', () => this.manager.clearError()));

        this.root.appendChild(this.emailForm);

        this.providerContainer = document.createElement('div');
        this.providerContainer.className = 'edu-auth-panel__providers';

        const providers = this.options.providers ?? DEFAULT_PROVIDERS;
        for (const provider of providers) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'edu-auth-panel__provider-button';
            button.textContent = provider.label;
            this._register(addDisposableListener(button, 'click', () => {
                void this.handleProviderSignIn(provider);
            }));
            this.providerContainer.appendChild(button);
        }

        this.providerContainer.style.display = this.providerContainer.childElementCount ? '' : 'none';
        this.root.appendChild(this.providerContainer);

        this.profileSection = document.createElement('div');
        this.profileSection.className = 'edu-auth-panel__profile';
        this.profileSection.style.display = 'none';

        const profileInfo = document.createElement('div');
        profileInfo.className = 'edu-auth-panel__profile-info';
        this.profileSection.appendChild(profileInfo);

        this.signOutButton = document.createElement('button');
        this.signOutButton.type = 'button';
        this.signOutButton.textContent = 'Sign out';
        this.signOutButton.className = 'edu-auth-panel__signout';
        this._register(addDisposableListener(this.signOutButton, 'click', () => {
            void this.manager.signOut().catch(err => this.renderError(err));
        }));

        this.profileSection.appendChild(this.signOutButton);
        this.root.appendChild(this.profileSection);

        this.container.appendChild(this.root);
    }

    private async handleEmailSubmission(mode: 'signin' | 'signup'): Promise<void> {
        const email = this.emailInput.value.trim();
        const password = this.passwordInput.value;

        if (!email || !password) {
            this.renderError('Please provide both email and password.');
            return;
        }

        try {
            if (mode === 'signin') {
                await this.manager.signInWithEmailAndPassword(email, password);
            } else {
                await this.manager.signUpWithEmailAndPassword(email, password);
            }
            this.clearError();
            this.passwordInput.value = '';
        } catch (error) {
            this.renderError(error);
        }
    }

    private async handleProviderSignIn(provider: AuthProviderButton): Promise<void> {
        try {
            await this.manager.signInWithProvider(provider);
            this.clearError();
        } catch (error) {
            this.renderError(error);
        }
    }

    private update(state: AuthState): void {
        this.setLoading(state.loading);

        if (state.error) {
            this.renderError(state.error);
        } else if (!state.loading) {
            this.clearError();
        }

        if (state.user) {
            this.showProfile(state);
        } else {
            this.showAuthForm();
        }
    }

    private showProfile(state: AuthState): void {
        this.profileSection.style.display = '';
        this.emailForm.style.display = 'none';
        this.providerContainer.style.display = 'none';

        const profileInfo = this.profileSection.querySelector('.edu-auth-panel__profile-info');
        if (!profileInfo) {
            return;
        }

        clearNode(profileInfo);

        const avatar = document.createElement('div');
        avatar.className = 'edu-auth-panel__avatar';
        avatar.textContent = deriveAvatarInitial(state.user);

        const name = document.createElement('div');
        name.className = 'edu-auth-panel__name';
        name.textContent = state.user.displayName || state.user.email || state.user.uid;

        const email = document.createElement('div');
        email.className = 'edu-auth-panel__email';
        email.textContent = state.user.email || 'No email linked';

        profileInfo.append(avatar, name, email);
    }

    private showAuthForm(): void {
        this.profileSection.style.display = 'none';
        this.emailForm.style.display = '';
        this.providerContainer.style.display = this.providerContainer.childElementCount ? '' : 'none';
    }

    private setLoading(loading: boolean): void {
        this.loadingElement.style.display = loading ? '' : 'none';
        this.emailInput.disabled = loading;
        this.passwordInput.disabled = loading;
        this.createAccountButton.disabled = loading;
        this.signOutButton.disabled = loading;

        for (const button of Array.from(this.providerContainer.querySelectorAll('button'))) {
            (button as HTMLButtonElement).disabled = loading;
        }
    }

    private renderError(error: unknown): void {
        const message = extractErrorMessage(error);
        if (!message) {
            this.clearError();
            return;
        }

        this.errorElement.textContent = message;
        this.errorElement.style.display = '';
    }

    private clearError(): void {
        this.errorElement.textContent = '';
        this.errorElement.style.display = 'none';
    }
}

function deriveAvatarInitial(user: AuthState['user']): string {
    const source = user?.displayName || user?.email || user?.uid || '?';
    return source.trim().charAt(0).toUpperCase() || '?';
}

function extractErrorMessage(error: unknown): string {
    if (!error) {
        return '';
    }

    if (typeof error === 'string') {
        return error;
    }

    if (typeof error === 'object' && error) {
        const candidate = error as Partial<AuthErrorDetail> & { message?: string };
        if (candidate.message) {
            return candidate.message;
        }
    }

    return 'An unexpected error occurred.';
}
