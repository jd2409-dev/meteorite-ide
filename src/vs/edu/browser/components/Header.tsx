/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { FC } from 'react';

export const Header: FC = () => {
	return (
		<header className="edu-shell__header" role="banner">
			<div>
				<div className="edu-shell__title">VS Code for Education</div>
				<div className="edu-shell__tagline">A focused workspace for lessons, labs, and notebooks.</div>
			</div>
			<div className="edu-shell__cta-row" role="group" aria-label="Quick actions">
				<button className="edu-shell__cta-button" type="button">Start Notebook</button>
				<button className="edu-shell__cta-button edu-shell__cta-button--secondary" type="button">Browse Modules</button>
			</div>
		</header>
	);
};
