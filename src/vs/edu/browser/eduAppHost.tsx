/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Root } from 'react-dom/client';
import { createRoot } from 'react-dom/client';
import { AppShell } from './components/AppShell.js';
import './media/eduShell.css';

const ROOT_ELEMENT_ID = 'edu-workbench-root';

let root: Root | undefined;

export function bootstrapEduWorkbench(): void {
	const container = document.getElementById(ROOT_ELEMENT_ID);
	if (!container) {
		throw new Error(`Failed to initialise education workspace: missing #${ROOT_ELEMENT_ID} container.`);
	}

	if (!root) {
		root = createRoot(container);
	}

	root.render(<AppShell />);
}
