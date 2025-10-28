/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { registerWorkbenchContribution2, WorkbenchPhase, IWorkbenchContribution } from '../../../common/contributions.js';
import { NotebookTextModel } from '../common/model/notebookTextModel.js';
import { INotebookService } from '../common/notebookService.js';
import { IEduStorageService } from '../../../../edu/common/services/storageService.js';

class NotebookEduPersistenceContribution extends Disposable implements IWorkbenchContribution {

    static readonly ID = 'workbench.notebookEduPersistence';

    private readonly bindings = new ResourceMap<DisposableStore>();

    constructor(
        @INotebookService private readonly notebookService: INotebookService,
        @IEduStorageService private readonly storageService: IEduStorageService
    ) {
        super();

        for (const notebook of this.notebookService.listNotebookDocuments()) {
            this.attachNotebook(notebook);
        }

        this._register(this.notebookService.onDidAddNotebookDocument(model => this.attachNotebook(model)));
        this._register(this.notebookService.onWillRemoveNotebookDocument(model => this.detachNotebook(model)));
    }

    private attachNotebook(model: NotebookTextModel): void {
        if (this.bindings.has(model.uri)) {
            return;
        }

        const binding = this.storageService.registerNotebookModel(model);
        const disposables = new DisposableStore();
        disposables.add(binding);
        disposables.add(toDisposable(() => {
            void binding.flush();
        }));
        disposables.add(binding.onDidDispose(() => this.bindings.delete(model.uri)));
        this.bindings.set(model.uri, disposables);
    }

    private detachNotebook(model: NotebookTextModel): void {
        const disposables = this.bindings.get(model.uri);
        if (disposables) {
            void this.storageService.flush(model.uri);
            disposables.dispose();
            this.bindings.delete(model.uri);
        }
    }
}

registerWorkbenchContribution2(NotebookEduPersistenceContribution.ID, NotebookEduPersistenceContribution, WorkbenchPhase.AfterRestored);
