/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as React from 'react';
import type { editor } from 'vs/editor/editor.api';
import type { IDisposable } from '../../../base/common/lifecycle.js';

export interface UseMonacoEditorOptions {
	readonly language: string;
	readonly value: string;
	readonly readOnly?: boolean;
	readonly ariaLabel?: string;
	readonly wordWrap?: 'on' | 'off';
	onChange?(value: string): void;
}

export interface UseMonacoEditorResult {
	readonly editor: editor.IStandaloneCodeEditor | null;
}

const monacoModulePromise = import('vs/editor/editor.api');

export const useMonacoEditor = (containerRef: React.RefObject<HTMLElement>, options: UseMonacoEditorOptions): UseMonacoEditorResult => {
	const editorRef = React.useRef<editor.IStandaloneCodeEditor | null>(null);
	const modelRef = React.useRef<editor.ITextModel | null>(null);
	const monacoRef = React.useRef<typeof import('vs/editor/editor.api')>();
	const changeDisposableRef = React.useRef<IDisposable | null>(null);
	const resizeObserverRef = React.useRef<ResizeObserver | null>(null);
	const suppressModelChange = React.useRef(false);
	const onChangeRef = React.useRef<UseMonacoEditorOptions['onChange']>(options.onChange);

	React.useEffect(() => {
		onChangeRef.current = options.onChange;
	}, [options.onChange]);

	React.useEffect(() => {
		let disposed = false;

		(async () => {
			const monaco = await monacoModulePromise;
			if (disposed || !containerRef.current) {
				return;
			}

			monacoRef.current = monaco;
			const model = monaco.editor.createModel(options.value ?? '', options.language);
			modelRef.current = model;

			const editorInstance = monaco.editor.create(containerRef.current, {
				model,
				automaticLayout: false,
				minimap: { enabled: false },
				scrollBeyondLastLine: false,
				fontSize: 14,
				renderLineHighlight: 'none',
				readOnly: options.readOnly ?? false,
				wordWrap: options.wordWrap ?? 'on',
				ariaLabel: options.ariaLabel ?? 'Notebook code editor'
			});

			editorRef.current = editorInstance;
			editorInstance.layout();

			if (onChangeRef.current) {
				changeDisposableRef.current = editorInstance.onDidChangeModelContent(() => {
					if (suppressModelChange.current) {
						suppressModelChange.current = false;
						return;
					}
					onChangeRef.current?.(editorInstance.getValue());
				});
			}

			resizeObserverRef.current = new ResizeObserver(() => {
				editorInstance.layout();
			});
			resizeObserverRef.current.observe(containerRef.current);
		})();

		return () => {
			disposed = true;
			changeDisposableRef.current?.dispose();
			changeDisposableRef.current = null;
			resizeObserverRef.current?.disconnect();
			resizeObserverRef.current = null;
			editorRef.current?.dispose();
			editorRef.current = null;
			modelRef.current?.dispose();
			modelRef.current = null;
		};
	// We only want to run this effect once to construct the editor instance.
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	React.useEffect(() => {
		const monaco = monacoRef.current;
		const model = modelRef.current;
		if (!monaco || !model) {
			return;
		}
		if (model.getLanguageId() !== options.language) {
			monaco.editor.setModelLanguage(model, options.language);
		}
	}, [options.language]);

	React.useEffect(() => {
		const editorInstance = editorRef.current;
		if (!editorInstance) {
			return;
		}
		const currentValue = editorInstance.getValue();
		if (currentValue === (options.value ?? '')) {
			return;
		}
		const selection = editorInstance.getSelection();
		suppressModelChange.current = true;
		editorInstance.setValue(options.value ?? '');
		if (selection) {
			editorInstance.setSelection(selection);
		}
	}, [options.value]);

	React.useEffect(() => {
		const editorInstance = editorRef.current;
		if (!editorInstance) {
			return;
		}
		editorInstance.updateOptions({
			readOnly: options.readOnly ?? false,
			wordWrap: options.wordWrap ?? 'on',
			ariaLabel: options.ariaLabel ?? 'Notebook code editor'
		});
	}, [options.readOnly, options.wordWrap, options.ariaLabel]);

	return { editor: editorRef.current };
};
