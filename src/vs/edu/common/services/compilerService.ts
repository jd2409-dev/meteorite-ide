/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { VSBuffer, decodeBase64, decodeHex } from '../../../../base/common/buffer.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { Mimes } from '../../../../base/common/mime.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchEnvironmentService } from '../../../../workbench/services/environment/common/environmentService.js';

export const ICompilerService = createDecorator<ICompilerService>('compilerService');

export type CompilerRunStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'timeout';
export type CompilerLogLevel = 'info' | 'warning' | 'error';

export interface CompilerExecutionRequest {
    readonly language: string;
    readonly code: string;
    readonly stdin?: string;
    readonly files?: readonly CompilerRequestFile[];
    readonly arguments?: readonly string[];
    readonly metadata?: Record<string, unknown>;
}

export interface CompilerRequestFile {
    readonly path: string;
    readonly contents: string;
}

export interface CompilerArtifact {
    readonly id?: string;
    readonly name?: string;
    readonly mimeType: string;
    readonly data: string;
    readonly encoding?: 'base64' | 'utf-8' | 'hex';
}

export type CompilerStreamEvent =
    | { readonly type: 'status'; readonly runId: string; readonly status: CompilerRunStatus }
    | { readonly type: 'stdout'; readonly runId: string; readonly text: string; readonly sequence: number }
    | { readonly type: 'stderr'; readonly runId: string; readonly text: string; readonly sequence: number }
    | { readonly type: 'log'; readonly runId: string; readonly level: CompilerLogLevel; readonly message: string; readonly sequence: number }
    | { readonly type: 'artifact'; readonly runId: string; readonly artifact: CompilerArtifact }
    | { readonly type: 'result'; readonly runId: string; readonly status: CompilerRunStatus; readonly exitCode?: number; readonly durationMs?: number };

export type CompilerServiceErrorCode = 'not-configured' | 'network' | 'timeout' | 'cancelled' | 'http' | 'invalid-response' | 'failed-run';

export class CompilerServiceError extends Error {
    override readonly name = 'CompilerServiceError';

    constructor(
        readonly code: CompilerServiceErrorCode,
        message: string,
        readonly status?: number,
        readonly details?: unknown,
        readonly runId?: string
    ) {
        super(message);
    }
}

export interface ICompilerService {
    readonly _serviceBrand: undefined;
    readonly isConfigured: boolean;
    stream(request: CompilerExecutionRequest, token: CancellationToken): AsyncIterable<CompilerStreamEvent>;
    cancel(runId: string): Promise<void>;
}

interface CompilerRunSnapshot {
    readonly id: string;
    readonly status: CompilerRunStatus;
    readonly stdout?: unknown[];
    readonly stderr?: unknown[];
    readonly logs?: unknown[];
    readonly artifacts?: unknown[];
    readonly exitCode?: number;
    readonly durationMs?: number;
    readonly error?: unknown;
}

interface CompilerErrorResponse {
    readonly code?: string;
    readonly message?: string;
    readonly details?: unknown;
}

interface ResolvedCompilerServiceOptions {
    readonly endpoint?: string;
    readonly headers: Record<string, string>;
    readonly pollInterval: number;
    readonly maxPollInterval: number;
    readonly requestTimeout: number;
}

interface RunProgressState {
    lastStatus?: CompilerRunStatus;
    stdoutIndex: number;
    stderrIndex: number;
    logIndex: number;
    artifactIds: Set<string>;
}

const DEFAULT_POLL_INTERVAL = 500;
const DEFAULT_MAX_POLL_INTERVAL = 4000;
const DEFAULT_REQUEST_TIMEOUT = 15000;
const MAX_STREAM_CHUNK = 5000;

function sanitizeEndpoint(endpoint: string | undefined): string | undefined {
    if (!endpoint) {
        return undefined;
    }
    const trimmed = endpoint.trim();
    if (!trimmed) {
        return undefined;
    }
    return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
}

function coercePositiveInt(value: unknown, fallback: number, minimum = 0, maximum = Number.MAX_SAFE_INTEGER): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return fallback;
    }
    const coerced = Math.floor(value);
    if (coerced < minimum) {
        return minimum;
    }
    if (coerced > maximum) {
        return maximum;
    }
    return coerced;
}

function toText(chunk: unknown): string | undefined {
    if (typeof chunk === 'string') {
        return chunk;
    }
    if (chunk && typeof chunk === 'object') {
        if ('text' in chunk && typeof (chunk as { text: unknown }).text === 'string') {
            return (chunk as { text: string }).text;
        }
        if ('chunk' in chunk && typeof (chunk as { chunk: unknown }).chunk === 'string') {
            return (chunk as { chunk: string }).chunk;
        }
    }
    return undefined;
}

function toLogLevel(entry: unknown): CompilerLogLevel {
    if (entry && typeof entry === 'object' && 'level' in entry) {
        const level = (entry as { level?: unknown }).level;
        if (level === 'error' || level === 'warning' || level === 'info') {
            return level;
        }
    }
    return 'info';
}

function toArtifact(entry: unknown, fallbackId: string): CompilerArtifact | undefined {
    if (!entry || typeof entry !== 'object') {
        return undefined;
    }
    const payload = entry as { id?: unknown; name?: unknown; mimeType?: unknown; mime?: unknown; data?: unknown; content?: unknown; encoding?: unknown };
    const mimeType = typeof payload.mimeType === 'string' ? payload.mimeType : (typeof payload.mime === 'string' ? payload.mime : undefined);
    const data = typeof payload.data === 'string' ? payload.data : (typeof payload.content === 'string' ? payload.content : undefined);
    if (!mimeType || !data) {
        return undefined;
    }
    const id = typeof payload.id === 'string' && payload.id ? payload.id : fallbackId;
    const name = typeof payload.name === 'string' ? payload.name : undefined;
    let encoding: CompilerArtifact['encoding'];
    if (typeof payload.encoding === 'string') {
        if (payload.encoding === 'base64' || payload.encoding === 'utf-8' || payload.encoding === 'hex') {
            encoding = payload.encoding;
        }
    }
    return { id, name, mimeType, data, encoding };
}

function toErrorResponse(response: unknown): CompilerErrorResponse | undefined {
    if (!response || typeof response !== 'object') {
        return undefined;
    }
    const value = response as CompilerErrorResponse;
    const code = typeof value.code === 'string' ? value.code : undefined;
    const message = typeof value.message === 'string' ? value.message : undefined;
    const details = value.details;
    if (!code && !message) {
        return undefined;
    }
    return { code, message, details };
}

export class CompilerService implements ICompilerService {
    declare readonly _serviceBrand: undefined;

    private readonly _options: ResolvedCompilerServiceOptions;

    constructor(
        @IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService
    ) {
        const raw = environmentService.eduCompilerService;
        const endpoint = sanitizeEndpoint(typeof raw === 'object' ? (raw as { endpoint?: unknown }).endpoint as (string | undefined) : undefined);
        const headers: Record<string, string> = {};
        if (raw && typeof raw === 'object' && 'headers' in raw && raw.headers && typeof raw.headers === 'object') {
            for (const [key, value] of Object.entries(raw.headers as Record<string, unknown>)) {
                if (typeof value === 'string') {
                    headers[key] = value;
                }
            }
        }
        this._options = {
            endpoint,
            headers,
            pollInterval: coercePositiveInt(raw && typeof raw === 'object' && 'pollInterval' in raw ? (raw as { pollInterval?: unknown }).pollInterval : undefined, DEFAULT_POLL_INTERVAL, 0, 60_000),
            maxPollInterval: coercePositiveInt(raw && typeof raw === 'object' && 'maxPollInterval' in raw ? (raw as { maxPollInterval?: unknown }).maxPollInterval : undefined, DEFAULT_MAX_POLL_INTERVAL, DEFAULT_POLL_INTERVAL, 120_000),
            requestTimeout: coercePositiveInt(raw && typeof raw === 'object' && 'requestTimeout' in raw ? (raw as { requestTimeout?: unknown }).requestTimeout : undefined, DEFAULT_REQUEST_TIMEOUT, 1_000, 120_000)
        };
    }

    get isConfigured(): boolean {
        return !!this._options.endpoint;
    }

    async *stream(request: CompilerExecutionRequest, token: CancellationToken): AsyncIterable<CompilerStreamEvent> {
        if (!this._options.endpoint) {
            throw new CompilerServiceError('not-configured', 'Universal Compiler API endpoint is not configured.');
        }

        const createResponse = await this._createRun(request, token);
        const runId = createResponse.id;
        const state: RunProgressState = {
            lastStatus: undefined,
            stdoutIndex: 0,
            stderrIndex: 0,
            logIndex: 0,
            artifactIds: new Set<string>()
        };

        yield* this._emitSnapshot(runId, createResponse, state);

        let current = createResponse;
        let delay = this._options.pollInterval;

        while (!token.isCancellationRequested && !this._isTerminal(current.status)) {
            if (delay > 0) {
                await this._sleep(delay, token);
            }
            if (token.isCancellationRequested) {
                break;
            }
            current = await this._fetchRun(runId, token);
            const hadProgress = this._hasProgress(current, state);
            yield* this._emitSnapshot(runId, current, state);

            if (this._isTerminal(current.status)) {
                break;
            }
            delay = hadProgress ? this._options.pollInterval : Math.min(delay * 2, this._options.maxPollInterval);
        }

        if (token.isCancellationRequested) {
            throw new CompilerServiceError('cancelled', 'Execution was cancelled.', undefined, undefined, runId);
        }

        if (current.status === 'failed') {
            const errorPayload = toErrorResponse((current.error ?? createResponse.error));
            throw new CompilerServiceError('failed-run', errorPayload?.message ?? 'The compiler reported a failure.', undefined, errorPayload?.details, runId);
        }

        yield {
            type: 'result',
            runId,
            status: current.status,
            exitCode: current.exitCode,
            durationMs: current.durationMs
        };
    }

    async cancel(runId: string): Promise<void> {
        if (!this._options.endpoint) {
            return;
        }

        try {
            await this._request<void>(`/runs/${encodeURIComponent(runId)}/cancel`, { method: 'POST' }, CancellationToken.None, runId);
        } catch (error) {
            if (error instanceof CompilerServiceError && (error.code === 'http' || error.code === 'network' || error.code === 'timeout')) {
                // Swallow cancellation failures, but surface unexpected ones.
                return;
            }
            throw error;
        }
    }

    private _hasProgress(snapshot: CompilerRunSnapshot, state: RunProgressState): boolean {
        const stdoutLength = Array.isArray(snapshot.stdout) ? snapshot.stdout.length : 0;
        if (stdoutLength > state.stdoutIndex) {
            return true;
        }
        const stderrLength = Array.isArray(snapshot.stderr) ? snapshot.stderr.length : 0;
        if (stderrLength > state.stderrIndex) {
            return true;
        }
        const logLength = Array.isArray(snapshot.logs) ? snapshot.logs.length : 0;
        if (logLength > state.logIndex) {
            return true;
        }
        if (Array.isArray(snapshot.artifacts)) {
            for (let idx = 0; idx < snapshot.artifacts.length; idx++) {
                const artifact = toArtifact(snapshot.artifacts[idx], `${idx}`);
                if (artifact && !state.artifactIds.has(artifact.id ?? `${idx}`)) {
                    return true;
                }
            }
        }
        return snapshot.status !== state.lastStatus;
    }

    private *_emitSnapshot(runId: string, snapshot: CompilerRunSnapshot, state: RunProgressState): Generator<CompilerStreamEvent> {
        if (snapshot.status !== state.lastStatus) {
            state.lastStatus = snapshot.status;
            yield { type: 'status', runId, status: snapshot.status };
        }

        const stdout = Array.isArray(snapshot.stdout) ? snapshot.stdout : [];
        for (let i = state.stdoutIndex; i < stdout.length; i++) {
            const text = toText(stdout[i]);
            if (typeof text === 'string' && text.length) {
                yield { type: 'stdout', runId, text: this._limitChunk(text), sequence: i };
            }
        }
        state.stdoutIndex = stdout.length;

        const stderr = Array.isArray(snapshot.stderr) ? snapshot.stderr : [];
        for (let i = state.stderrIndex; i < stderr.length; i++) {
            const text = toText(stderr[i]);
            if (typeof text === 'string' && text.length) {
                yield { type: 'stderr', runId, text: this._limitChunk(text), sequence: i };
            }
        }
        state.stderrIndex = stderr.length;

        const logs = Array.isArray(snapshot.logs) ? snapshot.logs : [];
        for (let i = state.logIndex; i < logs.length; i++) {
            const message = toText(logs[i]);
            if (typeof message === 'string' && message.length) {
                yield { type: 'log', runId, level: toLogLevel(logs[i]), message: this._limitChunk(message), sequence: i };
            }
        }
        state.logIndex = logs.length;

        if (Array.isArray(snapshot.artifacts)) {
            for (let idx = 0; idx < snapshot.artifacts.length; idx++) {
                const artifact = toArtifact(snapshot.artifacts[idx], `${idx}`);
                if (!artifact) {
                    continue;
                }
                const key = artifact.id ?? `${idx}`;
                if (state.artifactIds.has(key)) {
                    continue;
                }
                state.artifactIds.add(key);
                yield { type: 'artifact', runId, artifact };
            }
        }
    }

    private _limitChunk(text: string): string {
        if (text.length <= MAX_STREAM_CHUNK) {
            return text;
        }
        return text.slice(0, MAX_STREAM_CHUNK);
    }

    private async _createRun(request: CompilerExecutionRequest, token: CancellationToken): Promise<CompilerRunSnapshot> {
        const payload = {
            language: request.language,
            code: request.code,
            stdin: request.stdin,
            files: request.files,
            arguments: request.arguments,
            metadata: request.metadata
        };

        const response = await this._request<CompilerRunSnapshot | { run?: CompilerRunSnapshot }>(
            '/runs',
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            },
            token
        );

        if (response && 'id' in response && typeof response.id === 'string') {
            return response;
        }

        if (response && typeof response === 'object' && 'run' in response && response.run && typeof (response as { run: CompilerRunSnapshot }).run.id === 'string') {
            return (response as { run: CompilerRunSnapshot }).run;
        }

        throw new CompilerServiceError('invalid-response', 'The compiler API returned an unexpected response structure.');
    }

    private async _fetchRun(runId: string, token: CancellationToken): Promise<CompilerRunSnapshot> {
        const response = await this._request<CompilerRunSnapshot>(`/runs/${encodeURIComponent(runId)}`, { method: 'GET' }, token, runId);
        if (!response || typeof response.id !== 'string') {
            throw new CompilerServiceError('invalid-response', 'The compiler API returned an incomplete run response.', undefined, undefined, runId);
        }
        return response;
    }

    private async _request<T>(path: string, init: RequestInit, token: CancellationToken, runId?: string): Promise<T> {
        if (!this._options.endpoint) {
            throw new CompilerServiceError('not-configured', 'Universal Compiler API endpoint is not configured.');
        }

        const url = new URL(path, this._options.endpoint).toString();
        const headers = { ...this._options.headers, ...(init.headers ?? {}) } as Record<string, string>;
        const controller = new AbortController();
        const abortRegistration = token.onCancellationRequested(() => controller.abort());

        let timedOut = false;
        const timer = setTimeout(() => {
            if (!controller.signal.aborted) {
                timedOut = true;
                controller.abort();
            }
        }, this._options.requestTimeout);

        try {
            const response = await fetch(url, { ...init, headers, signal: controller.signal });

            const text = await response.text();
            let payload: unknown = undefined;
            if (text) {
                try {
                    payload = JSON.parse(text);
                } catch (error) {
                    throw new CompilerServiceError('invalid-response', 'The compiler API returned malformed JSON.', response.status, text, runId);
                }
            }

            if (!response.ok) {
                const err = toErrorResponse(payload);
                throw new CompilerServiceError('http', err?.message ?? `Compiler API request failed with status ${response.status}.`, response.status, err?.details ?? payload, runId);
            }

            return payload as T;
        } catch (error) {
            if (((typeof DOMException !== 'undefined' && error instanceof DOMException) || error instanceof Error) && error.name === 'AbortError') {
                if (token.isCancellationRequested && !timedOut) {
                    throw new CompilerServiceError('cancelled', 'Request was cancelled.', undefined, undefined, runId);
                }
                if (timedOut) {
                    throw new CompilerServiceError('timeout', 'Compiler API request timed out.', undefined, undefined, runId);
                }
            }
            if (isCancellationError(error)) {
                throw new CompilerServiceError('cancelled', 'Request was cancelled.', undefined, undefined, runId);
            }
            if (error instanceof CompilerServiceError) {
                throw error;
            }
            throw new CompilerServiceError('network', error instanceof Error ? error.message : 'A network error occurred while contacting the compiler service.', undefined, undefined, runId);
        } finally {
            clearTimeout(timer);
            abortRegistration.dispose();
        }
    }

    private async _sleep(delay: number, token: CancellationToken): Promise<void> {
        if (delay <= 0) {
            return;
        }

        await new Promise<void>((resolve) => {
            const handle = setTimeout(() => {
                subscription.dispose();
                resolve();
            }, delay);
            const subscription = token.onCancellationRequested(() => {
                clearTimeout(handle);
                subscription.dispose();
                resolve();
            });
        });
    }

    private _isTerminal(status: CompilerRunStatus): boolean {
        return status === 'succeeded' || status === 'failed' || status === 'cancelled' || status === 'timeout';
    }

    // Public helper for converting artifact payloads into binary VSBuffer instances.
    static toVSBuffer(artifact: CompilerArtifact): VSBuffer {
        const encoding = artifact.encoding ?? 'base64';
        if (encoding === 'base64') {
            return decodeBase64(artifact.data);
        }
        if (encoding === 'utf-8') {
            return VSBuffer.fromString(artifact.data);
        }
        if (encoding === 'hex') {
            try {
                return decodeHex(artifact.data);
            } catch {
                return VSBuffer.fromString(artifact.data);
            }
        }
        try {
            return decodeBase64(artifact.data);
        } catch {
            return VSBuffer.fromString(artifact.data);
        }
    }

    static toTextBuffer(text: string): VSBuffer {
        return VSBuffer.fromString(text);
    }

    static readonly StreamMime = Mimes.text;
}
