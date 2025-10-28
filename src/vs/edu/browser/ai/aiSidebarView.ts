/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/aiSidebar.css';

import { localize } from '../../../nls.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { IViewPaneOptions, ViewPane } from '../../../workbench/browser/parts/views/viewPane.js';
import { IAiService, IAiContextItem } from '../../common/services/aiService.js';
import { AiContextSource, AiSidebar, IAiContextDelegate, InMemoryAiConversationStore } from './aiSidebar.js';
import { IEditorService } from '../../../workbench/services/editor/common/editorService.js';
import { getNotebookEditorFromEditorPane, INotebookEditor } from '../../../workbench/contrib/notebook/browser/notebookBrowser.js';
import { NotebookTextModel } from '../../../workbench/contrib/notebook/common/model/notebookTextModel.js';
import { ICellOutput } from '../../../workbench/contrib/notebook/common/notebookCommon.js';
import { ITextModel } from '../../../editor/common/model.js';
import { IKeybindingService } from '../../../platform/keybinding/common/keybinding.js';
import { IContextMenuService } from '../../../platform/contextview/browser/contextView.js';
import { IConfigurationService } from '../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../platform/contextkey/common/contextkey.js';
import { IViewDescriptorService } from '../../../workbench/common/views.js';
import { IInstantiationService } from '../../../platform/instantiation/common/instantiation.js';
import { IOpenerService } from '../../../platform/opener/common/opener.js';
import { IThemeService } from '../../../platform/theme/common/themeService.js';
import { IHoverService } from '../../../platform/hover/browser/hover.js';

class NotebookContextDelegate extends Disposable implements IAiContextDelegate {
    private editor: INotebookEditor | undefined;

    setEditor(editor: INotebookEditor | undefined): void {
        this.editor = editor;
    }

    override dispose(): void {
        super.dispose();
        this.editor = undefined;
    }

    async resolve(source: AiContextSource): Promise<IAiContextItem | undefined> {
        const editor = this.editor;
        if (!editor) {
            return undefined;
        }

        switch (source) {
            case 'selection':
                return this.resolveSelection(editor);
            case 'currentCell':
                return this.resolveCurrentCell(editor);
            case 'outputs':
                return this.resolveOutputs(editor);
            case 'notebook':
                return this.resolveNotebook(editor.textModel);
            default:
                return undefined;
        }
    }

    private async resolveSelection(editor: INotebookEditor): Promise<IAiContextItem | undefined> {
        const cell = editor.getActiveCell();
        if (!cell) {
            return undefined;
        }

        const selections = cell.getSelections();
        if (!selections || selections.length === 0) {
            return undefined;
        }

        const primary = selections[0];
        if (primary.isEmpty()) {
            return undefined;
        }

        const textModel = await this.ensureTextModel(cell.textModel, cell.resolveTextModel.bind(cell));
        if (!textModel) {
            return undefined;
        }

        const value = textModel.getValueInRange(primary);
        if (!value.trim()) {
            return undefined;
        }

        return {
            type: 'selection',
            label: localize('edu.ai.context.selection', "Selection"),
            value
        };
    }

    private async resolveCurrentCell(editor: INotebookEditor): Promise<IAiContextItem | undefined> {
        const cell = editor.getActiveCell();
        if (!cell) {
            return undefined;
        }

        const value = cell.getText();
        if (!value.trim()) {
            return undefined;
        }

        return {
            type: 'cell',
            label: localize('edu.ai.context.currentCell', "Current cell"),
            value
        };
    }

    private resolveOutputs(editor: INotebookEditor): IAiContextItem | undefined {
        const cell = editor.getActiveCell();
        if (!cell) {
            return undefined;
        }

        const outputs = cell.model.outputs;
        if (!outputs.length) {
            return undefined;
        }

        const rendered = this.stringifyOutputs(outputs);
        if (!rendered.trim()) {
            return undefined;
        }

        return {
            type: 'outputs',
            label: localize('edu.ai.context.outputs', "Cell outputs"),
            value: rendered
        };
    }

    private resolveNotebook(model: NotebookTextModel | undefined): IAiContextItem | undefined {
        if (!model) {
            return undefined;
        }
        const text = model.cells.map(cell => cell.getValue()).join('\n\n');
        if (!text.trim()) {
            return undefined;
        }
        return {
            type: 'notebook',
            label: localize('edu.ai.context.notebook', "Notebook"),
            value: text
        };
    }

    private async ensureTextModel(current: ITextModel | undefined, resolver: () => Promise<ITextModel>): Promise<ITextModel | undefined> {
        if (current) {
            return current;
        }
        try {
            return await resolver();
        } catch {
            return undefined;
        }
    }

    private stringifyOutputs(outputs: readonly ICellOutput[]): string {
        return outputs.map((output, index) => {
            const header = localize('edu.ai.context.output.header', "Output {0}", index + 1);
            const parts = output.outputs.map(item => `${item.mime}\n${item.data.toString()}`).join('\n');
            return `${header}\n${parts}`;
        }).join('\n\n');
    }
}

export class AiSidebarView extends ViewPane {
    static readonly ID = 'workbench.view.edu.aiSidebar';

    private sidebar: AiSidebar | undefined;
    private readonly conversationStore = new InMemoryAiConversationStore();
    private readonly contextDelegate = this._register(new NotebookContextDelegate());

    constructor(
        options: IViewPaneOptions,
        @IAiService private readonly aiService: IAiService,
        @IEditorService private readonly editorService: IEditorService,
        @IKeybindingService keybindingService: IKeybindingService,
        @IContextMenuService contextMenuService: IContextMenuService,
        @IConfigurationService configurationService: IConfigurationService,
        @IContextKeyService contextKeyService: IContextKeyService,
        @IViewDescriptorService viewDescriptorService: IViewDescriptorService,
        @IInstantiationService instantiationService: IInstantiationService,
        @IOpenerService openerService: IOpenerService,
        @IThemeService themeService: IThemeService,
        @IHoverService hoverService: IHoverService
    ) {
        super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);

        this._register(this.editorService.onDidActiveEditorChange(() => this.updateContext()));
    }

    protected override renderBody(container: HTMLElement): void {
        super.renderBody(container);
        container.classList.add('edu-ai-sidebar__body');

        this.sidebar = this._register(new AiSidebar({
            container,
            aiService: this.aiService,
            conversationStore: this.conversationStore,
            contextDelegate: this.contextDelegate,
            sessionId: this.resolveSessionIdentifier()
        }));

        this.updateContext();
    }

    protected override layoutBody(height: number, width: number): void {
        super.layoutBody(height, width);
    }

    override focus(): void {
        super.focus();
        const composer = this.element?.querySelector<HTMLTextAreaElement>('textarea.edu-ai-sidebar__input');
        composer?.focus();
    }

    private updateContext(): void {
        const notebookEditor = this.getActiveNotebookEditor();
        this.contextDelegate.setEditor(notebookEditor);
        if (!this.sidebar) {
            return;
        }
        void this.sidebar.setSession(this.resolveSessionIdentifier());
    }

    private getActiveNotebookEditor(): INotebookEditor | undefined {
        return getNotebookEditorFromEditorPane(this.editorService.activeEditorPane);
    }

    private resolveSessionIdentifier(): string {
        const notebookEditor = this.getActiveNotebookEditor();
        const model = notebookEditor?.textModel;
        return model ? `notebook:${model.uri.toString()}` : 'notebook:global';
    }
}
