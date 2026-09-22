import {SETTINGS_URL, clearAllSiteConfigs, ensureModuleEnabled, ensureSettingsRoot, sel} from '../support/toppages';

/**
 * The administration screen edits a repository-wide configuration that every Top Pages component
 * on every site reads. Who can reach it is part of the module's contract, so it is asserted for
 * each class of caller -- including a positive control, without which a screen that never renders
 * for anybody would make all the negatives pass for the wrong reason.
 *
 * The gate being asserted here is the app shell's: jahia-administration only mounts a
 * server-scoped adminRoute when the caller has `administrationAccess` on `/` AND the route's own
 * `requiredPermission`. It is not the only gate, and deliberately not the one that matters most --
 * every GraphQL field behind this screen carries @GraphQLRequiresPermission, which 06-graphqlApi
 * asserts for the same three callers. A UI check alone protects nothing.
 */
describe('Administration access control', () => {
    before(() => {
        cy.login();
        ensureModuleEnabled();
        ensureSettingsRoot();
        clearAllSiteConfigs();
    });

    /**
     * Wait until the app shell has finished booting this module's remote, so that "the screen is
     * not there" means "it was refused" and not "it had not been rendered yet". The registry
     * entry is added by the module's own init(), so its presence proves the remote loaded and the
     * route was registered -- everything short of the permission check.
     */
    const waitForShell = () => {
        cy.window({timeout: 60000}).should(win => {
            // The app shell hangs its registry off window.jahia, which Cypress's AUTWindow type
            // does not know about; the cast is the narrowest way to say so.
            const jahia = (
                win as unknown as {jahia?: {uiExtender?: {registry?: {get: (type: string, key: string) => unknown}}}}
            ).jahia;
            expect(jahia?.uiExtender?.registry?.get('adminRoute', 'top-pages-configuration'), 'registered adminRoute')
                .to.not.be.undefined;
        });
    };

    it('renders the configuration screen for an administrator', () => {
        cy.login();
        cy.visit(SETTINGS_URL);
        waitForShell();
        cy.get(sel('toppages-settings')).should('be.visible');
        cy.get(sel('add-configuration')).should('be.visible');
    });

    it('offers the administrator the entry it registered in the server administration tree', () => {
        // The URL above is how the tests reach the screen; this is how an administrator does.
        // The route registers on `administration-server-configuration`, so it is a child of the
        // Configuration group, and jahia-administration only expands a group when something
        // inside it is already selected -- arriving on /jahia/administration shows it collapsed.
        cy.login();
        cy.visit('/jahia/administration');
        cy.contains('Configuration').should('be.visible').click();
        cy.contains('Top Pages').should('be.visible').click();

        cy.get(sel('toppages-settings')).should('be.visible');
        cy.url().should('include', '/administration/top-pages-configuration');
    });

    it('does not render the configuration screen for an anonymous visitor', () => {
        cy.logout();
        cy.visit(SETTINGS_URL, {failOnStatusCode: false});

        // An anonymous visitor never reaches the app shell at all: the very same URL answers 401
        // with Jahia's login form, so there is no registry, no route and no screen. Asserting the
        // login form as well as the absent screen is what stops this passing because the shell
        // simply had not booted yet -- it proves what WAS served, not only what was not.
        cy.get('#loginForm').should('exist');
        cy.get(sel('toppages-settings')).should('not.exist');
    });

    it('does not render the configuration screen for an editor', () => {
        cy.login('mathias', 'password');
        cy.visit(SETTINGS_URL, {failOnStatusCode: false});

        // Mathias gets the shell, and the module's route IS registered in it - the negative below
        // is therefore about the permission, not about a module that failed to load.
        waitForShell();
        cy.get(sel('toppages-settings')).should('not.exist');
        cy.get(sel('add-configuration')).should('not.exist');
    });
});
