/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as React from 'react';
import { NotebookProvider, useNotebook, useNotebookExecution, useNotebookSelection } from './notebookContext.js';
import type { NotebookCellModel, NotebookCellType, NotebookRuntimeConfiguration } from './notebookTypes.js';
import { CodeCell } from './CodeCell.js';
import { MarkdownCell } from './MarkdownCell.js';
import './media/notebookShell.css';

export interface NotebookShellProps {
	readonly initialCells?: readonly NotebookCellModel[];
	readonly runtime?: NotebookRuntimeConfiguration;
}

export const NotebookShell: React.FunctionComponent<NotebookShellProps> = ({ initialCells, runtime }) => {
	return React.createElement(
		NotebookProvider,
		{ initialCells, runtime },
		React.createElement(NotebookScaffold, null)
	);
};

const NotebookScaffold: React.FunctionComponent = () => {
	const notebook = useNotebook();
	const execution = useNotebookExecution();
	const selection = useNotebookSelection();

	const addCell = (type: NotebookCellType) => {
		const anchor = selection.selectedId ?? notebook.cells.at(-1)?.id;
		notebook.addCell(type, anchor);
	};

	return React.createElement(
		'div',
		{ className: 'edu-notebook-shell' },
		React.createElement(
			'header',
			{ className: 'edu-notebook-shell__header' },
			React.createElement('h1', { className: 'edu-notebook-shell__title' }, 'Interactive Notebook'),
			React.createElement(
				'div',
				{ className: 'edu-notebook-shell__controls' },
				React.createElement(
					'button',
					{
						type: 'button',
						className: 'edu-notebook-shell__btn is-primary',
						onClick: () => execution.runAll(),
						disabled: notebook.cells.length === 0
					},
					'Run all'
				)
			)
		),
		React.createElement(
			'main',
			{ className: 'edu-notebook-shell__body' },
			notebook.cells.length ? notebook.cells.map((cell, index) => renderCell(cell, index, notebook.cells.length)) : React.createElement(
				'div',
				{ className: 'edu-notebook-shell__empty' },
				'Add a cell to get started.'
			)
		),
		React.createElement(
			'footer',
			{ className: 'edu-notebook-shell__footer' },
			React.createElement('span', { className: 'edu-notebook-shell__footer-label' }, 'Add cell'),
			React.createElement(
				'div',
				{ className: 'edu-notebook-shell__add-controls' },
				React.createElement(
					'button',
					{
						type: 'button',
						className: 'edu-notebook-shell__btn',
						onClick: () => addCell('code')
					},
					'Add code cell'
				),
				React.createElement(
					'button',
					{
						type: 'button',
						className: 'edu-notebook-shell__btn',
						onClick: () => addCell('markdown')
					},
					'Add markdown cell'
				)
			)
		)
	);
};

const renderCell = (cell: NotebookCellModel, index: number, total: number): React.ReactNode => {
	switch (cell.type) {
		case 'code':
			return React.createElement(CodeCell, { key: cell.id, cell, index, total });
		case 'markdown':
			return React.createElement(MarkdownCell, { key: cell.id, cell, index, total });
		default:
			return null;
	}
};
