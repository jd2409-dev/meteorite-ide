/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '../../media/notebookLearning.css';

import * as DOM from '../../../../../base/browser/dom.js';
import { onUnexpectedError } from '../../../../../base/common/errors.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { INotebookEditor, INotebookEditorContribution, INotebookViewZone, ICellViewModel } from '../../notebookBrowser.js';
import { registerNotebookContribution } from '../../notebookEditorExtensions.js';
import { LearningLesson, LearningMCQEntry, LearningHintEntry, collectHintsByMcq, isLearningMCQEntry, parseLearningLesson, LEARNING_CELL_ID_KEY, LEARNING_LESSON_METADATA_KEY, LearningLessonValidationError } from '../../../../edu/common/learningContent.js';
import { LearningProgressContext } from '../../../../edu/browser/components/learning/learningProgressContext.js';
import { MCQComponent } from '../../../../edu/browser/components/learning/mcqComponent.js';

interface LearningZoneHandle {
    readonly zone: INotebookViewZone;
    readonly component: MCQComponent;
    readonly dispose: () => void;
}

export class NotebookLearningTimelineContribution extends Disposable implements INotebookEditorContribution {
    static readonly id = 'workbench.notebook.learningTimeline';

    private readonly progressContext = new LearningProgressContext();
    private readonly zoneHandles = new Map<string, LearningZoneHandle>();
    private lesson: LearningLesson | undefined;

    constructor(private readonly editor: INotebookEditor) {
        super();
        this._register(this.progressContext);
        this._register(this.editor.onDidChangeModel(() => this.refreshFromMetadata()));
        this._register(this.editor.onDidAttachViewModel(() => this.renderLessonZones()));
        this._register(this.editor.onDidChangeViewCells(() => this.renderLessonZones()));
        this._register(this.editor.onDidChangeLayout(() => this.remeasureAllZones()));

        this.refreshFromMetadata();
    }

    private refreshFromMetadata(): void {
        const lesson = this.readLessonFromMetadata();
        const isSameLesson = lesson && this.lesson && lesson.id === this.lesson.id;
        if (!isSameLesson) {
            this.progressContext.reset();
        }
        this.lesson = lesson;
        this.renderLessonZones();
    }

    private readLessonFromMetadata(): LearningLesson | undefined {
        const model = this.editor.textModel;
        if (!model) {
            return undefined;
        }
        const candidate = model.metadata?.[LEARNING_LESSON_METADATA_KEY];
        if (!candidate) {
            return undefined;
        }
        try {
            return parseLearningLesson(candidate);
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            if (error instanceof LearningLessonValidationError) {
                onUnexpectedError(new Error(`Learning lesson metadata is invalid: ${error.issues.join('; ')}`));
            } else {
                onUnexpectedError(err);
            }
            return undefined;
        }
    }

    private renderLessonZones(): void {
        this.clearZones();
        const lesson = this.lesson;
        const viewModel = this.editor.getViewModel();
        if (!lesson || !viewModel) {
            return;
        }

        const hintsByMcq = collectHintsByMcq(lesson.timeline);
        const cellIndexById = this.buildCellIndexMap(viewModel.viewCells);
        const mcqEntries = lesson.timeline.filter((entry): entry is LearningMCQEntry => isLearningMCQEntry(entry));
        if (!mcqEntries.length) {
            return;
        }

        const totalCells = viewModel.viewCells.length;
        this.editor.changeViewZones(accessor => {
            for (const entry of mcqEntries) {
                const hints = hintsByMcq.get(entry.id) ?? [];
                const afterIndex = this.resolveAfterCellIndex(entry, cellIndexById, totalCells);
                const zone = this.createZone(accessor, entry, hints, afterIndex, totalCells);
                if (zone) {
                    this.zoneHandles.set(zone.id, zone.handle);
                    this.scheduleZoneLayout(zone.id);
                }
            }
        });
    }

    private buildCellIndexMap(cells: readonly ICellViewModel[]): Map<string, number> {
        const map = new Map<string, number>();
        cells.forEach((cell, index) => {
            const candidate = cell.metadata?.[LEARNING_CELL_ID_KEY];
            if (typeof candidate === 'string') {
                map.set(candidate, index);
            }
        });
        return map;
    }

    private resolveAfterCellIndex(entry: LearningMCQEntry, cellIndexById: Map<string, number>, totalCells: number): number {
        if (entry.afterCellId) {
            const index = cellIndexById.get(entry.afterCellId);
            if (typeof index === 'number') {
                return index;
            }
        }

        if (typeof entry.afterCellIndex === 'number') {
            return Math.max(-1, Math.min(totalCells - 1, Math.floor(entry.afterCellIndex)));
        }

        return totalCells - 1;
    }

    private createZone(accessor: { addZone(zone: INotebookViewZone): string }, entry: LearningMCQEntry, hints: readonly LearningHintEntry[], afterIndex: number, totalCells: number): { id: string; handle: LearningZoneHandle } | undefined {
        const domNode = document.createElement('div');
        domNode.className = 'edu-learning-mcq-zone';

        const afterPosition = Math.max(0, Math.min(totalCells, afterIndex + 1));
        const zone: INotebookViewZone = {
            afterModelPosition: afterPosition,
            heightInPx: 4,
            domNode
        };

        const component = new MCQComponent(domNode, entry, this.progressContext, { hints });

        const id = accessor.addZone(zone);
        const layoutListener = component.onDidChangeContent(() => this.scheduleZoneLayout(id));
        const answerListener = component.onDidAnswer(() => this.scheduleZoneLayout(id));

        const handle: LearningZoneHandle = {
            zone,
            component,
            dispose: () => {
                layoutListener.dispose();
                answerListener.dispose();
                component.dispose();
            }
        };

        return { id, handle };
    }

    private scheduleZoneLayout(id: string): void {
        const handle = this.zoneHandles.get(id);
        if (!handle) {
            return;
        }

        const element = handle.zone.domNode;
        const win = DOM.getWindow(element);
        DOM.scheduleAtNextAnimationFrame(win, () => {
            const current = this.zoneHandles.get(id);
            if (!current) {
                return;
            }
            const height = Math.ceil(element.offsetHeight);
            if (height > 0 && current.zone.heightInPx !== height) {
                current.zone.heightInPx = height;
                this.editor.changeViewZones(accessor => accessor.layoutZone(id));
            }
        });
    }

    private clearZones(): void {
        if (!this.zoneHandles.size) {
            return;
        }
        this.editor.changeViewZones(accessor => {
            for (const id of this.zoneHandles.keys()) {
                accessor.removeZone(id);
            }
        });
        for (const handle of this.zoneHandles.values()) {
            handle.dispose();
        }
        this.zoneHandles.clear();
    }

    private remeasureAllZones(): void {
        for (const id of this.zoneHandles.keys()) {
            this.scheduleZoneLayout(id);
        }
    }

    override dispose(): void {
        this.clearZones();
        super.dispose();
    }
}

registerNotebookContribution(NotebookLearningTimelineContribution.id, NotebookLearningTimelineContribution);
