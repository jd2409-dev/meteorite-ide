/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as React from 'react';
import type { CodeCellModel } from './notebookTypes.js';
import { useMonacoEditor } from './useMonacoEditor.js';
import { useNotebook, useNotebookExecution, useNotebookSelection } from './notebookContext.js';
import { OutputPanel } from './OutputPanel.js';
import { DEFAULT_LANGUAGES } from './notebookTypes.js';
import './media/codeCell.css';

export interface CodeCellProps {
    readonly cell: CodeCellModel;
    readonly index: number;
    readonly total: number;
}

export const CodeCell: React.FunctionComponent<CodeCellProps> = ({ cell, index, total }) => {
    const notebook = useNotebook();
    const execution = useNotebookExecution();
    const selection = useNotebookSelection();

    const editorContainerRef = React.useRef<HTMLDivElement | null>(null);
    const isSelected = selection.selectedId === cell.id;

    useMonacoEditor(editorContainerRef, {
        language: cell.language,
        value: cell.content,
        ariaLabel: 'Code cell editor',
        readOnly: execution.isExecuting(cell.id),
        onChange: value => notebook.updateCellContent(cell.id, value)
    });

    const classes = ['edu-code-cell'];
    if (isSelected) {
        classes.push('is-selected');
    }

    const handleSelect = () => selection.selectCell(cell.id);
    const handleRun = () => execution.runCell(cell.id);
    const handleMoveUp = () => notebook.moveCell(cell.id, 'up');
    const handleMoveDown = () => notebook.moveCell(cell.id, 'down');
    const handleRemove = () => notebook.removeCell(cell.id);
    const toggleOutput = () => notebook.toggleCollapsed(cell.id);

    const handleLanguageChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
        notebook.updateLanguage(cell.id, event.target.value);
    };

    const runtimeLanguages = notebook.runtime?.supportedLanguages ?? DEFAULT_LANGUAGES;

    return React.createElement(
        'section',
        {
            className: classes.join(' '),
            'aria-label': 'Code cell',
            onClick: handleSelect
        },
        React.createElement(
            'div',
            { className: 'edu-code-cell__toolbar' },
            React.createElement('span', { className: 'edu-code-cell__title' }, 'Code cell'),
            React.createElement(
                'div',
                { className: 'edu-code-cell__toolbar-group' },
                React.createElement(
                    'label',
                    { className: 'edu-code-cell__language-label', htmlFor: `${cell.id}-language` },
                    'Language'
                ),
                React.createElement(
                    'select',
                    {
                        id: `${cell.id}-language`,
                        className: 'edu-code-cell__language-select',
                        value: cell.language,
                        onChange: event => {
                            event.stopPropagation();
                            handleLanguageChange(event);
                        }
                    },
                    runtimeLanguages.filter(language => language.id !== 'markdown').map(language => React.createElement('option', { key: language.id, value: language.id }, language.label))
                ),
                React.createElement(
                    'button',
                    {
                        type: 'button',
                        className: 'edu-code-cell__btn is-primary',
                        onClick: event => {
                            event.stopPropagation();
                            handleRun();
                        },
                        disabled: execution.isExecuting(cell.id),
                        'aria-label': 'Run code cell'
                    },
                    execution.isExecuting(cell.id) ? 'Running…' : 'Run'
                ),
                React.createElement(
                    'button',
                    {
                        type: 'button',
                        className: 'edu-code-cell__btn',
                        onClick: event => {
                            event.stopPropagation();
                            handleMoveUp();
                        },
                        disabled: index === 0,
                        'aria-label': 'Move code cell up'
                    },
                    'Up'
                ),
                React.createElement(
                    'button',
                    {
                        type: 'button',
                        className: 'edu-code-cell__btn',
                        onClick: event => {
                            event.stopPropagation();
                            handleMoveDown();
                        },
                        disabled: index === total - 1,
                        'aria-label': 'Move code cell down'
                    },
                    'Down'
                ),
                React.createElement(
                    'button',
                    {
                        type: 'button',
                        className: 'edu-code-cell__btn is-danger',
                        onClick: event => {
                            event.stopPropagation();
                            handleRemove();
                        },
                        'aria-label': 'Delete code cell'
                    },
                    'Delete'
                )
            )
        ),
        React.createElement(
            'div',
            { className: 'edu-code-cell__editor-wrapper' },
            React.createElement('div', {
                className: 'edu-code-cell__editor',
                ref: editorContainerRef,
                onClick: event => {
                    event.stopPropagation();
                    handleSelect();
                }
            })
        ),
        React.createElement(OutputPanel, {
            outputs: cell.outputs,
            collapsed: !!cell.collapsed,
            onToggle: () => toggleOutput()
        })
    );
};
