/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { AiProviderError, AiService, IAiProvider, IAiRequest, RestAiProvider } from '../../common/services/aiService.js';

declare const Response: typeof globalThis.Response;

declare const ReadableStream: typeof globalThis.ReadableStream;

declare const TextEncoder: typeof globalThis.TextEncoder;

suite('Edu AI Service', () => {
    const store = ensureNoDisposablesAreLeakedInTestSuite();

    test('Rest provider streams chunks', async () => {
        const encoder = new TextEncoder();
        const body = new ReadableStream<Uint8Array>({
            start(controller) {
                controller.enqueue(encoder.encode('chunk-one'));
                controller.enqueue(encoder.encode('chunk-two'));
                controller.close();
            }
        });

        const fetchStub = async () => new Response(body, { status: 200 });
        const provider = new RestAiProvider({ endpoint: 'https://example.test/ai', fetch: fetchStub as typeof fetch });

        const received: string[] = [];
        for await (const chunk of provider.sendMessage(testRequest())) {
            if (chunk.value) {
                received.push(chunk.value);
            }
        }

        assert.deepStrictEqual(received, ['chunk-one', 'chunk-two']);
    });

    test('Rest provider throws for HTTP errors', async () => {
        const fetchStub = async () => new Response('error', { status: 503 });
        const provider = new RestAiProvider({ endpoint: 'https://example.test/ai', fetch: fetchStub as typeof fetch });

        let error: unknown;
        try {
            for await (const _chunk of provider.sendMessage(testRequest())) {
                // no-op
            }
        } catch (err) {
            error = err;
        }

        assert.ok(error instanceof AiProviderError);
        assert.strictEqual(error.options.status, 503);
    });

    test('Service selects registered provider', async () => {
        const service = store.add(new AiService());
        const provider = new class implements IAiProvider {
            readonly id = 'static-provider';
            readonly supportsStreaming = false;
            async *sendMessage(): AsyncIterableIterator<{ value: string; done: boolean }> {
                yield { value: 'answer', done: true };
            }
        };

        service.registerProvider(provider);

        const responses: string[] = [];
        for await (const chunk of service.sendMessage(testRequest())) {
            responses.push(chunk.value);
        }

        assert.deepStrictEqual(responses, ['answer']);
        assert.strictEqual(service.providerId, provider.id);
    });
});

function testRequest(): IAiRequest {
    return {
        sessionId: 'test-session',
        prompt: 'hello'
    };
}
