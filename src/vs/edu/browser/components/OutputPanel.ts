/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as React from 'react';
import type { NotebookCellOutput } from './notebookTypes.js';
import './media/outputPanel.css';

export interface OutputPanelProps {
    readonly outputs: readonly NotebookCellOutput[];
    readonly collapsed?: boolean;
    onToggle(): void;
}

export const OutputPanel: React.FunctionComponent<OutputPanelProps> = ({ outputs, collapsed = false, onToggle }) => {
    const classes = ['edu-output-panel'];
    if (collapsed) {
        classes.push('is-collapsed');
    }
    if (!outputs.length) {
        classes.push('is-empty');
    }

    return React.createElement(
        'div',
        { className: classes.join(' ') },
        React.createElement(
            'div',
            { className: 'edu-output-panel__header' },
            React.createElement('span', { className: 'edu-output-panel__title' }, 'Output'),
            React.createElement(
                'button',
                {
                    type: 'button',
                    className: 'edu-output-panel__toggle',
                    onClick: event => {
                        event.stopPropagation();
                        onToggle();
                    },
                    'aria-expanded': !collapsed,
                    'aria-label': collapsed ? 'Expand output' : 'Collapse output'
                },
                collapsed ? 'Show' : 'Hide'
            )
        ),
        !collapsed ? React.createElement(
            'div',
            { className: 'edu-output-panel__content' },
            outputs.length ? outputs.map((output, index) => React.createElement(OutputView, { output, key: index })) : React.createElement('div', { className: 'edu-output-panel__empty' }, 'Run the cell to see output.')
        ) : null
    );
};

interface OutputViewProps {
    readonly output: NotebookCellOutput;
}

const OutputView: React.FunctionComponent<OutputViewProps> = ({ output }) => {
    switch (output.kind) {
        case 'text':
            return React.createElement('pre', { className: 'edu-output-panel__text' }, output.text);
        case 'table':
            return React.createElement(
                'div',
                { className: 'edu-output-panel__table-wrapper' },
                React.createElement(
                    'table',
                    { className: 'edu-output-panel__table' },
                    React.createElement(
                        'thead',
                        null,
                        React.createElement(
                            'tr',
                            null,
                            output.headers.map((header, headerIndex) => React.createElement('th', { key: headerIndex }, header))
                        )
                    ),
                    React.createElement(
                        'tbody',
                        null,
                        output.rows.map((row, rowIndex) => React.createElement(
                            'tr',
                            { key: rowIndex },
                            row.map((cell, cellIndex) => React.createElement('td', { key: cellIndex }, String(cell)))
                        ))
                    )
                )
            );
        case 'future':
            return React.createElement('div', { className: 'edu-output-panel__future' }, output.descriptor);
        default:
            return null;
    }
};
