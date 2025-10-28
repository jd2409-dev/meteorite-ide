/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IMarkdownString } from '../../../base/common/htmlContent.js';

export type NotebookCellType = 'code' | 'markdown';

export interface TextOutput {
	readonly kind: 'text';
	readonly text: string;
}

export interface TableOutput {
	readonly kind: 'table';
	readonly headers: readonly string[];
	readonly rows: readonly (readonly (string | number)[])[];
}

export interface FutureOutput {
	readonly kind: 'future';
	readonly descriptor: string;
	readonly payload?: unknown;
}

export type NotebookCellOutput = TextOutput | TableOutput | FutureOutput;

interface BaseCellModel {
	readonly id: string;
	readonly type: NotebookCellType;
	readonly content: string;
	readonly createdAt: number;
	readonly collapsed?: boolean;
}

export interface CodeCellModel extends BaseCellModel {
	readonly type: 'code';
	readonly language: string;
	readonly outputs: readonly NotebookCellOutput[];
}

export interface MarkdownCellModel extends BaseCellModel {
	readonly type: 'markdown';
	readonly language: 'markdown';
	readonly rendered?: IMarkdownString;
}

export type NotebookCellModel = CodeCellModel | MarkdownCellModel;

export interface NotebookRuntimeConfiguration {
	readonly defaultLanguage: string;
	readonly supportedLanguages: readonly LanguageDefinition[];
}

export interface LanguageDefinition {
	readonly id: string;
	readonly label: string;
}

export const DEFAULT_LANGUAGES: readonly LanguageDefinition[] = [
	{ id: 'python', label: 'Python' },
	{ id: 'javascript', label: 'JavaScript' },
	{ id: 'typescript', label: 'TypeScript' },
	{ id: 'java', label: 'Java' },
	{ id: 'cpp', label: 'C/C++' },
	{ id: 'markdown', label: 'Markdown' }
];

export const DEFAULT_RUNTIME_CONFIGURATION: NotebookRuntimeConfiguration = {
	defaultLanguage: 'python',
	supportedLanguages: DEFAULT_LANGUAGES,
};
