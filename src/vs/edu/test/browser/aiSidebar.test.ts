/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { DisposableStore } from '../../../base/common/lifecycle.js';
import { AiProviderError, AiService, IAiProvider, IAiStreamChunk } from '../../common/services/aiService.js';
import { AiContextSource, AiSidebar, IAiContextDelegate, InMemoryAiConversationStore } from '../../browser/ai/aiSidebar.js';

suite('Edu AI Sidebar', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('renders streaming responses as assistant messages', async () => {
		const delegate = new StaticContextDelegate();
		const provider = new StreamingTestProvider([
			{ value: 'Hello', done: false },
			{ value: ' there', done: true }
		]);

		const { sidebar, container } = createSidebar(store, provider, delegate);

		await sidebar.sendPrompt('Explain');

		const messages = Array.from(container.querySelectorAll('.edu-ai-message'));
		assert.strictEqual(messages.length, 2); // user + assistant
		const assistant = messages[1];
		assert.ok(assistant.classList.contains('edu-ai-message--assistant'));
		assert.ok(assistant.textContent?.includes('Hello there'));
	});

	test('collects context selections and workflow-specific context', async () => {
		const delegate = new StaticContextDelegate({
			selection: { type: 'selection', label: 'Selection', value: 'selected code' },
			currentCell: { type: 'cell', label: 'Cell', value: 'cell code' },
			outputs: { type: 'outputs', label: 'Outputs', value: 'cell output' }
		});
		const provider = new StreamingTestProvider([{ value: 'Done', done: true }]);

		const { sidebar } = createSidebar(store, provider, delegate);
		sidebar.setContextEnabled('currentCell', true);
		sidebar.setContextEnabled('outputs', true);

		const contexts = await sidebar.gatherContextForTesting('default');
		assert.deepStrictEqual(contexts.map(c => c.type), ['cell', 'outputs']);

		const explainContexts = await sidebar.gatherContextForTesting('explain-selection');
		assert.ok(explainContexts.some(c => c.type === 'selection'));
	});

	test('marks assistant message as error when provider fails', async () => {
		const delegate = new StaticContextDelegate();
		const provider = new ErroringProvider();
		const { sidebar, container } = createSidebar(store, provider, delegate);

		await sidebar.sendPrompt('trigger error');

		const errorMessage = container.querySelector('.edu-ai-message.is-error');
		assert.ok(errorMessage, 'expected an error message bubble');
		assert.ok(errorMessage?.textContent?.length, 'error message should contain text');
	});
});

function createSidebar(store: DisposableStore, provider: IAiProvider, delegate: IAiContextDelegate): { sidebar: AiSidebar; container: HTMLElement } {
	const root = document.createElement('div');
	document.body.appendChild(root);
	store.add({ dispose: () => root.remove() });

	const service = store.add(new AiService());
	service.registerProvider(provider);

	const sidebar = store.add(new AiSidebar({
		container: root,
		aiService: service,
		conversationStore: new InMemoryAiConversationStore(),
		contextDelegate: delegate,
		sessionId: 'test-session'
	}));

	return { sidebar, container: root };
}

class StaticContextDelegate implements IAiContextDelegate {
	constructor(private readonly contexts: Partial<Record<AiContextSource, { type: string; label: string; value: string }>> = {}) { }

	async resolve(source: AiContextSource) {
		const entry = this.contexts[source];
		return entry ? { ...entry } : undefined;
	}
}

class StreamingTestProvider implements IAiProvider {
	readonly id = 'test-streaming';
	readonly supportsStreaming = true;

	constructor(private readonly chunks: IAiStreamChunk[]) { }

	async *sendMessage(): AsyncIterable<IAiStreamChunk> {
		for (const chunk of this.chunks) {
			yield chunk;
		}
	}
}

class ErroringProvider implements IAiProvider {
	readonly id = 'test-error';
	readonly supportsStreaming = false;

	async *sendMessage(): AsyncIterable<IAiStreamChunk> {
		throw new AiProviderError('failure', { status: 500 });
	}
}
