/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../base/common/event.js';
import { hash } from '../../../base/common/hash.js';
import { Disposable, DisposableStore, IDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { ThrottledDelayer } from '../../../base/common/async.js';
import { ResourceMap } from '../../../base/common/map.js';
import { URI } from '../../../base/common/uri.js';
import { VSBuffer, decodeBase64, encodeBase64 } from '../../../base/common/buffer.js';
import { createDecorator } from '../../../platform/instantiation/common/instantiation.js';
import { NotebookCellInternalMetadata, NotebookCellMetadata, NotebookCellsChangeType, NotebookDocumentMetadata, NotebookTextModelChangedEvent, TransientOptions, CellKind, IOutputDto, IOutputItemDto, ICellDto2 } from '../../../workbench/contrib/notebook/common/notebookCommon.js';

export const IEduStorageService = createDecorator<IEduStorageService>('eduStorageService');

export interface PersistableNotebookCell {
	readonly handle: number;
	readonly uri: URI;
	readonly cellKind: CellKind;
	readonly language: string;
	readonly mime: string | undefined;
	readonly metadata: NotebookCellMetadata;
	readonly internalMetadata: NotebookCellInternalMetadata;
	readonly outputs: readonly INotebookCellOutputLike[];
	getValue(): string;
}

interface INotebookCellOutputLike {
	readonly outputId?: string;
	readonly metadata?: unknown;
	readonly outputs?: readonly IOutputItemDto[];
	asDto?(): IOutputDto;
}

export interface PersistableNotebookModel {
	readonly uri: URI;
	readonly viewType: string;
	metadata: NotebookDocumentMetadata;
	readonly transientOptions: TransientOptions;
	readonly cells: readonly PersistableNotebookCell[];
	readonly onDidChangeContent: Event<NotebookTextModelChangedEvent>;
	reset(cells: ICellDto2[], metadata: NotebookDocumentMetadata, transientOptions: TransientOptions): void;
}

export interface TranscriptMessage {
	readonly id: string;
	readonly role: 'user' | 'assistant' | 'system';
	readonly text: string;
	readonly timestamp: number;
}

export interface MCQAnswerSnapshot {
	readonly questionId: string;
	readonly selectedOptionIds: readonly string[];
	readonly correctOptionIds?: readonly string[];
	readonly confidence?: number;
	readonly updatedAt: number;
}

export interface LessonProgressRecord {
	readonly userId: string;
	readonly lessonId: string;
	readonly completedCellIds: readonly string[];
	readonly masteredConceptIds: readonly string[];
	readonly mcqScores: Readonly<Record<string, number>>;
	readonly updatedAt: number;
}

export interface SerializedOutputItem {
	readonly mime: string;
	readonly data: string;
	readonly metadata?: unknown;
}

export interface SerializedCellOutput {
	readonly outputId?: string;
	readonly metadata?: unknown;
	readonly items: readonly SerializedOutputItem[];
}

export interface EduNotebookCellSnapshot {
	readonly id: string;
	readonly handle: number;
	readonly uri: string;
	readonly kind: CellKind;
	readonly language: string;
	readonly mime?: string;
	readonly content: string;
	readonly metadata?: NotebookCellMetadata;
	readonly internalMetadata?: NotebookCellInternalMetadata;
	readonly outputs: readonly SerializedCellOutput[];
	readonly lastModified: number;
}

export interface EduNotebookSnapshot {
	readonly userId: string;
	readonly notebookId: string;
	readonly notebookUri: string;
	readonly viewType: string;
	readonly metadata: NotebookDocumentMetadata;
	readonly transientOptions: TransientOptions;
	readonly cells: readonly EduNotebookCellSnapshot[];
	readonly transcripts: readonly TranscriptMessage[];
	readonly mcqAnswers: Readonly<Record<string, MCQAnswerSnapshot>>;
	readonly lessonProgress?: LessonProgressRecord;
	readonly version: number;
	readonly updatedAt: number;
	readonly pending?: boolean;
}

export interface NotebookPersistenceContext {
	readonly userId: string;
	readonly notebookId: string;
	readonly sessionId?: string;
}

export interface NotebookRestorationResult {
	readonly appliedRemote: boolean;
	readonly source: 'remote' | 'localCache' | 'empty';
}

export interface INotebookPersistenceBinding extends IDisposable {
	readonly context: NotebookPersistenceContext & { readonly notebookUri: URI; readonly viewType: string; readonly sessionId: string };
	readonly onDidPersist: Event<void>;
	readonly onDidDispose: Event<void>;
	readonly restoreComplete: Promise<NotebookRestorationResult>;
	flush(): Promise<void>;
	updateMCQAnswer(answer: MCQAnswerSnapshot): void;
	appendTranscript(message: TranscriptMessage): void;
}

export interface IEduStorageService {
	readonly _serviceBrand: undefined;
	readonly firestoreSchemaDocumentation: string;
	setActiveUser(userId: string | undefined): void;
	getActiveUser(): string;
	resolveNotebookId(resource: URI): string;
	registerNotebookModel(model: PersistableNotebookModel, context?: Partial<NotebookPersistenceContext>): INotebookPersistenceBinding;
	recordMCQAnswer(notebook: URI, answer: MCQAnswerSnapshot): Promise<void>;
	appendTranscriptMessage(notebook: URI, message: TranscriptMessage): Promise<void>;
	recordLessonProgress(progress: LessonProgressRecord): Promise<void>;
	restoreLastSession(userId?: string): Promise<NotebookSessionState | undefined>;
	flush(resource: URI): Promise<void>;
}

export interface NotebookSessionState {
	readonly userId: string;
	readonly notebookId: string;
	readonly notebookUri: string;
	readonly viewType: string;
	readonly sessionId: string;
	readonly lastOpened: number;
}

export interface IFirestoreClientSaveOptions {
	readonly expectedVersion?: number;
}

export interface IFirestoreClient {
	getNotebook(userId: string, notebookId: string): Promise<EduNotebookSnapshot | undefined>;
	saveNotebook(snapshot: EduNotebookSnapshot, options?: IFirestoreClientSaveOptions): Promise<EduNotebookSnapshot>;
	getLessonProgress(userId: string, lessonId: string): Promise<LessonProgressRecord | undefined>;
	saveLessonProgress(progress: LessonProgressRecord): Promise<void>;
	getSession(userId: string): Promise<NotebookSessionState | undefined>;
	saveSession(session: NotebookSessionState): Promise<void>;
	deletePendingSnapshot?(userId: string, notebookId: string): Promise<void>;
}

export interface ILocalNotebookCache {
	readNotebook(userId: string, notebookId: string): Promise<EduNotebookSnapshot | undefined>;
	writeNotebook(snapshot: EduNotebookSnapshot): Promise<void>;
	removeNotebook(userId: string, notebookId: string): Promise<void>;
	readSession(userId: string): Promise<NotebookSessionState | undefined>;
	writeSession(session: NotebookSessionState): Promise<void>;
	readLessonProgress(userId: string, lessonId: string): Promise<LessonProgressRecord | undefined>;
	writeLessonProgress(progress: LessonProgressRecord): Promise<void>;
	storePendingSnapshot(userId: string, notebookId: string, snapshot: EduNotebookSnapshot): Promise<void>;
	consumePendingSnapshots(userId: string): Promise<readonly EduNotebookSnapshot[]>;
}

export class ConflictError extends Error {
	constructor(message = 'conflict') {
		super(message);
		this.name = 'ConflictError';
	}
}

export class OfflineError extends Error {
	constructor(message = 'offline') {
		super(message);
		this.name = 'OfflineError';
	}
}

export function resolveNotebookIdentifier(uri: URI): string {
	return hash(uri.toString()).toString(16);
}

function deepClone<T>(value: T): T {
	return value === undefined ? value : JSON.parse(JSON.stringify(value));
}

function encodeBuffer(data: VSBuffer | Uint8Array): string {
	const buffer = data instanceof VSBuffer ? data : VSBuffer.wrap(data);
	return encodeBase64(buffer);
}

function decodeBuffer(data: string): VSBuffer {
	return decodeBase64(data);
}

export class EduStorageService extends Disposable implements IEduStorageService {
	readonly _serviceBrand: undefined;

	private readonly bindings = new ResourceMap<NotebookBinding>();
	private activeUserId = 'anonymous';

	constructor(
		private readonly firestore: IFirestoreClient,
		private readonly cache: ILocalNotebookCache,
		private readonly clock: () => number = () => Date.now(),
		private readonly persistDelay = 350
	) {
		super();
	}

	get firestoreSchemaDocumentation(): string {
		return FIRESTORE_SCHEMA_DOCUMENTATION;
	}

	setActiveUser(userId: string | undefined): void {
		this.activeUserId = userId || 'anonymous';
	}

	getActiveUser(): string {
		return this.activeUserId;
	}

	resolveNotebookId(resource: URI): string {
		return resolveNotebookIdentifier(resource);
	}

	registerNotebookModel(model: PersistableNotebookModel, context: Partial<NotebookPersistenceContext> = {}): INotebookPersistenceBinding {
		const existing = this.bindings.get(model.uri);
		if (existing) {
			return existing;
		}

		const userId = context.userId ?? this.activeUserId;
		const notebookId = context.notebookId ?? this.resolveNotebookId(model.uri);
		const sessionId = context.sessionId ?? `session-${Math.abs(hash(`${userId}:${notebookId}:${this.clock()}`))}`;
		const binding = new NotebookBinding(
			this.persistDelay,
			model,
			{ userId, notebookId, sessionId, notebookUri: model.uri, viewType: model.viewType },
			this.firestore,
			this.cache,
			this.clock
		);
		this.bindings.set(model.uri, binding);
		this._register(binding);
		binding.onDidDispose(() => this.bindings.delete(model.uri));
		binding.restoreComplete.catch(() => undefined);
		return binding;
	}

	async recordMCQAnswer(notebook: URI, answer: MCQAnswerSnapshot): Promise<void> {
		const binding = this.bindings.get(notebook);
		if (!binding) {
			throw new Error(`No persistence binding registered for ${notebook.toString()}`);
		}
		binding.updateMCQAnswer(answer);
	}

	async appendTranscriptMessage(notebook: URI, message: TranscriptMessage): Promise<void> {
		const binding = this.bindings.get(notebook);
		if (!binding) {
			throw new Error(`No persistence binding registered for ${notebook.toString()}`);
		}
		binding.appendTranscript(message);
	}

	async recordLessonProgress(progress: LessonProgressRecord): Promise<void> {
		await this.cache.writeLessonProgress(progress);
		try {
			await this.firestore.saveLessonProgress(progress);
		} catch (error) {
			if (!(error instanceof OfflineError)) {
				throw error;
			}
		}
	}

	async restoreLastSession(userId = this.activeUserId): Promise<NotebookSessionState | undefined> {
		const cached = await this.cache.readSession(userId);
		try {
			const remote = await this.firestore.getSession(userId);
			if (!remote) {
				return cached;
			}
			if (!cached || remote.lastOpened >= cached.lastOpened) {
				await this.cache.writeSession(remote);
				return remote;
			}
			return cached;
		} catch (error) {
			if (error instanceof OfflineError) {
				return cached;
			}
			throw error;
		}
	}

	async flush(resource: URI): Promise<void> {
		await this.bindings.get(resource)?.flush();
	}
}

class NotebookBinding extends Disposable implements INotebookPersistenceBinding {
	private readonly store = this._register(new DisposableStore());
	private readonly delayer: ThrottledDelayer<void>;
	private pendingPersist: Promise<void> | undefined;
	private transcripts: TranscriptMessage[] = [];
	private mcqAnswers = new Map<string, MCQAnswerSnapshot>();
	private version = 0;
	private lastSnapshot: EduNotebookSnapshot | undefined;
	private readonly _onDidPersist = this._register(new Emitter<void>());
	private readonly _onDidDispose = this._register(new Emitter<void>());

	readonly onDidPersist: Event<void> = this._onDidPersist.event;
	readonly onDidDispose: Event<void> = this._onDidDispose.event;
	readonly restoreComplete: Promise<NotebookRestorationResult>;

	constructor(
		persistDelay: number,
		private readonly model: PersistableNotebookModel,
		readonly context: NotebookPersistenceContext & { readonly notebookUri: URI; readonly viewType: string; readonly sessionId: string },
		private readonly firestore: IFirestoreClient,
		private readonly cache: ILocalNotebookCache,
		private readonly clock: () => number
	) {
		super();
		this.delayer = this._register(new ThrottledDelayer<void>(persistDelay));
		this.store.add(model.onDidChangeContent(e => this.handleModelChange(e)));
		this.store.add(toDisposable(() => {
			if (this.pendingPersist) {
				void this.pendingPersist;
			}
		}));
		this.restoreComplete = this.performRestore();
	}

	updateMCQAnswer(answer: MCQAnswerSnapshot): void {
		const existing = this.mcqAnswers.get(answer.questionId);
		if (!existing || existing.updatedAt <= answer.updatedAt) {
			this.mcqAnswers.set(answer.questionId, { ...answer });
			this.queuePersist();
		}
	}

	appendTranscript(message: TranscriptMessage): void {
		const filtered = this.transcripts.filter(m => m.id !== message.id);
		filtered.push({ ...message });
		filtered.sort((a, b) => a.timestamp - b.timestamp);
		this.transcripts = filtered;
		this.queuePersist();
	}

	flush(): Promise<void> {
		this.delayer.cancel();
		return this.ensurePersist();
	}

	dispose(): void {
		super.dispose();
		this.store.dispose();
		this._onDidDispose.fire();
	}

	private handleModelChange(event: NotebookTextModelChangedEvent): void {
		if (!event.rawEvents.some(ev => !ev.transient && this.isInterestingChange(ev.kind))) {
			return;
		}
		this.queuePersist();
	}

	private isInterestingChange(kind: NotebookCellsChangeType | undefined): boolean {
		switch (kind) {
			case NotebookCellsChangeType.ModelChange:
			case NotebookCellsChangeType.ChangeCellContent:
			case NotebookCellsChangeType.Move:
			case NotebookCellsChangeType.ChangeDocumentMetadata:
			case NotebookCellsChangeType.Metadata:
			case NotebookCellsChangeType.Output:
			case NotebookCellsChangeType.OutputItem:
			case NotebookCellsChangeType.ChangeCellLanguage:
				return true;
			default:
				return false;
		}
	}

	private queuePersist(): void {
		this.delayer.trigger(() => this.ensurePersist());
	}

	private ensurePersist(): Promise<void> {
		if (!this.pendingPersist) {
			this.pendingPersist = this.persistInternal().finally(() => {
				this.pendingPersist = undefined;
			});
		} else {
			this.pendingPersist = this.pendingPersist.then(() => this.persistInternal()).finally(() => {
				this.pendingPersist = undefined;
			});
		}
		return this.pendingPersist;
	}

	private async performRestore(): Promise<NotebookRestorationResult> {
		const { userId, notebookId } = this.context;
		const cachedPending = await this.cache.consumePendingSnapshots(userId);
		let cached = await this.cache.readNotebook(userId, notebookId);
		let remote: EduNotebookSnapshot | undefined;
		try {
			remote = await this.firestore.getNotebook(userId, notebookId);
		} catch (error) {
			if (!(error instanceof OfflineError)) {
				throw error;
			}
		}

		if (cachedPending.length && remote) {
			for (const pending of cachedPending) {
				try {
					await this.firestore.saveNotebook({ ...pending, pending: undefined }, { expectedVersion: pending.version - 1 });
				} catch (error) {
					if (error instanceof OfflineError) {
						await this.cache.storePendingSnapshot(userId, notebookId, pending);
						break;
					}
				}
			}
		}

		const snapshot = this.chooseSnapshot(remote, cached);
		if (snapshot) {
			this.applySnapshot(snapshot);
			return { appliedRemote: !!remote, source: remote ? 'remote' : 'localCache' };
		}
		return { appliedRemote: false, source: 'empty' };
	}

	private chooseSnapshot(remote?: EduNotebookSnapshot, cached?: EduNotebookSnapshot): EduNotebookSnapshot | undefined {
		if (remote && cached) {
			return remote.updatedAt >= cached.updatedAt ? remote : cached;
		}
		return remote ?? cached;
	}

	private applySnapshot(snapshot: EduNotebookSnapshot): void {
		this.version = snapshot.version;
		this.transcripts = snapshot.transcripts ? snapshot.transcripts.map(msg => ({ ...msg })) : [];
		this.mcqAnswers = new Map(Object.entries(snapshot.mcqAnswers ?? {}));
		this.lastSnapshot = snapshot;
		const cells = snapshot.cells.map(cell => this.toCellDto(cell));
		this.model.reset(cells, deepClone(snapshot.metadata), deepClone(snapshot.transientOptions));
	}

	private toCellDto(cell: EduNotebookCellSnapshot): ICellDto2 {
		return {
			cellKind: cell.kind,
			language: cell.language,
			mime: cell.mime,
			source: cell.content,
			metadata: deepClone(cell.metadata),
			internalMetadata: deepClone(cell.internalMetadata),
			outputs: cell.outputs.map(output => ({
				outputId: output.outputId ?? '',
				metadata: deepClone(output.metadata),
				outputs: output.items.map(item => ({
					mime: item.mime,
					data: decodeBuffer(item.data),
					metadata: deepClone(item.metadata)
				}))
			}))
		};
	}

	private captureSnapshot(): EduNotebookSnapshot {
		const now = this.clock();
		const cells = this.model.cells.map(cell => this.serializeCell(cell, now));
		return {
			userId: this.context.userId,
			notebookId: this.context.notebookId,
			notebookUri: this.context.notebookUri.toString(),
			viewType: this.context.viewType,
			metadata: deepClone(this.model.metadata),
			transientOptions: deepClone(this.model.transientOptions),
			cells,
			transcripts: this.transcripts.map(msg => ({ ...msg })),
			mcqAnswers: Object.fromEntries(this.mcqAnswers.entries()),
			lessonProgress: this.lastSnapshot?.lessonProgress,
			version: this.version + 1,
			updatedAt: now
		};
	}

	private serializeCell(cell: PersistableNotebookCell, timestamp: number): EduNotebookCellSnapshot {
		const outputs = cell.outputs.map(output => this.serializeOutput(output));
		return {
			id: this.resolveCellId(cell),
			handle: cell.handle,
			uri: cell.uri.toString(),
			kind: cell.cellKind,
			language: cell.language,
			mime: cell.mime,
			content: cell.getValue(),
			metadata: deepClone(cell.metadata),
			internalMetadata: deepClone(cell.internalMetadata),
			outputs,
			lastModified: timestamp
		};
	}

	private resolveCellId(cell: PersistableNotebookCell): string {
		const custom = (cell.metadata as any)?.custom;
		const eduId = custom?.eduCellId ?? custom?.edu?.id ?? custom?.id;
		return eduId ? String(eduId) : `${cell.uri.toString()}`;
	}

	private serializeOutput(output: INotebookCellOutputLike): SerializedCellOutput {
		const dto = typeof output.asDto === 'function'
			? output.asDto()
			: {
				outputId: output.outputId ?? '',
				metadata: output.metadata,
				outputs: output.outputs ?? []
			};
		return {
			outputId: dto.outputId,
			metadata: deepClone(dto.metadata),
			items: dto.outputs.map(item => this.serializeOutputItem(item))
		};
	}

	private serializeOutputItem(item: IOutputItemDto): SerializedOutputItem {
		return {
			mime: item.mime,
			data: encodeBuffer(item.data),
			metadata: deepClone((item as any).metadata)
		};
	}

	private async persistInternal(): Promise<void> {
		const snapshot = this.captureSnapshot();
		this.lastSnapshot = snapshot;
		await this.cache.writeNotebook(snapshot);
		try {
			const persisted = await this.firestore.saveNotebook(snapshot, { expectedVersion: this.version });
			this.version = persisted.version;
			this.lastSnapshot = persisted;
			await this.cache.writeNotebook(persisted);
			await this.firestore.deletePendingSnapshot?.(this.context.userId, this.context.notebookId);
			this._onDidPersist.fire();
		} catch (error) {
			if (error instanceof ConflictError) {
				await this.handleConflict(snapshot);
			} else if (error instanceof OfflineError) {
				await this.cache.storePendingSnapshot(this.context.userId, this.context.notebookId, { ...snapshot, pending: true });
			} else {
				throw error;
			}
		}
		await this.persistSession();
	}

	private async handleConflict(localSnapshot: EduNotebookSnapshot): Promise<void> {
		const remote = await this.firestore.getNotebook(this.context.userId, this.context.notebookId);
		if (!remote) {
			// If remote vanished, retry with local state.
			this.version = localSnapshot.version;
			await this.firestore.saveNotebook(localSnapshot);
			this._onDidPersist.fire();
			return;
		}

		const merged = this.mergeSnapshots(localSnapshot, remote);
		this.version = merged.version;
		this.lastSnapshot = merged;
		await this.cache.writeNotebook(merged);
		try {
			await this.firestore.saveNotebook(merged, { expectedVersion: remote.version });
			this._onDidPersist.fire();
		} catch (error) {
			if (error instanceof OfflineError) {
				await this.cache.storePendingSnapshot(this.context.userId, this.context.notebookId, { ...merged, pending: true });
			} else {
				throw error;
			}
		}
	}

	private mergeSnapshots(local: EduNotebookSnapshot, remote: EduNotebookSnapshot): EduNotebookSnapshot {
		const now = this.clock();
		const remoteMap = new Map(remote.cells.map(cell => [cell.id, cell]));
		const cells: EduNotebookCellSnapshot[] = [];
		const seen = new Set<string>();

		for (const cell of local.cells) {
			const remoteCell = remoteMap.get(cell.id);
			const chosen = !remoteCell || cell.lastModified >= remoteCell.lastModified ? cell : remoteCell;
			cells.push(chosen);
			seen.add(chosen.id);
		}

		for (const cell of remote.cells) {
			if (!seen.has(cell.id)) {
				cells.push(cell);
			}
		}

		const mergedTranscripts = this.mergeTranscriptArrays(local.transcripts, remote.transcripts);
		const mergedMcq = this.mergeMcqAnswers(local.mcqAnswers, remote.mcqAnswers);

		return {
			userId: this.context.userId,
			notebookId: this.context.notebookId,
			notebookUri: this.context.notebookUri.toString(),
			viewType: this.context.viewType,
			metadata: deepClone(local.updatedAt >= remote.updatedAt ? local.metadata : remote.metadata),
			transientOptions: deepClone(local.transientOptions),
			cells,
			transcripts: mergedTranscripts,
			mcqAnswers: mergedMcq,
			lessonProgress: local.lessonProgress ?? remote.lessonProgress,
			version: Math.max(local.version, remote.version) + 1,
			updatedAt: now
		};
	}

	private mergeTranscriptArrays(local: readonly TranscriptMessage[], remote: readonly TranscriptMessage[]): TranscriptMessage[] {
		const map = new Map<string, TranscriptMessage>();
		for (const msg of remote) {
			map.set(msg.id, { ...msg });
		}
		for (const msg of local) {
			const existing = map.get(msg.id);
			if (!existing || existing.timestamp <= msg.timestamp) {
				map.set(msg.id, { ...msg });
			}
		}
		return Array.from(map.values()).sort((a, b) => a.timestamp - b.timestamp);
	}

	private mergeMcqAnswers(local: Readonly<Record<string, MCQAnswerSnapshot>>, remote: Readonly<Record<string, MCQAnswerSnapshot>>): Readonly<Record<string, MCQAnswerSnapshot>> {
		const map = new Map<string, MCQAnswerSnapshot>();
		for (const [id, answer] of Object.entries(remote ?? {})) {
			map.set(id, { ...answer });
		}
		for (const [id, answer] of Object.entries(local ?? {})) {
			const existing = map.get(id);
			if (!existing || existing.updatedAt <= answer.updatedAt) {
				map.set(id, { ...answer });
			}
		}
		return Object.fromEntries(map.entries());
	}

	private async persistSession(): Promise<void> {
		const session: NotebookSessionState = {
			userId: this.context.userId,
			notebookId: this.context.notebookId,
			notebookUri: this.context.notebookUri.toString(),
			viewType: this.context.viewType,
			sessionId: this.context.sessionId,
			lastOpened: this.clock()
		};
		await this.cache.writeSession(session);
		try {
			await this.firestore.saveSession(session);
		} catch (error) {
			if (!(error instanceof OfflineError)) {
				throw error;
			}
		}
	}
}

export class InMemoryFirestoreClient implements IFirestoreClient {
	private readonly notebooks = new Map<string, EduNotebookSnapshot>();
	private readonly sessions = new Map<string, NotebookSessionState>();
	private readonly lessons = new Map<string, LessonProgressRecord>();

	async getNotebook(userId: string, notebookId: string): Promise<EduNotebookSnapshot | undefined> {
		const snapshot = this.notebooks.get(this.key(userId, notebookId));
		return snapshot ? deepClone(snapshot) : undefined;
	}

	async saveNotebook(snapshot: EduNotebookSnapshot, options?: IFirestoreClientSaveOptions): Promise<EduNotebookSnapshot> {
		const key = this.key(snapshot.userId, snapshot.notebookId);
		const current = this.notebooks.get(key);
		if (current && options?.expectedVersion !== undefined && current.version !== options.expectedVersion) {
			throw new ConflictError();
		}
		const stored = deepClone(snapshot);
		this.notebooks.set(key, stored);
		return deepClone(stored);
	}

	async getLessonProgress(userId: string, lessonId: string): Promise<LessonProgressRecord | undefined> {
		return deepClone(this.lessons.get(this.lessonKey(userId, lessonId)));
	}

	async saveLessonProgress(progress: LessonProgressRecord): Promise<void> {
		this.lessons.set(this.lessonKey(progress.userId, progress.lessonId), deepClone(progress));
	}

	async getSession(userId: string): Promise<NotebookSessionState | undefined> {
		return deepClone(this.sessions.get(userId));
	}

	async saveSession(session: NotebookSessionState): Promise<void> {
		this.sessions.set(session.userId, deepClone(session));
	}

	async deletePendingSnapshot(): Promise<void> {
		// No-op for in-memory implementation.
	}

	private key(userId: string, notebookId: string): string {
		return `${userId}::${notebookId}`;
	}

	private lessonKey(userId: string, lessonId: string): string {
		return `${userId}::${lessonId}`;
	}
}

export class InMemoryNotebookCache implements ILocalNotebookCache {
	private readonly notebooks = new Map<string, EduNotebookSnapshot>();
	private readonly sessions = new Map<string, NotebookSessionState>();
	private readonly lessons = new Map<string, LessonProgressRecord>();
	private readonly pending = new Map<string, EduNotebookSnapshot[]>();

	async readNotebook(userId: string, notebookId: string): Promise<EduNotebookSnapshot | undefined> {
		return deepClone(this.notebooks.get(this.key(userId, notebookId)));
	}

	async writeNotebook(snapshot: EduNotebookSnapshot): Promise<void> {
		this.notebooks.set(this.key(snapshot.userId, snapshot.notebookId), deepClone(snapshot));
	}

	async removeNotebook(userId: string, notebookId: string): Promise<void> {
		this.notebooks.delete(this.key(userId, notebookId));
	}

	async readSession(userId: string): Promise<NotebookSessionState | undefined> {
		return deepClone(this.sessions.get(userId));
	}

	async writeSession(session: NotebookSessionState): Promise<void> {
		this.sessions.set(session.userId, deepClone(session));
	}

	async readLessonProgress(userId: string, lessonId: string): Promise<LessonProgressRecord | undefined> {
		return deepClone(this.lessons.get(this.lessonKey(userId, lessonId)));
	}

	async writeLessonProgress(progress: LessonProgressRecord): Promise<void> {
		this.lessons.set(this.lessonKey(progress.userId, progress.lessonId), deepClone(progress));
	}

	async storePendingSnapshot(userId: string, notebookId: string, snapshot: EduNotebookSnapshot): Promise<void> {
		const key = this.key(userId, notebookId);
		const list = this.pending.get(key) ?? [];
		list.push(deepClone(snapshot));
		this.pending.set(key, list);
	}

	async consumePendingSnapshots(userId: string): Promise<readonly EduNotebookSnapshot[]> {
		const prefix = `${userId}::`;
		const result: EduNotebookSnapshot[] = [];
		for (const [key, value] of Array.from(this.pending.entries())) {
			if (key.startsWith(prefix)) {
				result.push(...value.map(item => deepClone(item)));
				this.pending.delete(key);
			}
		}
		return result;
	}

	private key(userId: string, notebookId: string): string {
		return `${userId}::${notebookId}`;
	}

	private lessonKey(userId: string, lessonId: string): string {
		return `${userId}::${lessonId}`;
	}
}

export class BrowserNotebookCache extends InMemoryNotebookCache {
	private readonly storage: Storage | undefined;

	constructor(storage: Storage | undefined = typeof globalThis !== 'undefined' ? (globalThis as any).localStorage : undefined) {
		super();
		this.storage = storage;
	}

	override async writeNotebook(snapshot: EduNotebookSnapshot): Promise<void> {
		super.writeNotebook(snapshot);
		if (!this.storage) {
			return;
		}
		try {
			this.storage.setItem(this.notebookKey(snapshot.userId, snapshot.notebookId), JSON.stringify(snapshot));
		} catch { /* ignore quota errors */ }
	}

	override async readNotebook(userId: string, notebookId: string): Promise<EduNotebookSnapshot | undefined> {
		const inMemory = await super.readNotebook(userId, notebookId);
		if (inMemory) {
			return inMemory;
		}
		if (!this.storage) {
			return undefined;
		}
		const raw = this.storage.getItem(this.notebookKey(userId, notebookId));
		if (!raw) {
			return undefined;
		}
		try {
			const parsed = JSON.parse(raw) as EduNotebookSnapshot;
			super.writeNotebook(parsed);
			return deepClone(parsed);
		} catch {
			return undefined;
		}
	}

	override async writeSession(session: NotebookSessionState): Promise<void> {
		super.writeSession(session);
		if (!this.storage) {
			return;
		}
		try {
			this.storage.setItem(this.sessionKey(session.userId), JSON.stringify(session));
		} catch { /* ignore */ }
	}

	override async readSession(userId: string): Promise<NotebookSessionState | undefined> {
		const fromMemory = await super.readSession(userId);
		if (fromMemory) {
			return fromMemory;
		}
		if (!this.storage) {
			return undefined;
		}
		const raw = this.storage.getItem(this.sessionKey(userId));
		if (!raw) {
			return undefined;
		}
		try {
			const parsed = JSON.parse(raw) as NotebookSessionState;
			super.writeSession(parsed);
			return deepClone(parsed);
		} catch {
			return undefined;
		}
	}

	private notebookKey(userId: string, notebookId: string): string {
		return `vscode.edu.notebook.${userId}.${notebookId}`;
	}

	private sessionKey(userId: string): string {
		return `vscode.edu.session.${userId}`;
	}
}

export const FIRESTORE_SCHEMA_DOCUMENTATION = `Collections
-------------
users/{userId}
  notebooks/{notebookId}
    - version: number
    - updatedAt: number
    - viewType: string
    - notebookUri: string
    - metadata: map
    - transientOptions: map
    - cells: array<{
        id: string
        handle: number
        uri: string
        kind: number
        language: string
        mime: string
        content: string
        metadata: map
        internalMetadata: map
        outputs: array<{
          outputId: string
          metadata: map
          items: array<{ mime: string; data: base64; metadata: map }>
        }>
        lastModified: number
      }>
    - transcripts: array<{ id: string; role: string; text: string; timestamp: number }>
    - mcqAnswers: map<{ questionId: { selectedOptionIds: array<string>; correctOptionIds: array<string>; confidence: number; updatedAt: number } }>
    - lessonProgress: map

Security rules (recommended)
---------------------------
match /databases/{database}/documents {
  match /users/{userId}/{document=**} {
    allow read, write: if request.auth != null && request.auth.uid == userId;
  }
}

Indexes
-------
- Composite index on collection group notebooks for fields (userId asc, updatedAt desc) to efficiently query recent notebooks.
- Composite index on collection group lessonProgress for fields (userId asc, lessonId asc).
`;
