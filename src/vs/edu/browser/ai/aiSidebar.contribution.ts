/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../base/common/codicons.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { localize, localize2 } from '../../../nls.js';
import { SyncDescriptor } from '../../../platform/instantiation/common/descriptors.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../workbench/common/contributions.js';
import { Extensions as ViewExtensions, IViewContainersRegistry, IViewDescriptor, IViewsRegistry, ViewContainer, ViewContainerLocation } from '../../../workbench/common/views.js';
import { ViewPaneContainer } from '../../../workbench/browser/parts/views/viewPaneContainer.js';
import { Registry } from '../../../platform/registry/common/platform.js';
import { AiSidebarView } from './aiSidebarView.js';
import { IAiService, RestAiProvider } from '../../common/services/aiService.js';
import { IConfigurationService, IConfigurationNode, IConfigurationRegistry, Extensions as ConfigurationExtensions } from '../../../platform/configuration/common/configuration.js';
import { NOTEBOOK_OR_COMPOSITE_IS_ACTIVE_EDITOR } from '../../../workbench/contrib/notebook/common/notebookContextKeys.js';
import { IWorkbenchContribution } from '../../../workbench/common/contributions.js';

const AI_VIEW_CONTAINER_ID = 'workbench.view.edu.ai';
export const AI_SIDEBAR_VIEW_ID = 'workbench.view.edu.ai.sidebar';

const viewContainer: ViewContainer = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry).registerViewContainer({
    id: AI_VIEW_CONTAINER_ID,
    title: localize2('edu.ai.sidebar.containerTitle', "AI"),
    icon: Codicon.sparkle,
    ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [AI_VIEW_CONTAINER_ID, { mergeViewWithContainerWhenSingleView: true }]),
    hideIfEmpty: false,
    order: 50,
    storageId: AI_VIEW_CONTAINER_ID
}, ViewContainerLocation.AuxiliaryBar, { doNotRegisterOpenCommand: false });

const aiSidebarViewDescriptor: IViewDescriptor = {
    id: AI_SIDEBAR_VIEW_ID,
    name: localize2('edu.ai.sidebar.viewTitle', "Notebook AI Assistant"),
    containerIcon: viewContainer.icon,
    containerTitle: viewContainer.title.value,
    singleViewPaneContainerTitle: viewContainer.title.value,
    ctorDescriptor: new SyncDescriptor(AiSidebarView),
    when: NOTEBOOK_OR_COMPOSITE_IS_ACTIVE_EDITOR,
    canToggleVisibility: true,
    canMoveView: true,
    order: 1
};

Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry).registerViews([aiSidebarViewDescriptor], viewContainer);

const configuration: IConfigurationNode = {
    id: 'edu.ai',
    title: localize2('edu.ai.configuration.title', "Educational AI"),
    type: 'object',
    order: 100,
    properties: {
        'edu.ai.provider': {
            type: 'string',
            enum: ['rest'],
            default: 'rest',
            description: localize('edu.ai.configuration.providerDescription', "Identifier of the AI provider used by the educational assistant."),
        },
        'edu.ai.rest.endpoint': {
            type: 'string',
            default: '',
            description: localize('edu.ai.configuration.endpointDescription', "HTTPS endpoint for the REST AI provider, for example https://example.com/v1/chat."),
        },
        'edu.ai.rest.apiKey': {
            type: 'string',
            default: '',
            description: localize('edu.ai.configuration.apiKeyDescription', "Authentication token for the REST AI provider. Leave empty when the endpoint does not require authentication."),
        },
        'edu.ai.rest.useStreaming': {
            type: 'boolean',
            default: true,
            description: localize('edu.ai.configuration.streamingDescription', "When enabled, responses from the REST AI provider are streamed to the UI as they arrive."),
        },
        'edu.ai.rest.headers': {
            type: 'object',
            default: {},
            markdownDescription: localize('edu.ai.configuration.headersDescription', "Additional HTTP headers to include with requests to the REST AI provider. The object should map header names to string values."),
        },
    }
};

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration(configuration);

class AiProviderConfigurationContribution extends Disposable implements IWorkbenchContribution {
    static readonly ID = 'workbench.contrib.eduAiProviderConfiguration';

    private signature: string | undefined;

    constructor(
        @IAiService private readonly aiService: IAiService,
        @IConfigurationService private readonly configurationService: IConfigurationService
    ) {
        super();
        this.applyConfiguration();
        this._register(this.configurationService.onDidChangeConfiguration(event => {
            if (event.affectsConfiguration('edu.ai')) {
                this.applyConfiguration();
            }
        }));
    }

    private applyConfiguration(): void {
        const providerId = this.configurationService.getValue<string>('edu.ai.provider');
        if (providerId !== 'rest') {
            return;
        }

        const endpoint = this.configurationService.getValue<string>('edu.ai.rest.endpoint')?.trim();
        const apiKey = this.configurationService.getValue<string>('edu.ai.rest.apiKey')?.trim();
        const useStreaming = this.configurationService.getValue<boolean>('edu.ai.rest.useStreaming');
        const headers = this.configurationService.getValue<Record<string, string>>('edu.ai.rest.headers') ?? {};

        if (!endpoint) {
            return;
        }

        const signature = JSON.stringify({ endpoint, apiKey, useStreaming, headers });
        if (signature === this.signature) {
            return;
        }

        this.signature = signature;

        const provider = new RestAiProvider({
            endpoint,
            apiKey: apiKey || undefined,
            headers,
            stream: useStreaming
        });

        this.aiService.registerProvider(provider);
        this.aiService.setActiveProvider(provider.id);
    }
}

registerWorkbenchContribution2(AiProviderConfigurationContribution, { id: AiProviderConfigurationContribution.ID, phase: WorkbenchPhase.Restored });
