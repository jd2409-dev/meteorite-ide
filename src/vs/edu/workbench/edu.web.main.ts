/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { bootstrapEduWorkbench } from '../browser/eduAppHost.js';

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => bootstrapEduWorkbench());
} else {
    bootstrapEduWorkbench();
}
