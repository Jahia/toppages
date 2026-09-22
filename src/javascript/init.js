import {registry} from '@jahia/ui-extender';
import i18next from 'i18next';

import {registerRoutes} from './registerRoutes';

/**
 * Entry point of the Module Federation remote, exposed as './init'.
 *
 * The app shell calls it on every remote before it boots, and what it must do is register a
 * callback on the `jahiaApp-init` target rather than touch the registry straight away: at this
 * point the shell has only initialised the shared scope, and the registry entries the routes
 * depend on (the administration navigation targets) do not exist yet.
 */
export default function () {
    registry.add('callback', 'toppages', {
        targets: ['jahiaApp-init:88'],
        callback: async () => {
            // The namespace is served from the module's own static resources, at
            // /modules/toppages/javascript/locales/<lang>.json.
            await i18next.loadNamespaces('toppages');
            registerRoutes();
        }
    });
}
