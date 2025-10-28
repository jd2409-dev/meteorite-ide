/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { FC } from 'react';

export const SidebarHost: FC = () => {
	return (
		<aside className="edu-shell__sidebar" aria-label="Learning sidebar">
			<section className="edu-shell__sidebar-section">
				<div className="edu-shell__sidebar-title">Lesson outline</div>
				<p className="edu-shell__sidebar-empty">
					Navigation for units, checkpoints, and instructor notes will live here. Use this area to switch between
					lab steps or to review prerequisite material.
				</p>
			</section>
			<section className="edu-shell__sidebar-section">
				<div className="edu-shell__sidebar-title">Resources</div>
				<p className="edu-shell__sidebar-empty">
					Pinned references, sample solutions, and collaboration widgets will be surfaced alongside the notebook so
					students always have the right context.
				</p>
			</section>
		</aside>
	);
};
