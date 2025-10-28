/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as React from 'react';
import type { MarkdownCellModel } from './notebookTypes.js';
import { useNotebook, useNotebookExecution, useNotebookSelection } from './notebookContext.js';
import './media/markdownCell.css';

export interface MarkdownCellProps {
	readonly cell: MarkdownCellModel;
	readonly index: number;
	readonly total: number;
}

export const MarkdownCell: React.FunctionComponent<MarkdownCellProps> = ({ cell, index, total }) => {
	const notebook = useNotebook();
	const selection = useNotebookSelection();
	const execution = useNotebookExecution();

	const isSelected = selection.selectedId === cell.id;

	const classes = ['edu-markdown-cell'];
	if (isSelected) {
		classes.push('is-selected');
	}

	const handleSelection = () => selection.selectCell(cell.id);

	const handleContentChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
		notebook.updateCellContent(cell.id, event.target.value);
	};

	const handleRun = () => execution.runCell(cell.id);

	const handleMoveUp = () => notebook.moveCell(cell.id, 'up');
	const handleMoveDown = () => notebook.moveCell(cell.id, 'down');
	const handleRemove = () => notebook.removeCell(cell.id);

	const previewContent = cell.rendered?.value ?? cell.content;

	const collapsed = !!cell.collapsed;

	return React.createElement(
		'section',
		{
			className: classes.join(' '),
			'aria-label': 'Markdown cell',
			onClick: handleSelection
		},
		React.createElement(
			'div',
			{ className: 'edu-markdown-cell__toolbar' },
			React.createElement('span', { className: 'edu-markdown-cell__title' }, 'Markdown cell'),
			React.createElement(
				'div',
				{ className: 'edu-markdown-cell__actions' },
				React.createElement(
					'button',
					{
						type: 'button',
						className: 'edu-markdown-cell__btn',
						onClick: event => {
							event.stopPropagation();
							handleRun();
						},
						disabled: execution.isExecuting(cell.id),
						'aria-label': 'Render markdown cell'
					},
					execution.isExecuting(cell.id) ? 'Rendering…' : 'Render'
				),
				React.createElement(
					'button',
					{
						type: 'button',
						className: 'edu-markdown-cell__btn',
						onClick: event => {
							event.stopPropagation();
							handleMoveUp();
						},
						disabled: index === 0,
						'aria-label': 'Move markdown cell up'
					},
					'Up'
				),
				React.createElement(
					'button',
					{
						type: 'button',
						className: 'edu-markdown-cell__btn',
						onClick: event => {
							event.stopPropagation();
							handleMoveDown();
						},
						disabled: index === total - 1,
						'aria-label': 'Move markdown cell down'
					},
					'Down'
				),
				React.createElement(
					'button',
					{
						type: 'button',
						className: 'edu-markdown-cell__btn is-danger',
						onClick: event => {
							event.stopPropagation();
							handleRemove();
						},
						'aria-label': 'Delete markdown cell'
					},
					'Delete'
				)
			)
		),
		React.createElement(
			'div',
			{ className: 'edu-markdown-cell__body' },
			React.createElement(
				'label',
				{ className: 'edu-markdown-cell__label', htmlFor: `${cell.id}-markdown-editor` },
				'Edit markdown'
			),
			React.createElement('textarea', {
				id: `${cell.id}-markdown-editor`,
				className: 'edu-markdown-cell__editor',
				value: cell.content,
				onChange: handleContentChange,
				rows: 6,
				onClick: event => {
					event.stopPropagation();
					handleSelection();
				}
			})
		),
		React.createElement(
			'div',
			{ className: 'edu-markdown-cell__preview' },
			React.createElement(
				'button',
				{
					type: 'button',
					className: 'edu-markdown-cell__preview-toggle',
					onClick: event => {
						event.stopPropagation();
						notebook.toggleCollapsed(cell.id);
					},
					'aria-expanded': !collapsed
				},
				collapsed ? 'Show preview' : 'Hide preview'
			),
			!collapsed ? React.createElement(
				'div',
				{ className: 'edu-markdown-cell__preview-content' },
				React.createElement('pre', { className: 'edu-markdown-cell__rendered', 'data-testid': `${cell.id}-markdown-preview` }, previewContent || 'Rendered markdown will appear here.')
			) : null
		)
	);
};
