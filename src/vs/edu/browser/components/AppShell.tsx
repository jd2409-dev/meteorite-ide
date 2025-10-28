/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { FC } from 'react';
import { Header } from './Header.js';
import { MainPane } from './MainPane.js';
import { SidebarHost } from './SidebarHost.js';

export const AppShell: FC = () => {
    return (
        <div className="edu-shell">
            <Header />
            <div className="edu-shell__content">
                <MainPane />
                <SidebarHost />
            </div>
        </div>
    );
};
