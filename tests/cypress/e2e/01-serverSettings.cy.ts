import {getNodeByPath} from '@jahia/cypress';
import {
    AWSTATS_REPORT_URL,
    ChildNode,
    SETTINGS_ROOT,
    SETTINGS_URL,
    clearAllSiteConfigs,
    deleteSiteConfig,
    ensureModuleEnabled,
    ensureSettingsRoot,
    listChildren,
    readProperty
} from '../support/toppages';

/**
 * The "Top Pages Configuration" server-settings page (a Spring WebFlow rendered by
 * SiteconfigFlowHandler). Everything here is driven through the form, because this page
 * has no API of its own -- the only way to prove an administrator can maintain the
 * configuration is to maintain it the way an administrator does.
 */
describe('Server settings - AWStats report configuration', () => {
    const reportName = 'e2e-settings-report';
    // Deliberately NOT a suffix of reportName: cy.contains() matches on substrings, so
    // 'e2e-settings-report-renamed' would keep satisfying contains('tr', reportName) and
    // the "old name is gone" assertion could never fail.
    const renamedReportName = 'e2e-renamed-report';

    const openSettings = () => {
        cy.login();
        cy.visit(SETTINGS_URL);
    };

    const fillForm = (values: {
        siteName?: string;
        reportUrl?: string;
        includeFilter?: string;
        excludeFilter?: string;
        titleSeparator?: string;
    }) => {
        Object.entries(values).forEach(([field, value]) => {
            cy.get(`#${field}`).clear();
            if (value !== '') {
                cy.get(`#${field}`).type(value);
            }
        });
    };

    before(() => {
        cy.login();
        ensureModuleEnabled();
        ensureSettingsRoot();
        // The delete test asserts the empty state, so the suite must own the whole list.
        clearAllSiteConfigs();
    });

    after(() => {
        cy.login();
        deleteSiteConfig(reportName);
        deleteSiteConfig(renamedReportName);
    });

    it('renders the configuration form with every AWStats field', () => {
        openSettings();

        cy.get('#createSiteConfig').should('be.visible').click();

        cy.get('#siteName').should('be.visible');
        cy.get('#reportUrl').should('be.visible');
        cy.get('#includeFilter').should('be.visible');
        cy.get('#excludeFilter').should('be.visible');
        cy.get('#titleFromHTML').should('exist');
        cy.get('#titleSeparator').should('be.visible');
        cy.get('button[name="_eventId_saveSiteConfig"]').should('be.visible');
    });

    it('rejects a configuration with no name and no report URL', () => {
        openSettings();
        cy.get('#createSiteConfig').click();

        // Both fields carry @NotEmpty on SiteConfiguration, and the transition is
        // validate="true", so the flow must stay on the form.
        cy.get('button[name="_eventId_saveSiteConfig"]').click();

        cy.get('#siteName').should('be.visible');
        cy.contains('Please enter a Site Name').should('be.visible');
        cy.contains('Please enter the awstats URL').should('be.visible');
    });

    it('saves a new configuration and lists it', () => {
        openSettings();
        cy.get('#createSiteConfig').click();

        fillForm({
            siteName: reportName,
            reportUrl: AWSTATS_REPORT_URL,
            includeFilter: '^/sites/digitall',
            excludeFilter: '/files/',
            titleSeparator: '|'
        });
        cy.get('#titleFromHTML').check();
        cy.get('button[name="_eventId_saveSiteConfig"]').click();

        // Back on the list view, with the new row rendered
        cy.contains('tr', reportName).within(() => {
            cy.contains('td', AWSTATS_REPORT_URL).should('exist');
            cy.contains('td', '^/sites/digitall').should('exist');
            cy.contains('td', '/files/').should('exist');
            cy.contains('td', 'true').should('exist');
        });
    });

    it('persists the configuration under /settings/top-pages', () => {
        // The list view above proves what was rendered; this proves what was stored,
        // which is what ConfigurationUtil.getSiteConfig() will read back at render time.
        cy.login();
        readProperty(`${SETTINGS_ROOT}/${reportName}`, 'awStatsUrl').should('eq', AWSTATS_REPORT_URL);
        readProperty(`${SETTINGS_ROOT}/${reportName}`, 'includeFilter').should('eq', '^/sites/digitall');
        readProperty(`${SETTINGS_ROOT}/${reportName}`, 'excludeFilter').should('eq', '/files/');
        readProperty(`${SETTINGS_ROOT}/${reportName}`, 'titleFromHTML').should('eq', 'true');
        readProperty(`${SETTINGS_ROOT}/${reportName}`, 'titleSeparator').should('eq', '|');
    });

    it('reloads the saved values into the edit form', () => {
        openSettings();

        cy.contains('tr', reportName).find('button[name="_eventId_editSiteConfig"]').click();

        cy.get('#siteName').should('have.value', reportName);
        cy.get('#reportUrl').should('have.value', AWSTATS_REPORT_URL);
        cy.get('#includeFilter').should('have.value', '^/sites/digitall');
        cy.get('#excludeFilter').should('have.value', '/files/');
        cy.get('#titleFromHTML').should('be.checked');
        cy.get('#titleSeparator').should('have.value', '|');
        cy.get('button[name="_eventId_updateSiteConfig"]').should('be.visible');
    });

    it('does not create a second configuration with an existing name', () => {
        openSettings();
        cy.get('#createSiteConfig').click();

        fillForm({siteName: reportName, reportUrl: 'http://example.invalid/awstats.pl'});
        cy.get('button[name="_eventId_saveSiteConfig"]').click();

        // SaveSiteConfiguration() catches the ItemExistsException and adds an error to the
        // MessageContext. Web Flow aborts a validate="true" transition when the context
        // holds errors, so the flow stays on the form and validation.jspf renders the
        // message -- the edits are not lost and the existing configuration is untouched.
        cy.contains('This site name already exists').should('be.visible');
        cy.get('#siteName').should('have.value', reportName);

        cy.login();
        readProperty(`${SETTINGS_ROOT}/${reportName}`, 'awStatsUrl').should('eq', AWSTATS_REPORT_URL);
        listChildren(SETTINGS_ROOT).then((children: ChildNode[]) => {
            expect(
                children.filter(c => c.name === reportName),
                'configurations with that name'
            ).to.have.length(1);
        });
    });

    it('renames a configuration and rewrites its properties', () => {
        openSettings();
        cy.contains('tr', reportName).find('button[name="_eventId_editSiteConfig"]').click();

        fillForm({
            siteName: renamedReportName,
            includeFilter: '^/sites/other',
            excludeFilter: '',
            titleSeparator: '-'
        });
        cy.get('#titleFromHTML').uncheck();
        cy.get('button[name="_eventId_updateSiteConfig"]').click();

        cy.contains('tr', renamedReportName).should('exist');
        cy.contains('tr', reportName).should('not.exist');

        cy.login();
        readProperty(`${SETTINGS_ROOT}/${renamedReportName}`, 'includeFilter').should('eq', '^/sites/other');
        readProperty(`${SETTINGS_ROOT}/${renamedReportName}`, 'titleFromHTML').should('eq', 'false');
        readProperty(`${SETTINGS_ROOT}/${renamedReportName}`, 'titleSeparator').should('eq', '-');
        getNodeByPath(`${SETTINGS_ROOT}/${reportName}`).then((result: {data?: {jcr?: {nodeByPath?: unknown}}}) => {
            expect(result?.data?.jcr?.nodeByPath, 'node under the old name').to.not.be.ok;
        });
    });

    it('deletes a configuration once the confirmation is accepted', () => {
        openSettings();

        // The onClick handler raises a window.confirm; Cypress accepts it by default,
        // which is what sets the confirmDelete field the handler checks for.
        cy.contains('tr', renamedReportName).find('button[name="_eventId_deleteSiteConfig"]').click();

        cy.contains('tr', renamedReportName).should('not.exist');
        cy.contains('No site configuration found').should('be.visible');

        cy.login();
        getNodeByPath(`${SETTINGS_ROOT}/${renamedReportName}`).then(
            (result: {data?: {jcr?: {nodeByPath?: unknown}}}) => {
                expect(result?.data?.jcr?.nodeByPath, 'deleted configuration node').to.not.be.ok;
            }
        );
    });
});
