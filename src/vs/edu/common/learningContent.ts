/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isArrayOf, isBoolean, isNumber, isObject, isString } from '../../base/common/types.js';
import { IJSONSchema } from '../../base/common/jsonSchema.js';

export const LEARNING_LESSON_METADATA_KEY = 'learningLesson';
export const LEARNING_CELL_ID_KEY = 'learningCellId';

export type LearningDifficulty = 'beginner' | 'intermediate' | 'advanced';

export interface MCQOption {
	readonly id: string;
	readonly text: string;
	readonly isCorrect: boolean;
	readonly explanation?: string;
}

export interface LearningHintEntry {
	readonly type: 'hint';
	readonly id: string;
	readonly mcqId: string;
	readonly text: string;
	readonly order?: number;
	readonly ariaLabel?: string;
}

export interface LearningMCQEntry {
	readonly type: 'mcq';
	readonly id: string;
	readonly question: string;
	readonly options: readonly MCQOption[];
	readonly explanation?: string;
	readonly afterCellId?: string;
	readonly afterCellIndex?: number;
	readonly tags?: readonly string[];
	readonly difficulty?: LearningDifficulty;
	readonly hints?: readonly string[];
}

export interface NotebookCellTimelineEntry {
	readonly type: 'cell';
	readonly cellId: string;
	readonly label?: string;
}

export type LearningTimelineEntry = NotebookCellTimelineEntry | LearningMCQEntry | LearningHintEntry;

export interface SupplementalResource {
	readonly id: string;
	readonly title: string;
	readonly uri: string;
	readonly type?: string;
	readonly description?: string;
}

export interface LearningLesson {
	readonly id: string;
	readonly title: string;
	readonly description?: string;
	readonly version?: string;
	readonly tags?: readonly string[];
	readonly timeline: readonly LearningTimelineEntry[];
	readonly resources?: readonly SupplementalResource[];
}

export class LearningLessonValidationError extends Error {
	constructor(message: string, public readonly issues: readonly string[]) {
		super(message);
	}
}

function ensureStringArray(input: unknown, issueBucket: string[], field: string): string[] | undefined {
	if (input === undefined) {
		return undefined;
	}
	if (!isArrayOf(input, isString)) {
		issueBucket.push(`${field} must be an array of strings.`);
		return undefined;
	}
	return input as string[];
}

function ensureNumber(input: unknown, issueBucket: string[], field: string): number | undefined {
	if (input === undefined) {
		return undefined;
	}
	if (!isNumber(input)) {
		issueBucket.push(`${field} must be a number.`);
		return undefined;
	}
	return input;
}

function sortHints(hints: readonly LearningHintEntry[]): LearningHintEntry[] {
	return [...hints].sort((a, b) => {
		const orderA = a.order ?? Number.MAX_SAFE_INTEGER;
		const orderB = b.order ?? Number.MAX_SAFE_INTEGER;
		if (orderA === orderB) {
			return a.id.localeCompare(b.id);
		}
		return orderA - orderB;
	});
}

export function collectHintsByMcq(entries: readonly LearningTimelineEntry[]): Map<string, LearningHintEntry[]> {
	const result = new Map<string, LearningHintEntry[]>();
	for (const entry of entries) {
		if (isLearningHintEntry(entry)) {
			const bucket = result.get(entry.mcqId) ?? [];
			bucket.push(entry);
			result.set(entry.mcqId, bucket);
		}
	}
	for (const [key, value] of result) {
		result.set(key, sortHints(value));
	}
	return result;
}

function validateOption(raw: unknown, issueBucket: string[], mcqId: string, index: number): MCQOption | undefined {
	if (!isObject(raw)) {
		issueBucket.push(`Option ${index} for question ${mcqId} must be an object.`);
		return undefined;
	}
	const option = raw as Partial<MCQOption> & { text?: unknown; isCorrect?: unknown };
	if (!isString(option.id)) {
		issueBucket.push(`Option ${index} for question ${mcqId} requires string id.`);
	}
	if (!isString(option.text)) {
		issueBucket.push(`Option ${index} for question ${mcqId} requires string text.`);
	}
	if (!isBoolean(option.isCorrect)) {
		issueBucket.push(`Option ${index} for question ${mcqId} requires boolean isCorrect.`);
	}
	if (option.explanation !== undefined && !isString(option.explanation)) {
		issueBucket.push(`Option ${index} for question ${mcqId} explanation must be string when provided.`);
	}
	if (!isString(option.id) || !isString(option.text) || !isBoolean(option.isCorrect)) {
		return undefined;
	}
	return {
		id: option.id,
		text: option.text,
		isCorrect: option.isCorrect,
		explanation: option.explanation
	};
}

function validateMCQEntry(raw: unknown, issueBucket: string[], index: number): LearningMCQEntry | undefined {
	if (!isObject(raw)) {
		issueBucket.push(`Timeline entry ${index} must be an object.`);
		return undefined;
	}
	const entry = raw as Partial<LearningMCQEntry> & { type?: unknown; question?: unknown; options?: unknown; afterCellId?: unknown; afterCellIndex?: unknown; explanation?: unknown; tags?: unknown; difficulty?: unknown; hints?: unknown };
	if (entry.type !== 'mcq') {
		issueBucket.push(`Timeline entry ${index} must declare type "mcq".`);
		return undefined;
	}
	if (!isString(entry.id)) {
		issueBucket.push(`MCQ entry ${index} requires string id.`);
	}
	if (!isString(entry.question)) {
		issueBucket.push(`MCQ ${entry.id ?? index} requires question text.`);
	}

	if (entry.explanation !== undefined && !isString(entry.explanation)) {
		issueBucket.push(`MCQ ${entry.id ?? index} explanation must be a string when provided.`);
	}

	if (entry.afterCellId !== undefined && !isString(entry.afterCellId)) {
		issueBucket.push(`MCQ ${entry.id ?? index} afterCellId must be a string when provided.`);
	}

	if (entry.afterCellIndex !== undefined && !isNumber(entry.afterCellIndex)) {
		issueBucket.push(`MCQ ${entry.id ?? index} afterCellIndex must be a number when provided.`);
	}

	if (entry.difficulty !== undefined && entry.difficulty !== 'beginner' && entry.difficulty !== 'intermediate' && entry.difficulty !== 'advanced') {
		issueBucket.push(`MCQ ${entry.id ?? index} difficulty must be one of beginner | intermediate | advanced.`);
	}

	const tags = ensureStringArray(entry.tags, issueBucket, `MCQ ${entry.id ?? index} tags`);
	const referencedHints = ensureStringArray(entry.hints, issueBucket, `MCQ ${entry.id ?? index} hints`);

	if (!Array.isArray(entry.options)) {
		issueBucket.push(`MCQ ${entry.id ?? index} options must be an array.`);
		return undefined;
	}

	const options = entry.options
		.map((opt, optionIndex) => validateOption(opt, issueBucket, entry.id ?? `@${index}`, optionIndex))
		.filter((opt): opt is MCQOption => !!opt);

	if (!options.length) {
		issueBucket.push(`MCQ ${entry.id ?? index} must expose at least one option.`);
	}
	if (!options.some(opt => opt.isCorrect)) {
		issueBucket.push(`MCQ ${entry.id ?? index} must have at least one correct option.`);
	}

	if (!isString(entry.id) || !isString(entry.question) || !options.length) {
		return undefined;
	}

	return {
		type: 'mcq',
		id: entry.id,
		question: entry.question,
		options,
		explanation: entry.explanation,
		afterCellId: entry.afterCellId,
		afterCellIndex: entry.afterCellIndex,
		tags,
		difficulty: entry.difficulty,
		hints: referencedHints
	};
}

function validateHintEntry(raw: unknown, issueBucket: string[], index: number): LearningHintEntry | undefined {
	if (!isObject(raw)) {
		issueBucket.push(`Timeline entry ${index} must be an object.`);
		return undefined;
	}
	const entry = raw as Partial<LearningHintEntry> & { text?: unknown; order?: unknown; ariaLabel?: unknown };
	if (entry.type !== 'hint') {
		issueBucket.push(`Timeline entry ${index} must declare type "hint".`);
		return undefined;
	}
	if (!isString(entry.id)) {
		issueBucket.push(`Hint entry ${index} requires string id.`);
	}
	if (!isString(entry.mcqId)) {
		issueBucket.push(`Hint ${entry.id ?? index} must reference an mcqId.`);
	}
	if (!isString(entry.text)) {
		issueBucket.push(`Hint ${entry.id ?? index} must include text.`);
	}

	const order = ensureNumber(entry.order, issueBucket, `Hint ${entry.id ?? index} order`);
	if (entry.ariaLabel !== undefined && !isString(entry.ariaLabel)) {
		issueBucket.push(`Hint ${entry.id ?? index} ariaLabel must be a string when provided.`);
	}

	if (!isString(entry.id) || !isString(entry.mcqId) || !isString(entry.text)) {
		return undefined;
	}

	return {
		type: 'hint',
		id: entry.id,
		mcqId: entry.mcqId,
		text: entry.text,
		order,
		ariaLabel: entry.ariaLabel
	};
}

function validateNotebookCellEntry(raw: unknown, issueBucket: string[], index: number): NotebookCellTimelineEntry | undefined {
	if (!isObject(raw)) {
		issueBucket.push(`Timeline entry ${index} must be an object.`);
		return undefined;
	}
	const entry = raw as Partial<NotebookCellTimelineEntry> & { cellId?: unknown; label?: unknown };
	if (entry.type !== 'cell') {
		issueBucket.push(`Timeline entry ${index} must declare type "cell".`);
		return undefined;
	}
	if (!isString(entry.cellId)) {
		issueBucket.push(`Timeline cell entry ${index} must provide cellId.`);
		return undefined;
	}
	if (entry.label !== undefined && !isString(entry.label)) {
		issueBucket.push(`Timeline cell entry ${index} label must be string when provided.`);
	}
	return {
		type: 'cell',
		cellId: entry.cellId,
		label: entry.label
	};
}

function validateResource(raw: unknown, issueBucket: string[], index: number): SupplementalResource | undefined {
	if (!isObject(raw)) {
		issueBucket.push(`Resource ${index} must be an object.`);
		return undefined;
	}
	const resource = raw as Partial<SupplementalResource> & { uri?: unknown; type?: unknown; description?: unknown };
	if (!isString(resource.id)) {
		issueBucket.push(`Resource ${index} requires string id.`);
	}
	if (!isString(resource.title)) {
		issueBucket.push(`Resource ${resource.id ?? index} requires string title.`);
	}
	if (!isString(resource.uri)) {
		issueBucket.push(`Resource ${resource.id ?? index} requires string uri.`);
	}
	if (resource.type !== undefined && !isString(resource.type)) {
		issueBucket.push(`Resource ${resource.id ?? index} type must be string when provided.`);
	}
	if (resource.description !== undefined && !isString(resource.description)) {
		issueBucket.push(`Resource ${resource.id ?? index} description must be string when provided.`);
	}

	if (!isString(resource.id) || !isString(resource.title) || !isString(resource.uri)) {
		return undefined;
	}

	return {
		id: resource.id,
		title: resource.title,
		uri: resource.uri,
		type: resource.type,
		description: resource.description
	};
}

export function parseLearningLesson(raw: unknown): LearningLesson {
	let candidate = raw;
	const issues: string[] = [];

	if (isString(candidate)) {
		try {
			candidate = JSON.parse(candidate);
		} catch (err) {
			throw new LearningLessonValidationError('Unable to parse lesson JSON.', [String(err)]);
		}
	}

	if (!isObject(candidate)) {
		throw new LearningLessonValidationError('Lesson content must be an object.', ['Root value was not an object.']);
	}

	const lesson = candidate as Record<string, unknown>;
	if (!isString(lesson.id)) {
		issues.push('Lesson must declare string "id".');
	}
	if (!isString(lesson.title)) {
		issues.push('Lesson must declare string "title".');
	}
	if (lesson.description !== undefined && !isString(lesson.description)) {
		issues.push('Lesson description must be string when provided.');
	}
	if (lesson.version !== undefined && !isString(lesson.version)) {
		issues.push('Lesson version must be string when provided.');
	}
	const tags = ensureStringArray(lesson.tags, issues, 'Lesson tags');

	const timelineRaw = lesson.timeline;
	if (!Array.isArray(timelineRaw) || !timelineRaw.length) {
		issues.push('Lesson must include a non-empty timeline array.');
	}

	const timeline: LearningTimelineEntry[] = [];
	const mcqIds = new Set<string>();
	const hintIds = new Set<string>();

	if (Array.isArray(timelineRaw)) {
		timelineRaw.forEach((entry, index) => {
			if (!isObject(entry)) {
				issues.push(`Timeline entry ${index} must be an object.`);
				return;
			}
			switch ((entry as { type?: unknown }).type) {
				case 'mcq': {
					const mcq = validateMCQEntry(entry, issues, index);
					if (mcq) {
						if (mcqIds.has(mcq.id)) {
							issues.push(`Duplicate MCQ identifier detected: ${mcq.id}.`);
						} else {
							mcqIds.add(mcq.id);
						}
						timeline.push(mcq);
					}
					break;
				}
				case 'hint': {
					const hint = validateHintEntry(entry, issues, index);
					if (hint) {
						if (hintIds.has(hint.id)) {
							issues.push(`Duplicate hint identifier detected: ${hint.id}.`);
						} else {
							hintIds.add(hint.id);
						}
						timeline.push(hint);
					}
					break;
				}
				case 'cell': {
					const cell = validateNotebookCellEntry(entry, issues, index);
					if (cell) {
						timeline.push(cell);
					}
					break;
				}
				default:
					issues.push(`Timeline entry ${index} type must be one of "cell", "mcq", or "hint".`);
			}
		});
	}

	const hintReferences = collectHintsByMcq(timeline);
	for (const mcq of timeline.filter((entry): entry is LearningMCQEntry => isLearningMCQEntry(entry))) {
		const referenced = new Set(mcq.hints ?? []);
		const hints = hintReferences.get(mcq.id) ?? [];
		for (const ref of referenced) {
			if (!hints.some(h => h.id === ref)) {
				issues.push(`MCQ ${mcq.id} references missing hint ${ref}.`);
			}
		}
		for (const hint of hints) {
			if (mcq.hints && !mcq.hints.includes(hint.id)) {
				issues.push(`Hint ${hint.id} is defined for MCQ ${mcq.id} but that MCQ does not include it in its hints array.`);
			}
		}
	}

	const resourcesRaw = lesson.resources;
	let resources: SupplementalResource[] | undefined;
	if (resourcesRaw !== undefined) {
		if (!Array.isArray(resourcesRaw)) {
			issues.push('Lesson resources must be an array when provided.');
		} else {
			const validated = resourcesRaw.map((item, index) => validateResource(item, issues, index)).filter((item): item is SupplementalResource => !!item);
			if (validated.length) {
				resources = validated;
			}
		}
	}

	if (issues.length) {
		throw new LearningLessonValidationError('Lesson content failed validation.', issues);
	}

	return {
		id: lesson.id as string,
		title: lesson.title as string,
		description: lesson.description as string | undefined,
		version: lesson.version as string | undefined,
		tags,
		timeline,
		resources
	};
}

export function serializeLearningLesson(lesson: LearningLesson): object {
	return {
		id: lesson.id,
		title: lesson.title,
		description: lesson.description,
		version: lesson.version,
		tags: lesson.tags,
		timeline: lesson.timeline.map(entry => ({ ...entry })),
		resources: lesson.resources?.map(resource => ({ ...resource }))
	};
}

export function isLearningMCQEntry(entry: LearningTimelineEntry): entry is LearningMCQEntry {
	return entry.type === 'mcq';
}

export function isLearningHintEntry(entry: LearningTimelineEntry): entry is LearningHintEntry {
	return entry.type === 'hint';
}

export const learningLessonSchema: IJSONSchema = {
	type: 'object',
	required: ['id', 'title', 'timeline'],
	allowComments: true,
	allowTrailingCommas: true,
	properties: {
		id: {
			type: 'string',
			description: 'Unique identifier for the learning lesson.'
		},
		title: {
			type: 'string',
			description: 'Display title for the lesson.'
		},
		description: {
			type: 'string',
			description: 'Optional markdown capable description of the lesson.'
		},
		version: {
			type: 'string',
			description: 'Optional version for the lesson definition.'
		},
		tags: {
			type: 'array',
			items: { type: 'string' },
			description: 'Optional set of tags used for filtering or search.'
		},
		timeline: {
			type: 'array',
			minItems: 1,
			items: {
				oneOf: [
					{ $ref: '#/definitions/notebookCell' },
					{ $ref: '#/definitions/mcq' },
					{ $ref: '#/definitions/hint' }
				]
			},
			description: 'Ordered timeline describing notebook cells, assessment blocks, and contextual hints.'
		},
		resources: {
			type: 'array',
			items: { $ref: '#/definitions/resource' },
			description: 'Supplemental resources that accompany the lesson.'
		}
	},
	definitions: {
		option: {
			type: 'object',
			required: ['id', 'text', 'isCorrect'],
			properties: {
				id: { type: 'string' },
				text: { type: 'string' },
				isCorrect: { type: 'boolean' },
				explanation: { type: 'string' }
			},
			additionalProperties: false
		},
		mcq: {
			type: 'object',
			required: ['type', 'id', 'question', 'options'],
			properties: {
				type: { const: 'mcq' },
				id: { type: 'string' },
				question: { type: 'string' },
				explanation: { type: 'string' },
				afterCellId: { type: 'string' },
				afterCellIndex: { type: 'number', minimum: 0 },
				difficulty: { enum: ['beginner', 'intermediate', 'advanced'] },
				tags: { type: 'array', items: { type: 'string' } },
				hints: { type: 'array', items: { type: 'string' } },
				options: {
					type: 'array',
					minItems: 2,
					items: { $ref: '#/definitions/option' }
				}
			},
			additionalProperties: false
		},
		hint: {
			type: 'object',
			required: ['type', 'id', 'mcqId', 'text'],
			properties: {
				type: { const: 'hint' },
				id: { type: 'string' },
				mcqId: { type: 'string' },
				text: { type: 'string' },
				order: { type: 'number' },
				ariaLabel: { type: 'string' }
			},
			additionalProperties: false
		},
		notebookCell: {
			type: 'object',
			required: ['type', 'cellId'],
			properties: {
				type: { const: 'cell' },
				cellId: { type: 'string' },
				label: { type: 'string' }
			},
			additionalProperties: false
		},
		resource: {
			type: 'object',
			required: ['id', 'title', 'uri'],
			properties: {
				id: { type: 'string' },
				title: { type: 'string' },
				uri: { type: 'string', format: 'uri' },
				type: { type: 'string' },
				description: { type: 'string' }
			},
			additionalProperties: false
		}
	},
	additionalProperties: false
};
