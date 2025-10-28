/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { createDecorator } from '../../../platform/instantiation/common/instantiation.js';
import { InstantiationType, registerSingleton } from '../../../platform/instantiation/common/extensions.js';

export const IAiService = createDecorator<IAiService>('eduAiService');

export type AiChatRole = 'user' | 'assistant' | 'system';

export type AiWorkflow = 'default' | 'explain-selection' | 'review-improvements' | 'step-guide';

export interface IAiContextItem {
	readonly type: 'cell' | 'notebook' | 'selection' | 'outputs' | string;
	readonly label?: string;
	readonly value: string;
}

export interface IAiChatMessage {
	readonly id: string;
	readonly role: AiChatRole;
	content: string;
	readonly createdAt: number;
	readonly context?: readonly IAiContextItem[];
}

export interface IAiRequest {
	readonly sessionId: string;
	readonly prompt: string;
	readonly workflow?: AiWorkflow;
	readonly context?: readonly IAiContextItem[];
	readonly history?: readonly IAiChatMessage[];
}

export interface IAiStreamChunk {
	readonly value: string;
	readonly done: boolean;
}

export interface IAiProvider {
	readonly id: string;
	readonly supportsStreaming: boolean;
	sendMessage(request: IAiRequest): AsyncIterable<IAiStreamChunk>;
}

export class AiProviderError extends Error {
	constructor(
		message: string,
		readonly options: { status?: number; retryAfter?: number; cause?: unknown } = {}
	) {
		super(message);
		this.name = 'AiProviderError';
	}
}

export interface IAiService {
	readonly _serviceBrand: undefined;
	readonly providerId: string | undefined;
	readonly onDidChangeProvider: Event<IAiProvider | undefined>;

	registerProvider(provider: IAiProvider): void;
	setActiveProvider(providerId: string): void;
	getProviders(): readonly IAiProvider[];
	sendMessage(request: IAiRequest): AsyncIterable<IAiStreamChunk>;
}

export class AiService extends Disposable implements IAiService {
	declare readonly _serviceBrand: undefined;

	private readonly providers = new Map<string, IAiProvider>();
	private _activeProviderId: string | undefined;
	private readonly _onDidChangeProvider = this._register(new Emitter<IAiProvider | undefined>());
	readonly onDidChangeProvider: Event<IAiProvider | undefined> = this._onDidChangeProvider.event;

	get providerId(): string | undefined {
		return this._activeProviderId;
	}

	override dispose(): void {
		super.dispose();
		this.providers.clear();
	}

	registerProvider(provider: IAiProvider): void {
		this.providers.set(provider.id, provider);
		if (!this._activeProviderId) {
			this._activeProviderId = provider.id;
			this._onDidChangeProvider.fire(provider);
			return;
		}

		if (this._activeProviderId === provider.id) {
			this._onDidChangeProvider.fire(provider);
		}
	}

	setActiveProvider(providerId: string): void {
		if (!this.providers.has(providerId)) {
			throw new Error(`AI provider '${providerId}' has not been registered.`);
		}

		if (this._activeProviderId !== providerId) {
			this._activeProviderId = providerId;
			this._onDidChangeProvider.fire(this.providers.get(providerId));
		}
	}

	getProviders(): readonly IAiProvider[] {
		return Array.from(this.providers.values());
	}

	sendMessage(request: IAiRequest): AsyncIterable<IAiStreamChunk> {
		const provider = this.getActiveProvider();
		return provider.sendMessage(request);
	}

	private getActiveProvider(): IAiProvider {
		if (!this._activeProviderId) {
			throw new Error('No AI provider has been registered');
		}

		const provider = this.providers.get(this._activeProviderId);
		if (!provider) {
			throw new Error(`AI provider '${this._activeProviderId}' is not available`);
		}

		return provider;
	}
}

registerSingleton(IAiService, AiService, InstantiationType.Delayed);

export interface IRestAiProviderOptions {
	readonly endpoint: string;
	readonly apiKey?: string;
	readonly stream?: boolean;
	readonly headers?: Record<string, string>;
	readonly fetch?: typeof fetch;
	readonly requestFields?: Record<string, unknown>;
}

export class RestAiProvider implements IAiProvider {
	readonly id = 'edu-rest-provider';
	readonly supportsStreaming = true;

	private readonly endpoint: string;
	private readonly apiKey?: string;
	private readonly shouldStream: boolean;
	private readonly baseHeaders: Record<string, string>;
	private readonly fetchFn: typeof fetch;
	private readonly requestFields: Record<string, unknown>;

	constructor(options: IRestAiProviderOptions) {
		this.endpoint = options.endpoint;
		this.apiKey = options.apiKey;
		this.shouldStream = options.stream !== false;
		this.baseHeaders = { 'Content-Type': 'application/json', ...(options.headers ?? {}) };
		this.requestFields = options.requestFields ?? {};

		const fetchImpl = options.fetch ?? (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : undefined);
		if (!fetchImpl) {
			throw new Error('Fetch API is not available in the current environment.');
		}

		this.fetchFn = fetchImpl;
	}

	async *sendMessage(request: IAiRequest): AsyncIterable<IAiStreamChunk> {
		let response: Response;
		try {
			response = await this.fetchFn(this.endpoint, {
				method: 'POST',
				headers: this.composeHeaders(),
				body: JSON.stringify(this.composePayload(request))
			});
		} catch (error) {
			throw new AiProviderError('Failed to reach AI service endpoint.', { cause: error });
		}

		if (!response.ok) {
			throw new AiProviderError(
				`AI service responded with status ${response.status}`,
				{ status: response.status }
			);
		}

		if (!this.shouldStream || !response.body) {
			const text = await response.text();
			yield { value: text, done: true };
			return;
		}

		const reader = response.body.getReader();
		const decoder = new TextDecoder();

		while (true) {
			const { done, value } = await reader.read();
			if (done) {
				break;
			}

			if (!value) {
				continue;
			}

			const decoded = decoder.decode(value, { stream: true });
			if (decoded.length === 0) {
				continue;
			}

			for (const part of this.splitChunk(decoded)) {
				if (part.length === 0) {
					continue;
				}
				yield { value: part, done: false };
			}
		}

		yield { value: '', done: true };
	}

	private composeHeaders(): Record<string, string> {
		const headers: Record<string, string> = { ...this.baseHeaders };
		if (this.apiKey && !headers['Authorization']) {
			headers['Authorization'] = `Bearer ${this.apiKey}`;
		}
		return headers;
	}

	private composePayload(request: IAiRequest): Record<string, unknown> {
		const base = {
			prompt: request.prompt,
			sessionId: request.sessionId,
			workflow: request.workflow ?? 'default',
			context: request.context?.map(item => ({
				type: item.type,
				label: item.label,
				value: item.value
			})),
			history: request.history?.map(message => ({
				id: message.id,
				role: message.role,
				content: message.content,
				createdAt: message.createdAt,
				context: message.context?.map(item => ({
					type: item.type,
					label: item.label,
					value: item.value
				}))
			}))
		};

		return { ...this.requestFields, ...base };
	}

	private splitChunk(chunk: string): string[] {
		// Handle server-sent-events streams by splitting on double newlines and stripping the data prefix.
		const parts: string[] = [];
		let buffer = '';
		for (const line of chunk.split(/\r?\n/)) {
			if (line.startsWith('data:')) {
				buffer += line.slice(5).trimStart();
				buffer += '\n';
				continue;
			}

			if (line.trim().length === 0) {
				if (buffer.length) {
					parts.push(buffer.trimEnd());
					buffer = '';
				}
				continue;
			}

			buffer += line;
			buffer += '\n';
		}

		if (buffer.length) {
			parts.push(buffer.trimEnd());
		}

		return parts.length ? parts : [chunk];
	}
}
