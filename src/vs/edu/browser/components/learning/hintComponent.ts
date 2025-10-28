/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../base/browser/dom.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { localize } from '../../../../../nls.js';
import { LearningHintEntry } from '../../../common/learningContent.js';
import { HintSequence } from './hintSequence.js';

export interface HintComponentOptions {
    readonly labelledBy?: string;
    readonly ariaDescription?: string;
    readonly revealFirstHint?: boolean;
}

export class HintComponent extends Disposable {
    private readonly sequence: HintSequence;
    private readonly container: HTMLElement;
    private readonly hintsContainer: HTMLElement;
    private readonly revealButton: HTMLButtonElement;
    private readonly _onDidRevealHint = this._register(new Emitter<LearningHintEntry>());
    readonly onDidRevealHint: Event<LearningHintEntry> = this._onDidRevealHint.event;

    constructor(parent: HTMLElement, hints: readonly LearningHintEntry[], options?: HintComponentOptions) {
        super();
        this.sequence = new HintSequence(hints);
        this.container = DOM.append(parent, DOM.$('.edu-learning-hints'));
        this.container.setAttribute('role', 'group');

        if (options?.labelledBy) {
            this.container.setAttribute('aria-labelledby', options.labelledBy);
        }
        if (options?.ariaDescription) {
            this.container.setAttribute('aria-describedby', options.ariaDescription);
        }

        const heading = DOM.append(this.container, DOM.$('div.edu-learning-hints__header'));
        heading.textContent = localize('learning.hints.heading', 'Hints');
        heading.setAttribute('role', 'heading');
        heading.setAttribute('aria-level', '4');

        this.hintsContainer = DOM.append(this.container, DOM.$('div.edu-learning-hints__items'));
        this.hintsContainer.setAttribute('aria-live', 'polite');

        this.revealButton = DOM.append(this.container, DOM.$('button.edu-learning-hints__reveal')) as HTMLButtonElement;
        this.revealButton.type = 'button';
        this.revealButton.textContent = localize('learning.hints.reveal', 'Show next hint');
        this.revealButton.addEventListener('click', () => {
            this.revealNext();
        });

        if (!this.sequence.hasMore()) {
            this.setRevealButtonVisibility(false);
        }

        if (options?.revealFirstHint) {
            this.revealNext();
        }
    }

    revealNext(): LearningHintEntry | undefined {
        const next = this.sequence.revealNext();
        if (!next) {
            this.setRevealButtonVisibility(false);
            return undefined;
        }

        const item = DOM.append(this.hintsContainer, DOM.$('div.edu-learning-hints__item'));
        item.textContent = next.text;
        item.setAttribute('role', 'note');
        item.tabIndex = 0;
        item.dataset['hintId'] = next.id;
        if (next.ariaLabel) {
            item.setAttribute('aria-label', next.ariaLabel);
        }

        item.classList.add('edu-learning-hints__item--visible');
        this._onDidRevealHint.fire(next);

        if (!this.sequence.hasMore()) {
            this.setRevealButtonVisibility(false);
        }

        return next;
    }

    revealAll(): void {
        while (this.sequence.hasMore()) {
            this.revealNext();
        }
    }

    reset(): void {
        this.sequence.reset();
        DOM.clearNode(this.hintsContainer);
        this.setRevealButtonVisibility(this.sequence.hasMore());
    }

    private setRevealButtonVisibility(visible: boolean): void {
        this.revealButton.style.display = visible ? '' : 'none';
        this.revealButton.disabled = !visible;
    }
}
