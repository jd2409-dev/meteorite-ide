/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as React from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as sinon from 'sinon';
import { NotebookShell } from '../../browser/components/NotebookShell.js';
import type { editor } from 'vs/editor/editor.api';

suite('Notebook components', () => {

    afterEach(() => {
        cleanup();
        sinon.restore();
    });

    test('allows adding and removing cells', async () => {
        const user = userEvent.setup();
        render(React.createElement(NotebookShell));

        const initialCodeCells = screen.getAllByText('Code cell').length;
        await user.click(screen.getByRole('button', { name: 'Add code cell' }));

        await waitFor(() => {
            assert.strictEqual(screen.getAllByText('Code cell').length, initialCodeCells + 1);
        });

        const removeButtons = screen.getAllByRole('button', { name: 'Delete code cell' });
        await user.click(removeButtons[removeButtons.length - 1]);

        await waitFor(() => {
            assert.strictEqual(screen.getAllByText('Code cell').length, initialCodeCells);
        });
    });

    test('changes language via dropdown control', async () => {
        const user = userEvent.setup();
        render(React.createElement(NotebookShell));

        const languageSelect = screen.getAllByRole('combobox')[0] as HTMLSelectElement;
        await user.selectOptions(languageSelect, 'java');

        assert.strictEqual(languageSelect.value, 'java');
    });

    test('creates and disposes Monaco editors within lifecycle', async () => {
        const monaco = await import('vs/editor/editor.api');
        const user = userEvent.setup();

        let currentValue = '';
        let currentLanguage = 'python';
        const modelDisposeSpy = sinon.spy();
        const editorDisposeSpy = sinon.spy();

        const modelStub = {
            dispose: modelDisposeSpy,
            getLanguageId: () => currentLanguage
        } as unknown as editor.ITextModel;

        sinon.stub(monaco.editor, 'createModel').callsFake((value: string, languageId: string) => {
            currentValue = value;
            currentLanguage = languageId;
            return modelStub;
        });

        sinon.stub(monaco.editor, 'setModelLanguage').callsFake((_model, languageId: string) => {
            currentLanguage = languageId;
        });

        const changeListeners: Array<() => void> = [];

        const editorStub = {
            dispose: editorDisposeSpy,
            layout: sinon.spy(),
            setValue: (value: string) => {
                currentValue = value;
                changeListeners.forEach(listener => listener());
            },
            getValue: () => currentValue,
            getModel: () => modelStub,
            updateOptions: sinon.spy(),
            setSelection: () => undefined,
            getSelection: () => null,
            onDidChangeModelContent: (listener: () => void) => {
                changeListeners.push(listener);
                return {
                    dispose: () => {
                        const index = changeListeners.indexOf(listener);
                        if (index >= 0) {
                            changeListeners.splice(index, 1);
                        }
                    }
                };
            },
            focus: () => undefined,
            trigger: () => false
        } as unknown as editor.IStandaloneCodeEditor;

        sinon.stub(monaco.editor, 'create').returns(editorStub);

        render(React.createElement(NotebookShell));

        await waitFor(() => {
            assert.ok((monaco.editor.create as sinon.SinonStub).called);
        });

        const deleteButtons = screen.getAllByRole('button', { name: 'Delete code cell' });
        await user.click(deleteButtons[0]!);

        await waitFor(() => {
            assert.ok(editorDisposeSpy.called, 'editor dispose should be invoked');
            assert.ok(modelDisposeSpy.called, 'model dispose should be invoked');
        });
    });
});
