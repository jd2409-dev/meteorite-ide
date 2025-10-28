/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { NotebookShell } from './components/NotebookShell.js';

export interface NotebookBootstrapHandle {
	dispose(): void;
}

let currentRoot: Root | undefined;

export const bootstrapNotebookExperience = (container: HTMLElement): NotebookBootstrapHandle => {
	if (currentRoot) {
		currentRoot.unmount();
	}

	currentRoot = createRoot(container);
	currentRoot.render(React.createElement(NotebookShell));

	return {
		dispose: () => {
			if (currentRoot) {
				currentRoot.unmount();
				currentRoot = undefined;
			}
		}
	};
};
