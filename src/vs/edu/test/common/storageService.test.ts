/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { VSBuffer } from '../../../base/common/buffer.js';
import { Emitter } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import { CellKind, NotebookCellsChangeType, NotebookTextModelChangedEvent, TransientOptions, IOutputDto, IOutputItemDto } from '../../../workbench/contrib/notebook/common/notebookCommon.js';
import { EduStorageService, InMemoryFirestoreClient, InMemoryNotebookCache, OfflineError, IFirestoreClient, PersistableNotebookModel, PersistableNotebookCell, MCQAnswerSnapshot } from '../../common/services/storageService.js';

suite('EduStorageService', () => {

    test('persists notebooks to firestore and cache', async () => {
        const clock = fakeClock();
        const firestore = new InMemoryFirestoreClient();
        const cache = new InMemoryNotebookCache();
        const service = new EduStorageService(firestore, cache, clock.now.bind(clock));

        const model = new TestNotebookModel('test://notebook/persist', clock);
        const binding = service.registerNotebookModel(model);
        await binding.restoreComplete;

        model.updateCellContent(0, 'print("hello")');
        model.fireContentChange(NotebookCellsChangeType.ChangeCellContent);
        await binding.flush();

        const notebookId = service.resolveNotebookId(model.uri);
        const remote = await firestore.getNotebook('anonymous', notebookId);
        assert.ok(remote);
        assert.strictEqual(remote?.cells.length, 1);
        assert.strictEqual(remote?.cells[0].content, 'print("hello")');

        const cached = await cache.readNotebook('anonymous', notebookId);
        assert.ok(cached);
        assert.strictEqual(cached?.cells[0].content, 'print("hello")');
    });

    test('restores from local cache when firestore is offline', async () => {
        const clock = fakeClock();
        const firestore = new InMemoryFirestoreClient();
        const cache = new InMemoryNotebookCache();
        const initialService = new EduStorageService(firestore, cache, clock.now.bind(clock));
        const initialModel = new TestNotebookModel('test://notebook/cache', clock);
        const initialBinding = initialService.registerNotebookModel(initialModel);
        await initialBinding.restoreComplete;
        initialModel.updateCellContent(0, 'cached data');
        initialModel.fireContentChange(NotebookCellsChangeType.ChangeCellContent);
        await initialBinding.flush();

        // Simulate offline by using a firestore client that always throws OfflineError
        const offlineFirestore = new (class implements IFirestoreClient {
            async getNotebook(): Promise<never> { throw new OfflineError(); }
            async saveNotebook(): Promise<never> { throw new OfflineError(); }
            async getLessonProgress(): Promise<never> { throw new OfflineError(); }
            async saveLessonProgress(): Promise<never> { throw new OfflineError(); }
            async getSession(): Promise<never> { throw new OfflineError(); }
            async saveSession(): Promise<never> { throw new OfflineError(); }
            async deletePendingSnapshot(): Promise<void> { return; }
        })();

        const offlineService = new EduStorageService(offlineFirestore, cache, clock.now.bind(clock));
        const offlineModel = new TestNotebookModel('test://notebook/cache', clock);
        const binding = offlineService.registerNotebookModel(offlineModel);
        const result = await binding.restoreComplete;
        assert.strictEqual(result.source, 'localCache');
        assert.strictEqual(offlineModel.cells[0].getValue(), 'cached data');
    });

    test('merges conflicts by preferring latest updates', async () => {
        const clock = fakeClock();
        const firestore = new InMemoryFirestoreClient();
        const cache = new InMemoryNotebookCache();
        const service = new EduStorageService(firestore, cache, clock.now.bind(clock));

        const model = new TestNotebookModel('test://notebook/conflict', clock);
        const binding = service.registerNotebookModel(model);
        await binding.restoreComplete;

        // Initial save
        model.updateCellContent(0, 'local 1');
        model.fireContentChange(NotebookCellsChangeType.ChangeCellContent);
        await binding.flush();

        const notebookId = service.resolveNotebookId(model.uri);
        const remoteInitial = await firestore.getNotebook('anonymous', notebookId);
        assert.strictEqual(remoteInitial?.cells[0].content, 'local 1');

        // Simulate remote change occurring elsewhere
        await firestore.saveNotebook({
            ...remoteInitial!,
            cells: remoteInitial!.cells.map(cell => ({ ...cell, content: 'remote change', lastModified: clock.now() })),
            version: remoteInitial!.version + 1,
            updatedAt: clock.now()
        });

        // Apply local change with newer timestamp
        model.updateCellContent(0, 'local 2');
        model.fireContentChange(NotebookCellsChangeType.ChangeCellContent);
        await binding.flush();

        const remoteMerged = await firestore.getNotebook('anonymous', notebookId);
        assert.strictEqual(remoteMerged?.cells[0].content, 'local 2');
    });

    test('records mcq answers and transcripts', async () => {
        const clock = fakeClock();
        const firestore = new InMemoryFirestoreClient();
        const cache = new InMemoryNotebookCache();
        const service = new EduStorageService(firestore, cache, clock.now.bind(clock));

        const model = new TestNotebookModel('test://notebook/progress', clock);
        const binding = service.registerNotebookModel(model);
        await binding.restoreComplete;

        const answer: MCQAnswerSnapshot = {
            questionId: 'q1',
            selectedOptionIds: ['a'],
            updatedAt: clock.now(),
            confidence: 0.9
        };

        await service.recordMCQAnswer(model.uri, answer);
        await service.appendTranscriptMessage(model.uri, { id: 'm1', role: 'assistant', text: 'Hello!', timestamp: clock.now() });
        await binding.flush();

        const notebookId = service.resolveNotebookId(model.uri);
        const remote = await firestore.getNotebook('anonymous', notebookId);
        assert.deepStrictEqual(remote?.mcqAnswers.q1, answer);
        assert.strictEqual(remote?.transcripts.length, 1);
        assert.strictEqual(remote?.transcripts[0].text, 'Hello!');
    });
});

function fakeClock() {
    let current = 1;
    return {
        now(): number {
            return ++current;
        }
    };
}

class TestNotebookCellOutput {
    constructor(
        readonly outputId: string,
        readonly items: readonly IOutputItemDto[] = [],
        readonly metadata?: unknown
    ) { }

    asDto(): IOutputDto {
        return {
            outputId: this.outputId,
            outputs: [...this.items],
            metadata: this.metadata as Record<string, any> | undefined
        };
    }

    get outputs(): readonly IOutputItemDto[] {
        return this.items;
    }
}

class TestNotebookCell implements PersistableNotebookCell {
    readonly uri: URI;
    readonly outputs: readonly TestNotebookCellOutput[];

    constructor(
        readonly handle: number,
        private value: string,
        readonly cellKind: CellKind,
        readonly language: string,
        readonly metadata: Record<string, any>,
        readonly internalMetadata: Record<string, any>,
        outputs: readonly TestNotebookCellOutput[]
    ) {
        this.uri = URI.parse(`test://cell/${handle}`);
        this.outputs = outputs;
    }

    get mime(): string | undefined {
        return undefined;
    }

    getValue(): string {
        return this.value;
    }

    setValue(value: string): void {
        this.value = value;
    }
}

class TestNotebookModel extends Disposable implements PersistableNotebookModel {
    readonly uri: URI;
    readonly viewType = 'edu-test-notebook';
    metadata: Record<string, any> = {};
    transientOptions: TransientOptions = {
        transientCellMetadata: {},
        transientDocumentMetadata: {},
        transientOutputs: false,
        cellContentMetadata: {}
    };

    private readonly _cells: TestNotebookCell[];
    private readonly _onDidChangeContent = new Emitter<NotebookTextModelChangedEvent>();
    readonly onDidChangeContent = this._onDidChangeContent.event;

    constructor(resource: string, private readonly clock: ReturnType<typeof fakeClock>) {
        super();
        this.uri = URI.parse(resource);
        this._cells = [new TestNotebookCell(1, 'initial', CellKind.Code, 'python', {}, {}, [
            new TestNotebookCellOutput('output-1', [{ mime: 'text/plain', data: VSBuffer.fromString('output') }])
        ])];
    }

    get cells(): readonly TestNotebookCell[] {
        return this._cells;
    }

    reset(cells: ICellDto2[], metadata: Record<string, any>, transientOptions: TransientOptions): void {
        this._cells.splice(0, this._cells.length, ...cells.map((cell, index) => {
            const outputItems = cell.outputs.map(output => new TestNotebookCellOutput(output.outputId, output.outputs));
            return new TestNotebookCell(index + 1, cell.source, cell.cellKind, cell.language, cell.metadata ?? {}, cell.internalMetadata ?? {}, outputItems);
        }));
        this.metadata = metadata;
        this.transientOptions = transientOptions;
    }

    updateCellContent(index: number, value: string): void {
        this._cells[index].setValue(value);
    }

    fireContentChange(kind: NotebookCellsChangeType): void {
        this._onDidChangeContent.fire({
            rawEvents: [{ kind, transient: false }],
            versionId: 1,
            synchronous: true,
            endSelectionState: undefined
        });
    }
}
