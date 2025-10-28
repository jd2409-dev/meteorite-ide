/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IDisposable } from '../../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../../base/common/event.js';

export interface QuestionProgressSnapshot {
    readonly attempts: number;
    readonly correctAttempts: number;
    readonly lastAttemptCorrect: boolean;
    readonly lastOptionId?: string;
}

export interface LearningProgressSnapshot {
    readonly attempts: number;
    readonly correct: number;
    readonly streak: number;
    readonly perQuestion: Record<string, QuestionProgressSnapshot>;
}

export interface LearningProgressContextValue {
    readonly snapshot: LearningProgressSnapshot;
    recordAttempt(questionId: string, isCorrect: boolean, optionId?: string): void;
    reset(questionId?: string): void;
    subscribe(listener: (snapshot: LearningProgressSnapshot) => void): IDisposable;
}

function cloneSnapshot(snapshot: LearningProgressSnapshot): LearningProgressSnapshot {
    const perQuestion: Record<string, QuestionProgressSnapshot> = {};
    for (const key of Object.keys(snapshot.perQuestion)) {
        const entry = snapshot.perQuestion[key];
        perQuestion[key] = { ...entry };
    }
    return {
        attempts: snapshot.attempts,
        correct: snapshot.correct,
        streak: snapshot.streak,
        perQuestion
    };
}

export class LearningProgressContext extends Disposable implements LearningProgressContextValue {
    private readonly _onDidChange = this._register(new Emitter<LearningProgressSnapshot>());
    readonly onDidChange: Event<LearningProgressSnapshot> = this._onDidChange.event;

    private _snapshot: LearningProgressSnapshot = {
        attempts: 0,
        correct: 0,
        streak: 0,
        perQuestion: Object.create(null)
    };

    get snapshot(): LearningProgressSnapshot {
        return cloneSnapshot(this._snapshot);
    }

    recordAttempt(questionId: string, isCorrect: boolean, optionId?: string): void {
        const perQuestion = this._snapshot.perQuestion[questionId] ?? {
            attempts: 0,
            correctAttempts: 0,
            lastAttemptCorrect: false
        };

        perQuestion.attempts += 1;
        perQuestion.lastAttemptCorrect = isCorrect;
        perQuestion.lastOptionId = optionId;
        if (isCorrect) {
            perQuestion.correctAttempts += 1;
            this._snapshot.correct += 1;
            this._snapshot.streak += 1;
        } else {
            this._snapshot.streak = 0;
        }

        this._snapshot.perQuestion[questionId] = perQuestion;
        this._snapshot.attempts += 1;
        this._onDidChange.fire(this.snapshot);
    }

    reset(questionId?: string): void {
        if (!questionId) {
            this._snapshot = {
                attempts: 0,
                correct: 0,
                streak: 0,
                perQuestion: Object.create(null)
            };
        } else if (this._snapshot.perQuestion[questionId]) {
            const { attempts, correctAttempts } = this._snapshot.perQuestion[questionId];
            this._snapshot.attempts -= attempts;
            this._snapshot.correct -= correctAttempts;
            this._snapshot.streak = Math.max(0, this._snapshot.streak - correctAttempts);
            delete this._snapshot.perQuestion[questionId];
        }

        this._onDidChange.fire(this.snapshot);
    }

    subscribe(listener: (snapshot: LearningProgressSnapshot) => void): IDisposable {
        listener(this.snapshot);
        return this.onDidChange(listener);
    }
}

export function createLearningProgressContext(): LearningProgressContextValue {
    return new LearningProgressContext();
}
