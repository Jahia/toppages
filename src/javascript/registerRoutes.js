import React from 'react';
import {registry} from '@jahia/ui-extender';

import {TopPagesSettings} from './components/TopPagesSettings';

/**
 * Register the administration route.
 *
 * `requiredPermission: 'admin'` is what the shell checks before it shows the entry and before it
 * mounts the route; it is deliberately the same gate the previous server-settings page carried.
 * It is not, however, the only one: every GraphQL field this screen calls is itself gated on
 * `administrationAccess`, because a client-side check protects nothing on its own.
 *
 * The target is unchanged - Administration > Server > Configuration - so the entry stays where
 * administrators already look for it.
 */
export const registerRoutes = () => {
    registry.add('adminRoute', 'top-pages-configuration', {
        targets: ['administration-server-configuration:88'],
        requiredPermission: 'admin',
        icon: window.jahia.moonstone.toIconComponent('Bar'),
        label: 'toppages:label',
        isSelectable: true,
        render: () => <TopPagesSettings/>
    });
};
