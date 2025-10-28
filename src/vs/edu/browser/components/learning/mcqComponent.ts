/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../../base/browser/keyboardEvent.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { KeyCode } from '../../../../../base/common/keyCodes.js';
import { localize } from '../../../../../nls.js';
import { MCQOption, LearningHintEntry, LearningMCQEntry } from '../../../common/learningContent.js';
import { HintComponent } from './hintComponent.js';
import { LearningProgressContext, LearningProgressSnapshot } from './learningProgressContext.js';

export interface MCQComponentOptions {
    readonly hints?: readonly LearningHintEntry[];
}

export interface MCQAnswerEvent {
    readonly questionId: string;
    readonly option: MCQOption;
    readonly snapshot: LearningProgressSnapshot;
}

export class MCQComponent extends Disposable {
    private readonly container: HTMLElement;
    private readonly feedbackRegion: HTMLElement;
    private readonly optionsList: HTMLElement;
    private readonly headerId: string;
    private readonly feedbackId: string;
    private readonly hintComponent?: HintComponent;
    private selectedIndex = 0;
    private hasAnsweredCorrectly = false;
    private readonly _onDidAnswer = this._register(new Emitter<MCQAnswerEvent>());
    readonly onDidAnswer: Event<MCQAnswerEvent> = this._onDidAnswer.event;
    private readonly _onDidChangeContent = this._register(new Emitter<void>());
    readonly onDidChangeContent: Event<void> = this._onDidChangeContent.event;

    constructor(private readonly parent: HTMLElement, private readonly entry: LearningMCQEntry, private readonly progress: LearningProgressContext, options?: MCQComponentOptions) {
        super();
        this.headerId = `${this.entry.id}-question`;
        this.feedbackId = `${this.entry.id}-feedback`;

        this.container = DOM.append(parent, DOM.$('section.edu-learning-mcq'));
        this.container.dataset['questionId'] = this.entry.id;
        this.container.setAttribute('role', 'group');
        this.container.setAttribute('aria-labelledby', this.headerId);

        const heading = DOM.append(this.container, DOM.$('h3.edu-learning-mcq__question'));
        heading.id = this.headerId;
        heading.textContent = this.entry.question;

        if (this.entry.tags?.length) {
            const tagList = DOM.append(this.container, DOM.$('div.edu-learning-mcq__tags'));
            for (const tag of this.entry.tags) {
                const pill = DOM.append(tagList, DOM.$('span.edu-learning-mcq__tag')); // purely decorative
                pill.textContent = tag;
            }
        }

        this.optionsList = DOM.append(this.container, DOM.$('ul.edu-learning-mcq__options'));
        this.optionsList.setAttribute('role', 'radiogroup');
        this.optionsList.setAttribute('aria-describedby', this.feedbackId);

        this.entry.options.forEach((option, index) => {
            this.renderOption(option, index);
        });

        this.feedbackRegion = DOM.append(this.container, DOM.$('div.edu-learning-mcq__feedback'));
        this.feedbackRegion.id = this.feedbackId;
        this.feedbackRegion.setAttribute('role', 'status');
        this.feedbackRegion.setAttribute('aria-live', 'polite');

        if (options?.hints?.length) {
            this.hintComponent = new HintComponent(this.container, options.hints, { labelledBy: this.headerId });
            this._register(this.hintComponent);
            this._register(this.hintComponent.onDidRevealHint(() => this._onDidChangeContent.fire()));
        }

        this._register(this.progress.subscribe(snapshot => {
            this.updateProgressSummary(snapshot);
        }));
    }

    private renderOption(option: MCQOption, index: number): void {
        const item = DOM.append(this.optionsList, DOM.$('li.edu-learning-mcq__option-item'));
        const button = DOM.append(item, DOM.$('button.edu-learning-mcq__option')) as HTMLButtonElement;
        button.type = 'button';
        button.value = option.id;
        button.dataset['optionId'] = option.id;
        button.setAttribute('role', 'radio');
        button.setAttribute('aria-checked', index === 0 ? 'true' : 'false');
        button.tabIndex = index === 0 ? 0 : -1;
        button.textContent = option.text;

        button.addEventListener('click', () => {
            this.onOptionSelected(option, index);
        });
        button.addEventListener('keydown', event => {
            const keyboardEvent = new StandardKeyboardEvent(event);
            switch (keyboardEvent.keyCode) {
                case KeyCode.LeftArrow:
                case KeyCode.RightArrow:
                case KeyCode.UpArrow:
                case KeyCode.DownArrow:
                case KeyCode.PageUp:
                case KeyCode.PageDown:
                    keyboardEvent.preventDefault();
                    this.focusOption(this.getNextIndex(index, keyboardEvent.keyCode));
                    break;
                case KeyCode.Enter:
                case KeyCode.Space:
                    keyboardEvent.preventDefault();
                    this.onOptionSelected(option, index);
                    break;
            }
        });
    }

    private getNextIndex(current: number, keyCode: KeyCode): number {
        const total = this.entry.options.length;
        if (keyCode === KeyCode.LeftArrow || keyCode === KeyCode.UpArrow || keyCode === KeyCode.PageUp) {
            return (current - 1 + total) % total;
        }
        return (current + 1) % total;
    }

    private focusOption(index: number): void {
        const buttons = Array.from(this.optionsList.querySelectorAll<HTMLButtonElement>('button.edu-learning-mcq__option'));
        buttons.forEach((button, idx) => {
            button.setAttribute('aria-checked', idx === index ? 'true' : 'false');
            button.tabIndex = idx === index ? 0 : -1;
        });
        buttons[index]?.focus();
        this.selectedIndex = index;
    }

    private onOptionSelected(option: MCQOption, index: number): void {
        if (this.hasAnsweredCorrectly) {
            return;
        }

        this.focusOption(index);
        const wasCorrect = option.isCorrect;
        this.progress.recordAttempt(this.entry.id, wasCorrect, option.id);
        const snapshot = this.progress.snapshot;

        if (wasCorrect) {
            this.container.classList.add('edu-learning-mcq--answered');
            this.container.classList.remove('edu-learning-mcq--incorrect');
            this.feedbackRegion.textContent = option.explanation ?? this.entry.explanation ?? localize('learning.mcq.correct', 'Great work! That is correct.');
            this.feedbackRegion.classList.add('edu-learning-mcq__feedback--correct');
            this.feedbackRegion.classList.remove('edu-learning-mcq__feedback--incorrect');
            this.hasAnsweredCorrectly = true;
            this.disableOptions(option.id);
            if (this.hintComponent) {
                this.hintComponent.reset();
            }
            if (this.entry.explanation && !option.explanation) {
                this.appendExplanation(this.entry.explanation);
            } else if (option.explanation) {
                this.appendExplanation(option.explanation);
            }
        } else {
            this.container.classList.add('edu-learning-mcq--incorrect');
            this.feedbackRegion.textContent = localize('learning.mcq.tryAgain', 'Not quite. Try another option.');
            this.feedbackRegion.classList.remove('edu-learning-mcq__feedback--correct');
            this.feedbackRegion.classList.add('edu-learning-mcq__feedback--incorrect');
            const revealed = this.hintComponent?.revealNext();
            if (!revealed && this.entry.explanation) {
                this.appendExplanation(this.entry.explanation);
            }
        }

        this._onDidAnswer.fire({
            questionId: this.entry.id,
            option,
            snapshot
        });
        this._onDidChangeContent.fire();
        }

    private disableOptions(correctId: string): void {
        const buttons = Array.from(this.optionsList.querySelectorAll<HTMLButtonElement>('button.edu-learning-mcq__option'));
        buttons.forEach(button => {
            const isCorrect = button.dataset['optionId'] === correctId;
            button.disabled = !isCorrect;
            if (isCorrect) {
                button.classList.add('edu-learning-mcq__option--correct');
            }
        });
    }

    private appendExplanation(text: string): void {
        let explanation = this.container.querySelector<HTMLDivElement>('div.edu-learning-mcq__explanation');
        if (!explanation) {
            explanation = DOM.append(this.container, DOM.$('div.edu-learning-mcq__explanation'));
            explanation.setAttribute('role', 'note');
            explanation.tabIndex = 0;
        }
        explanation.textContent = text;
        this._onDidChangeContent.fire();
    }

    private updateProgressSummary(snapshot: LearningProgressSnapshot): void {
        let summary = this.container.querySelector<HTMLDivElement>('div.edu-learning-mcq__progress');
        if (!summary) {
            summary = DOM.append(this.container, DOM.$('div.edu-learning-mcq__progress'));
            summary.setAttribute('aria-live', 'polite');
        }
        const question = snapshot.perQuestion[this.entry.id];
        if (question?.lastAttemptCorrect && question.correctAttempts > 0 && !this.hasAnsweredCorrectly) {
            this.markAsCompleted(question.lastOptionId);
        }
        const attempts = question?.attempts ?? 0;
        const correctAttempts = question?.correctAttempts ?? 0;
        const streak = snapshot.streak;
        summary.textContent = localize('learning.mcq.progressSummary', '{0} attempts • {1} correct • Current streak: {2}', attempts, correctAttempts, streak);
        this._onDidChangeContent.fire();
    }

    private markAsCompleted(optionId: string | undefined): void {
        if (!optionId) {
            return;
        }
        const option = this.entry.options.find(candidate => candidate.id === optionId);
        if (!option) {
            return;
        }
        this.hasAnsweredCorrectly = true;
        this.disableOptions(optionId);
        this.container.classList.add('edu-learning-mcq--answered');
        this.container.classList.remove('edu-learning-mcq--incorrect');
        const message = option.explanation ?? this.entry.explanation ?? localize('learning.mcq.correct', 'Great work! That is correct.');
        this.feedbackRegion.textContent = message;
        this.feedbackRegion.classList.add('edu-learning-mcq__feedback--correct');
        this.feedbackRegion.classList.remove('edu-learning-mcq__feedback--incorrect');
        if (option.explanation || this.entry.explanation) {
            this.appendExplanation(option.explanation ?? this.entry.explanation!);
        }
        if (this.hintComponent) {
            this.hintComponent.reset();
        }
        this._onDidChangeContent.fire();
    }
}
