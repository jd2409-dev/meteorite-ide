/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../base/browser/dom.js';
import { IRenderedMarkdown, renderMarkdown } from '../../../base/browser/markdownRenderer.js';
import { onUnexpectedError } from '../../../base/common/errors.js';
import { MarkdownString } from '../../../base/common/htmlContent.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../base/common/lifecycle.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { localize } from '../../../nls.js';
import { AiProviderError, AiWorkflow, IAiChatMessage, IAiContextItem, IAiService, IAiStreamChunk } from '../../common/services/aiService.js';

const $ = DOM.$;

export type AiContextSource = 'selection' | 'currentCell' | 'outputs' | 'notebook';

const contextOrder: readonly AiContextSource[] = ['selection', 'currentCell', 'outputs', 'notebook'];

export interface IAiContextDelegate {
	resolve(source: AiContextSource): Promise<IAiContextItem | undefined>;
}

export interface IAiConversationStore {
	load(sessionId: string): Promise<readonly IAiChatMessage[] | undefined> | readonly IAiChatMessage[] | undefined;
	save(sessionId: string, messages: readonly IAiChatMessage[]): Promise<void> | void;
	clear?(sessionId: string): Promise<void> | void;
}

export class InMemoryAiConversationStore implements IAiConversationStore {
	private readonly state = new Map<string, IAiChatMessage[]>();

	async load(sessionId: string): Promise<readonly IAiChatMessage[] | undefined> {
		const messages = this.state.get(sessionId);
		return messages ? messages.map(cloneMessage) : undefined;
	}

	async save(sessionId: string, messages: readonly IAiChatMessage[]): Promise<void> {
		this.state.set(sessionId, messages.map(cloneMessage));
	}

	async clear(sessionId: string): Promise<void> {
		this.state.delete(sessionId);
	}
}

function cloneMessage(message: IAiChatMessage): IAiChatMessage {
	return {
		id: message.id,
		role: message.role,
		content: message.content,
		createdAt: message.createdAt,
		context: message.context?.map(item => ({ ...item }))
	};
}

export interface IAiSidebarOptions {
	readonly container: HTMLElement;
	readonly aiService: IAiService;
	readonly conversationStore: IAiConversationStore;
	readonly contextDelegate: IAiContextDelegate;
	readonly sessionId: string;
}

interface IMessageElement {
	readonly container: HTMLElement;
	readonly bubble: HTMLElement;
}

export class AiSidebar extends Disposable {
	private readonly aiService: IAiService;
	private contextDelegate: IAiContextDelegate;
	private readonly store: IAiConversationStore;
	private sessionId: string;

	private readonly root: HTMLElement;
	private readonly header: HTMLElement;
	private readonly messageList: HTMLElement;
	private readonly contextSection: HTMLElement;
	private readonly contextBadgeContainer: HTMLElement;
	private readonly composer: HTMLElement;
	private readonly inputElement: HTMLTextAreaElement;
	private readonly sendButton: HTMLButtonElement;
	private readonly toggleButton: HTMLButtonElement;

	private readonly contextCheckboxes = new Map<AiContextSource, HTMLInputElement>();
	private readonly contextSelections = new Set<AiContextSource>();
	private readonly messages: IAiChatMessage[] = [];
	private readonly messageDom = new Map<string, IMessageElement>();
	private readonly markdownByMessage = new Map<string, IRenderedMarkdown>();

	private readonly _onDidSendRequest = this._register(new Emitter<void>());
	readonly onDidSendRequest: Event<void> = this._onDidSendRequest.event;

	private isCollapsed = false;
	private isSending = false;

	constructor(options: IAiSidebarOptions) {
		super();
		this.aiService = options.aiService;
		this.contextDelegate = options.contextDelegate;
		this.store = options.conversationStore;
		this.sessionId = options.sessionId;

		this.root = DOM.append(options.container, $('.edu-ai-sidebar'));
		this.header = DOM.append(this.root, $('.edu-ai-sidebar__header'));
		this.toggleButton = this.createToggleButton(this.header);

		const title = DOM.append(this.header, $('h2.edu-ai-sidebar__title'));
		title.textContent = localize('edu.ai.sidebar.title', "AI Assistant");

		const workflowBar = DOM.append(this.header, $('.edu-ai-sidebar__workflows'));
		this.createWorkflowButtons(workflowBar);

		this.contextSection = DOM.append(this.root, $('.edu-ai-sidebar__context'));
		const contextHeader = DOM.append(this.contextSection, $('div.edu-ai-sidebar__context-header'));
		contextHeader.textContent = localize('edu.ai.sidebar.context.title', "Context");
		this.contextBadgeContainer = DOM.append(this.contextSection, $('.edu-ai-sidebar__context-badges'));
		this.createContextControls(DOM.append(this.contextSection, $('.edu-ai-sidebar__context-controls')));

		this.messageList = DOM.append(this.root, $('.edu-ai-sidebar__messages'));
		this.composer = DOM.append(this.root, $('.edu-ai-sidebar__composer'));
		this.inputElement = DOM.append(this.composer, $('textarea.edu-ai-sidebar__input')) as HTMLTextAreaElement;
		this.inputElement.rows = 3;
		this.sendButton = DOM.append(this.composer, $('button.edu-ai-sidebar__send')) as HTMLButtonElement;
		this.sendButton.textContent = localize('edu.ai.sidebar.send', "Send");

		const composerDisposables = this._register(new DisposableStore());
		composerDisposables.add(DOM.addDisposableListener(this.sendButton, 'click', () => { void this.handleSend(); }));
		composerDisposables.add(DOM.addDisposableListener(this.inputElement, 'keydown', (event: KeyboardEvent) => {
			if ((event.key === 'Enter' || event.key === 'Return') && (event.metaKey || event.ctrlKey)) {
				event.preventDefault();
				void this.handleSend();
			}
		}));

		this._register(this.aiService.onDidChangeProvider(() => this.updateProviderState()));
		this.updateProviderState();

		void this.restoreConversation();
	}

	get activeSessionId(): string {
		return this.sessionId;
	}

	updateContextDelegate(delegate: IAiContextDelegate): void {
		this.contextDelegate = delegate;
	}

	async setSession(sessionId: string): Promise<void> {
		if (this.sessionId === sessionId) {
			return;
		}
		this.sessionId = sessionId;
		this.resetMessages();
		await this.restoreConversation();
	}

	setContextEnabled(source: AiContextSource, enabled: boolean): void {
		const checkbox = this.contextCheckboxes.get(source);
		if (!checkbox) {
			return;
		}
		checkbox.checked = enabled;
		if (enabled) {
			this.contextSelections.add(source);
		} else {
			this.contextSelections.delete(source);
		}
		this.renderContextBadges();
	}

	async sendPrompt(prompt: string, workflow: AiWorkflow = 'default'): Promise<void> {
		const trimmed = prompt.trim();
		if (!trimmed) {
			return;
		}
		this.inputElement.value = '';
		await this.dispatchRequest(trimmed, workflow);
	}

	async gatherContextForTesting(workflow: AiWorkflow = 'default'): Promise<readonly IAiContextItem[]> {
		return this.resolveContext(workflow);
	}

	private createToggleButton(header: HTMLElement): HTMLButtonElement {
		const button = DOM.append(header, $('button.edu-ai-sidebar__toggle')) as HTMLButtonElement;
		button.type = 'button';
		button.textContent = localize('edu.ai.sidebar.hide', "Hide");
		this._register(DOM.addDisposableListener(button, 'click', () => {
			this.isCollapsed = !this.isCollapsed;
			DOM.toggleClass(this.root, 'is-collapsed', this.isCollapsed);
			button.textContent = this.isCollapsed
				? localize('edu.ai.sidebar.show', "Show")
				: localize('edu.ai.sidebar.hide', "Hide");
		}));
		return button;
	}

	private createWorkflowButtons(container: HTMLElement): void {
		const workflows: Array<{ source: AiWorkflow; label: string; title: string }> = [
			{
				source: 'explain-selection',
				label: localize('edu.ai.sidebar.workflow.explain.label', "Explain"),
				title: localize('edu.ai.sidebar.workflow.explain.title', "Explain highlighted code")
			},
			{
				source: 'review-improvements',
				label: localize('edu.ai.sidebar.workflow.review.label', "Review"),
				title: localize('edu.ai.sidebar.workflow.review.title', "Suggest improvements")
			},
			{
				source: 'step-guide',
				label: localize('edu.ai.sidebar.workflow.guide.label', "Guide"),
				title: localize('edu.ai.sidebar.workflow.guide.title', "Guide failing execution")
			}
		];

		for (const workflow of workflows) {
			const button = DOM.append(container, $('button.edu-ai-sidebar__workflow')) as HTMLButtonElement;
			button.type = 'button';
			button.textContent = workflow.label;
			button.title = workflow.title;
			this._register(DOM.addDisposableListener(button, 'click', () => {
				void this.handleSend(workflow.source);
			}));
		}
	}

	private createContextControls(container: HTMLElement): void {
		const options: Array<{ source: AiContextSource; label: string }> = [
			{ source: 'selection', label: localize('edu.ai.sidebar.context.selection', "Selection") },
			{ source: 'currentCell', label: localize('edu.ai.sidebar.context.currentCell', "Current cell") },
			{ source: 'outputs', label: localize('edu.ai.sidebar.context.outputs', "Cell outputs") },
			{ source: 'notebook', label: localize('edu.ai.sidebar.context.notebook', "Entire notebook") }
		];

		for (const option of options) {
			const label = DOM.append(container, $('label.edu-ai-sidebar__context-option')) as HTMLLabelElement;
			const checkbox = label.appendChild(document.createElement('input'));
			checkbox.type = 'checkbox';
			checkbox.classList.add('edu-ai-sidebar__context-checkbox');
			label.appendChild(document.createTextNode(option.label));
			this.contextCheckboxes.set(option.source, checkbox);
			this._register(DOM.addDisposableListener(checkbox, 'change', () => {
				if (checkbox.checked) {
					this.contextSelections.add(option.source);
				} else {
					this.contextSelections.delete(option.source);
				}
				this.renderContextBadges();
			}));
		}
	}

	private renderContextBadges(): void {
		DOM.clearNode(this.contextBadgeContainer);
		for (const source of contextOrder) {
			if (!this.contextSelections.has(source)) {
				continue;
			}
			const badge = DOM.append(this.contextBadgeContainer, $('span.edu-ai-sidebar__context-badge'));
			badge.textContent = this.getContextLabel(source);
		}
	}

	private getContextLabel(source: AiContextSource): string {
		switch (source) {
			case 'selection':
				return localize('edu.ai.sidebar.context.selection.badge', "Selection");
			case 'currentCell':
				return localize('edu.ai.sidebar.context.currentCell.badge', "Cell");
			case 'outputs':
				return localize('edu.ai.sidebar.context.outputs.badge', "Outputs");
			case 'notebook':
				return localize('edu.ai.sidebar.context.notebook.badge', "Notebook");
			default:
				return source;
		}
	}

	private async restoreConversation(): Promise<void> {
		const stored = await Promise.resolve(this.store.load(this.sessionId));
		if (!stored || stored.length === 0) {
			return;
		}

		for (const message of stored) {
			this.messages.push(cloneMessage(message));
			this.renderMessage(message);
		}
	}

	private resetMessages(): void {
		this.messages.length = 0;
		this.contextSelections.clear();
		for (const markdown of this.markdownByMessage.values()) {
			markdown.dispose();
		}
		this.markdownByMessage.clear();
		this.messageDom.clear();
		DOM.clearNode(this.messageList);
		this.renderContextBadges();
	}

	private async handleSend(workflow: AiWorkflow = 'default'): Promise<void> {
		const prompt = this.inputElement.value.trim();
		if (!prompt) {
			return;
		}
		this.inputElement.value = '';
		await this.dispatchRequest(prompt, workflow);
	}

	private async dispatchRequest(prompt: string, workflow: AiWorkflow): Promise<void> {
		if (this.isSending) {
			return;
		}

		this.isSending = true;
		this.setComposerEnabled(false);

		const contexts = await this.resolveContext(workflow);
		const userMessage = this.appendMessage({
			id: generateUuid(),
			role: 'user',
			content: prompt,
			createdAt: Date.now(),
			context: contexts.length ? contexts : undefined
		});
		this.persistConversation();

		const assistantMessage = this.appendMessage({
			id: generateUuid(),
			role: 'assistant',
			content: '',
			createdAt: Date.now(),
			context: contexts.length ? contexts : undefined
		});

		this._onDidSendRequest.fire();

		try {
			await this.consumeResponse(prompt, workflow, contexts, userMessage, assistantMessage);
		} catch (error) {
			this.displayError(assistantMessage, error);
		} finally {
			this.persistConversation();
			this.setComposerEnabled(true);
			this.isSending = false;
		}
	}

	private appendMessage(message: IAiChatMessage): IAiChatMessage {
		const model = cloneMessage(message);
		this.messages.push(model);
		this.renderMessage(model);
		return model;
	}

	private async consumeResponse(
		prompt: string,
		workflow: AiWorkflow,
		contexts: readonly IAiContextItem[],
		userMessage: IAiChatMessage,
		assistantMessage: IAiChatMessage
	): Promise<void> {
		let lastChunk: IAiStreamChunk | undefined;
		const history = this.messages.slice(0, this.messages.length - 1);

		const stream = this.aiService.sendMessage({
			sessionId: this.sessionId,
			prompt,
			workflow,
			context: contexts,
			history
		});

		try {
			for await (const chunk of stream) {
				lastChunk = chunk;
				if (chunk.value) {
					assistantMessage.content += chunk.value;
					this.updateMessageContent(assistantMessage);
					this.persistConversation();
				}
				if (chunk.done) {
					break;
				}
			}
		} finally {
			if (lastChunk && lastChunk.done && !lastChunk.value && assistantMessage.content.trim().length === 0) {
				assistantMessage.content = localize('edu.ai.sidebar.noResponse', "The AI provider did not return a response.");
				this.updateMessageContent(assistantMessage);
			}
		}
	}

	private displayError(message: IAiChatMessage, error: unknown): void {
		const messageElement = this.messageDom.get(message.id);
		const bubble = messageElement?.bubble;
		const container = messageElement?.container;

		if (container) {
			container.classList.add('is-error');
		}

		const text = error instanceof AiProviderError
			? (error.options.status
				? localize('edu.ai.sidebar.error.status', "The AI service responded with status {0}.", error.options.status)
				: localize('edu.ai.sidebar.error.general', "We couldn't complete that request. Please try again."))
			: localize('edu.ai.sidebar.error.general', "We couldn't complete that request. Please try again.");

		message.content = text;
		if (bubble) {
			bubble.textContent = text;
		}
		this.persistConversation();
	}

	private setComposerEnabled(enabled: boolean): void {
		this.inputElement.disabled = !enabled;
		this.sendButton.disabled = !enabled;
	}

	private renderMessage(message: IAiChatMessage): void {
		const container = DOM.append(this.messageList, $('.edu-ai-message'));
		container.classList.add(`edu-ai-message--${message.role}`);

		const author = DOM.append(container, $('div.edu-ai-message__author'));
		author.textContent = this.getRoleLabel(message.role);

		if (message.context && message.context.length) {
			const contextRow = DOM.append(container, $('.edu-ai-message__context-row'));
			for (const item of message.context) {
				const badge = DOM.append(contextRow, $('span.edu-ai-message__context-badge'));
				badge.textContent = item.label ?? item.type;
			}
		}

		const bubble = DOM.append(container, $('div.edu-ai-message__bubble'));
		this.messageDom.set(message.id, { container, bubble });
		this.updateMessageContent(message, bubble);
		this.scrollToBottom();
	}

	private updateMessageContent(message: IAiChatMessage, target?: HTMLElement): void {
		const entry = this.messageDom.get(message.id);
		const bubble = target ?? entry?.bubble;
		if (!bubble) {
			return;
		}

		if (message.role === 'assistant') {
			const existing = this.markdownByMessage.get(message.id);
			if (existing) {
				existing.dispose();
				this.markdownByMessage.delete(message.id);
			}

			const markdown = new MarkdownString(message.content);
			markdown.supportThemeIcons = true;
			markdown.isTrusted = true;
			const rendered = renderMarkdown(markdown);
			this.markdownByMessage.set(message.id, rendered);
			DOM.reset(bubble, rendered.element);
		} else {
			DOM.reset(bubble, document.createTextNode(message.content));
		}
	}

	private getRoleLabel(role: IAiChatMessage['role']): string {
		switch (role) {
			case 'user':
				return localize('edu.ai.sidebar.role.user', "You");
			case 'assistant':
				return localize('edu.ai.sidebar.role.assistant', "Assistant");
			case 'system':
				return localize('edu.ai.sidebar.role.system', "System");
			default:
				return role;
		}
	}

	private scrollToBottom(): void {
		this.messageList.scrollTop = this.messageList.scrollHeight;
	}

	private async resolveContext(workflow: AiWorkflow): Promise<IAiContextItem[]> {
		const requested = new Set<AiContextSource>(this.contextSelections);
		switch (workflow) {
			case 'explain-selection':
				requested.add('selection');
				break;
			case 'review-improvements':
				requested.add('currentCell');
				break;
			case 'step-guide':
				requested.add('outputs');
				requested.add('currentCell');
				break;
		}

		const result: IAiContextItem[] = [];
		for (const source of contextOrder) {
			if (!requested.has(source)) {
				continue;
			}
			try {
				const context = await this.contextDelegate.resolve(source);
				if (context) {
					result.push(context);
				}
			} catch (error) {
				onUnexpectedError(error);
			}
		}

		return result;
	}

	private persistConversation(): void {
		void Promise.resolve(this.store.save(this.sessionId, this.messages)).catch(onUnexpectedError);
	}

	private updateProviderState(): void {
		const hasProvider = this.aiService.providerId !== undefined;
		this.root.classList.toggle('is-disabled', !hasProvider);
		this.setComposerEnabled(hasProvider && !this.isSending);
	}
}
