/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LearningHintEntry } from '../../../common/learningContent.js';

export class HintSequence {
	private readonly ordered: readonly LearningHintEntry[];
	private revealed = 0;

	constructor(hints: readonly LearningHintEntry[]) {
		this.ordered = [...hints].sort((a, b) => {
			const orderA = a.order ?? Number.MAX_SAFE_INTEGER;
			const orderB = b.order ?? Number.MAX_SAFE_INTEGER;
			if (orderA === orderB) {
				return a.id.localeCompare(b.id);
			}
			return orderA - orderB;
		});
	}

	revealNext(): LearningHintEntry | undefined {
		if (!this.hasMore()) {
			return undefined;
		}
		const hint = this.ordered[this.revealed];
		this.revealed += 1;
		return hint;
	}

	revealAll(): readonly LearningHintEntry[] {
		if (!this.ordered.length) {
			return [];
		}
		this.revealed = this.ordered.length;
		return this.ordered;
	}

	reset(): void {
		this.revealed = 0;
	}

	hasMore(): boolean {
		return this.revealed < this.ordered.length;
	}

	get size(): number {
		return this.ordered.length;
	}

	get revealedHints(): readonly LearningHintEntry[] {
		return this.ordered.slice(0, this.revealed);
	}
}
