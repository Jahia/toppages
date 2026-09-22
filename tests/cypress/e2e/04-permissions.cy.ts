import {SETTINGS_URL, clearAllSiteConfigs, ensureModuleEnabled, ensureSettingsRoot} from '../support/toppages';

/**
 * The server-settings page edits a repository-wide configuration that every Top Pages
 * component on every site reads. Who can reach it is part of the module's contract, so it
 * is asserted for each class of caller -- including a positive control, without which a
 * blanket 404 would make all the negatives pass for the wrong reason.
 */
describe('Server settings access control', () => {
    const formMarker = '_eventId_newSiteConfig';

    before(() => {
        cy.login();
        ensureModuleEnabled();
        ensureSettingsRoot();
        clearAllSiteConfigs();
    });

    const requestSettingsPage = () =>
        cy.request({
            url: SETTINGS_URL,
            failOnStatusCode: false,
            followRedirect: true
        });

    it('serves the configuration form to an administrator', () => {
        cy.login();
        requestSettingsPage().then(response => {
            expect(response.status).to.eq(200);
            expect(response.body).to.contain(formMarker);
        });
    });

    it('does not serve the configuration form to an anonymous visitor', () => {
        cy.logout();
        requestSettingsPage().then(response => {
            expect(String(response.body), 'anonymous response body').to.not.contain(formMarker);
        });
    });

    it('does not serve the configuration form to an editor', () => {
        cy.login('mathias', 'password');
        requestSettingsPage().then(response => {
            expect(String(response.body), 'editor response body').to.not.contain(formMarker);
        });
    });
});
