/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as React from 'react';
import { timeout } from '../../../base/common/async.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { MarkdownString } from '../../../base/common/htmlContent.js';
import type { CodeCellModel, MarkdownCellModel, NotebookCellModel, NotebookCellOutput, NotebookRuntimeConfiguration, NotebookCellType } from './notebookTypes.js';
import { DEFAULT_RUNTIME_CONFIGURATION } from './notebookTypes.js';

export interface NotebookContextValue {
    readonly cells: readonly NotebookCellModel[];
    readonly runtime: NotebookRuntimeConfiguration;
    addCell(type: NotebookCellType, afterId?: string | null): void;
    removeCell(id: string): void;
    moveCell(id: string, direction: 'up' | 'down'): void;
    updateCellContent(id: string, content: string): void;
    updateLanguage(id: string, language: string): void;
    toggleCollapsed(id: string): void;
    setOutputs(id: string, outputs: NotebookCellOutput[]): void;
}

export interface NotebookSelectionContextValue {
    readonly selectedId: string | undefined;
    selectCell(id: string | undefined): void;
}

export interface NotebookExecutionContextValue {
    readonly executing: ReadonlySet<string>;
    runCell(id: string): Promise<void>;
    runAll(): Promise<void>;
    isExecuting(id: string): boolean;
}

export interface NotebookProviderProps {
    readonly children: React.ReactNode;
    readonly initialCells?: readonly NotebookCellModel[];
    readonly runtime?: NotebookRuntimeConfiguration;
    readonly executeCodeCell?: (cell: CodeCellModel) => Promise<NotebookCellOutput[]>;
}

interface NotebookActionAdd {
    readonly type: 'add';
    readonly cell: NotebookCellModel;
    readonly afterId?: string | null;
}

interface NotebookActionRemove {
    readonly type: 'remove';
    readonly id: string;
}

interface NotebookActionMove {
    readonly type: 'move';
    readonly id: string;
    readonly direction: 'up' | 'down';
}

interface NotebookActionUpdateContent {
    readonly type: 'updateContent';
    readonly id: string;
    readonly content: string;
}

interface NotebookActionUpdateLanguage {
    readonly type: 'updateLanguage';
    readonly id: string;
    readonly language: string;
}

interface NotebookActionToggleCollapse {
    readonly type: 'toggleCollapse';
    readonly id: string;
}

interface NotebookActionSetOutputs {
    readonly type: 'setOutputs';
    readonly id: string;
    readonly outputs: NotebookCellOutput[];
}

interface NotebookActionSetRenderedMarkdown {
    readonly type: 'setRendered';
    readonly id: string;
    readonly markdown: MarkdownString;
}

type NotebookReducerAction = NotebookActionAdd | NotebookActionRemove | NotebookActionMove | NotebookActionUpdateContent | NotebookActionUpdateLanguage | NotebookActionToggleCollapse | NotebookActionSetOutputs | NotebookActionSetRenderedMarkdown;

type NotebookReducer = (cells: readonly NotebookCellModel[], action: NotebookReducerAction) => readonly NotebookCellModel[];

const NotebookContext = React.createContext<NotebookContextValue | null>(null);
const SelectionContext = React.createContext<NotebookSelectionContextValue | null>(null);
const ExecutionContext = React.createContext<NotebookExecutionContextValue | null>(null);

const ensureCodeCell = (cell: NotebookCellModel): cell is CodeCellModel => cell.type === 'code';
const ensureMarkdownCell = (cell: NotebookCellModel): cell is MarkdownCellModel => cell.type === 'markdown';

const defaultReducer: NotebookReducer = (state, action) => {
    switch (action.type) {
        case 'add': {
            const cells = [...state];
            if (action.afterId) {
                const targetIndex = cells.findIndex(cell => cell.id === action.afterId);
                if (targetIndex !== -1) {
                    cells.splice(targetIndex + 1, 0, action.cell);
                    return cells;
                }
            }
            if (action.afterId === null) {
                cells.unshift(action.cell);
                return cells;
            }
            cells.push(action.cell);
            return cells;
        }
        case 'remove':
            return state.filter(cell => cell.id !== action.id);
        case 'move': {
            const idx = state.findIndex(cell => cell.id === action.id);
            if (idx === -1) {
                return state;
            }
            const cells = [...state];
            const [cell] = cells.splice(idx, 1);
            const newIndex = action.direction === 'up' ? Math.max(0, idx - 1) : Math.min(cells.length, idx + 1);
            cells.splice(newIndex, 0, cell);
            return cells;
        }
        case 'updateContent':
            return state.map(cell => cell.id === action.id ? { ...cell, content: action.content } : cell);
        case 'updateLanguage':
            return state.map(cell => {
                if (cell.id !== action.id || !ensureCodeCell(cell)) {
                    return cell;
                }
                return { ...cell, language: action.language };
            });
        case 'toggleCollapse':
            return state.map(cell => cell.id === action.id ? { ...cell, collapsed: !cell.collapsed } : cell);
        case 'setOutputs':
            return state.map(cell => {
                if (cell.id !== action.id || !ensureCodeCell(cell)) {
                    return cell;
                }
                return { ...cell, outputs: action.outputs };
            });
        case 'setRendered':
            return state.map(cell => {
                if (cell.id !== action.id || !ensureMarkdownCell(cell)) {
                    return cell;
                }
                return { ...cell, rendered: action.markdown };
            });
    }
    return state;
};

const createDefaultCodeCell = (language: string): CodeCellModel => ({
    id: generateUuid(),
    type: 'code',
    language,
    content: '',
    outputs: [],
    createdAt: Date.now(),
});

const createDefaultMarkdownCell = (): MarkdownCellModel => ({
    id: generateUuid(),
    type: 'markdown',
    language: 'markdown',
    content: '',
    createdAt: Date.now(),
    collapsed: false,
});

const buildInitialCells = (runtime: NotebookRuntimeConfiguration, custom?: readonly NotebookCellModel[]): readonly NotebookCellModel[] => {
    if (custom && custom.length) {
        return [...custom];
    }
    return [
        createDefaultMarkdownCell(),
        createDefaultCodeCell(runtime.defaultLanguage)
    ];
};

export const NotebookProvider: React.FunctionComponent<NotebookProviderProps> = ({ children, initialCells, runtime = DEFAULT_RUNTIME_CONFIGURATION, executeCodeCell }) => {
    const runtimeConfiguration = runtime ?? DEFAULT_RUNTIME_CONFIGURATION;
    const initialStateRef = React.useRef<readonly NotebookCellModel[]>();
    if (!initialStateRef.current) {
        initialStateRef.current = buildInitialCells(runtimeConfiguration, initialCells);
    }

    const [cells, dispatch] = React.useReducer<NotebookReducer>(defaultReducer, initialStateRef.current);
    const [selectedId, setSelectedId] = React.useState<string | undefined>(() => initialStateRef.current?.[0]?.id);
    const [executing, setExecuting] = React.useState<Set<string>>(new Set());

    const cellsRef = React.useRef(cells);
    React.useEffect(() => {
        cellsRef.current = cells;
    }, [cells]);

    const executingRef = React.useRef(executing);
    React.useEffect(() => {
        executingRef.current = executing;
    }, [executing]);

    React.useEffect(() => {
        if (selectedId && !cells.some(cell => cell.id === selectedId)) {
            setSelectedId(cells[0]?.id);
        }
        if (!selectedId && cells.length) {
            setSelectedId(cells[0]?.id);
        }
    }, [cells, selectedId]);

    const contextValue = React.useMemo<NotebookContextValue>(() => ({
        cells,
        runtime: runtimeConfiguration,
        addCell: (type, afterId) => {
            const cell = type === 'code' ? createDefaultCodeCell(runtimeConfiguration.defaultLanguage) : createDefaultMarkdownCell();
            dispatch({ type: 'add', cell, afterId });
            setSelectedId(cell.id);
        },
        removeCell: id => {
            const removalIndex = cells.findIndex(cell => cell.id === id);
            dispatch({ type: 'remove', id });
            if (removalIndex !== -1) {
                const nextTarget = cells[removalIndex + 1] ?? cells[removalIndex - 1];
                setSelectedId(prev => prev === id ? nextTarget?.id : prev);
            }
        },
        moveCell: (id, direction) => {
            dispatch({ type: 'move', id, direction });
        },
        updateCellContent: (id, content) => {
            dispatch({ type: 'updateContent', id, content });
        },
        updateLanguage: (id, language) => {
            dispatch({ type: 'updateLanguage', id, language });
        },
        toggleCollapsed: id => {
            dispatch({ type: 'toggleCollapse', id });
        },
        setOutputs: (id, outputs) => {
            dispatch({ type: 'setOutputs', id, outputs });
        },
    }), [cells, runtimeConfiguration]);

    const selectionValue = React.useMemo<NotebookSelectionContextValue>(() => ({
        selectedId,
        selectCell: id => setSelectedId(id),
    }), [selectedId]);

    const runCell = React.useCallback(async (id: string) => {
        const cell = cellsRef.current.find(candidate => candidate.id === id);
        if (!cell || executingRef.current.has(id)) {
            return;
        }

        setExecuting(prev => {
            if (prev.has(id)) {
                return prev;
            }
            const next = new Set(prev);
            next.add(id);
            return next;
        });

        try {
            if (cell.type === 'code') {
                const outputs = executeCodeCell ? await executeCodeCell(cell) : await simulateExecution(cell);
                dispatch({ type: 'setOutputs', id: cell.id, outputs });
            } else {
                const rendered = new MarkdownString();
                rendered.appendMarkdown(cell.content || '*Empty markdown cell*');
                dispatch({ type: 'setRendered', id: cell.id, markdown: rendered });
            }
        } finally {
            setExecuting(prev => {
                if (!prev.has(id)) {
                    return prev;
                }
                const next = new Set(prev);
                next.delete(id);
                return next;
            });
        }
    }, [dispatch, executeCodeCell]);

    const runAll = React.useCallback(async () => {
        for (const cell of cellsRef.current) {
            await runCell(cell.id);
        }
    }, [runCell]);

    const executionValue = React.useMemo<NotebookExecutionContextValue>(() => ({
        executing,
        isExecuting: id => executing.has(id),
        runCell,
        runAll,
    }), [executing, runCell, runAll]);

    return (
        <NotebookContext.Provider value={contextValue}>
            <SelectionContext.Provider value={selectionValue}>
                <ExecutionContext.Provider value={executionValue}>
                    {children}
                </ExecutionContext.Provider>
            </SelectionContext.Provider>
        </NotebookContext.Provider>
    );
};

export const useNotebook = (): NotebookContextValue => {
    const context = React.useContext(NotebookContext);
    if (!context) {
        throw new Error('Notebook context is only available within a NotebookProvider.');
    }
    return context;
};

export const useNotebookSelection = (): NotebookSelectionContextValue => {
    const context = React.useContext(SelectionContext);
    if (!context) {
        throw new Error('Notebook selection context is only available within a NotebookProvider.');
    }
    return context;
};

export const useNotebookExecution = (): NotebookExecutionContextValue => {
    const context = React.useContext(ExecutionContext);
    if (!context) {
        throw new Error('Notebook execution context is only available within a NotebookProvider.');
    }
    return context;
};

const simulateExecution = async (cell: CodeCellModel): Promise<NotebookCellOutput[]> => {
    const trimmed = cell.content.trim();
    await timeout(50);
    if (!trimmed) {
        return [{ kind: 'text', text: `(${cell.language}) No code provided.` }];
    }
    if (looksLikeTable(trimmed)) {
        return [{ kind: 'table', headers: extractHeaders(trimmed), rows: extractRows(trimmed) }];
    }
    return [{ kind: 'text', text: trimmed }];
};

const looksLikeTable = (source: string): boolean => source.includes('|') && source.split('\n').some(line => line.trim().startsWith('|'));

const extractHeaders = (source: string): readonly string[] => {
    const lines = source.split('\n').map(line => line.trim()).filter(Boolean);
    const headerLine = lines[0];
    if (!headerLine) {
        return [];
    }
    return headerLine.split('|').map(part => part.trim()).filter(Boolean);
};

const extractRows = (source: string): readonly (readonly (string | number)[])[] => {
    const lines = source.split('\n').map(line => line.trim()).filter(Boolean);
    if (lines.length <= 1) {
        return [];
    }
    return lines.slice(1).map(line => line.split('|').map(cell => parseCellValue(cell.trim())).filter(value => value !== ''));
};

const parseCellValue = (value: string): string | number => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : value;
};
