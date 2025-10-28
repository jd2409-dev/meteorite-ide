/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { FC } from 'react';

export const MainPane: FC = () => {
	return (
		<main className="edu-shell__main" role="main">
			<h2>Notebook workspace</h2>
			<div className="edu-shell__placeholder" aria-live="polite">
				<div className="edu-shell__placeholder-title">Your learning notebook will appear here</div>
				<p className="edu-shell__placeholder-body">
					This placeholder keeps the layout stable while lesson notebooks and interactive exercises are loading.
					Integrations with trusted notebooks, assessments, and progress tracking will render in this space in
					a future milestone.
				</p>
			</div>
		</main>
	);
};
