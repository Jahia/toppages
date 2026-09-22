import {getNodeByPath} from '@jahia/cypress';
import {
    AWSTATS_REPORT_URL,
    ChildNode,
    SETTINGS_ROOT,
    clearAllSiteConfigs,
    deleteSiteConfig,
    ensureModuleEnabled,
    ensureSettingsRoot,
    listChildren,
    openSettings,
    readProperty,
    sel
} from '../support/toppages';

/**
 * The "Top Pages" administration screen: a React route registered into the Jahia app shell,
 * driving the module's GraphQL API.
 *
 * Everything here is driven through the UI, because the point is not that the API works -
 * 06-graphqlApi asserts that - but that an administrator can maintain the configuration the way
 * an administrator does. What is stored is then verified in the repository, because the screen
 * showing a row and the JCR holding the five properties are two different claims.
 */
describe('Administration - AWStats report configuration', () => {
    const reportName = 'e2e-settings-report';
    // Deliberately NOT a suffix of reportName: cy.contains() matches on substrings, so
    // 'e2e-settings-report-renamed' would keep satisfying contains('tr', reportName) and the
    // "old name is gone" assertion could never fail.
    const renamedReportName = 'e2e-renamed-report';

    const fillForm = (values: {
        name?: string;
        awStatsUrl?: string;
        includeFilter?: string;
        excludeFilter?: string;
        titleSeparator?: string;
    }) => {
        Object.entries(values).forEach(([field, value]) => {
            cy.get(sel(`field-${field}`)).clear();
            if (value !== '') {
                cy.get(sel(`field-${field}`)).type(value);
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
        cy.login();
        openSettings();

        cy.get(sel('add-configuration')).should('be.visible').click();

        cy.get(sel('field-name')).should('be.visible');
        cy.get(sel('field-awStatsUrl')).should('be.visible');
        cy.get(sel('field-includeFilter')).should('be.visible');
        cy.get(sel('field-excludeFilter')).should('be.visible');
        cy.get(sel('field-titleFromHTML')).should('exist');
        cy.get(sel('field-titleSeparator')).should('be.visible');
        cy.get(sel('submit-configuration')).should('be.visible');
    });

    it('rejects a configuration with no name and no report URL', () => {
        cy.login();
        openSettings();
        cy.get(sel('add-configuration')).click();

        cy.get(sel('submit-configuration')).click();

        // Both fields are required, so the screen must stay on the form with a message against
        // each of them -- and must not have sent a mutation, which the empty list below proves.
        cy.get(sel('configuration-form')).should('be.visible');
        cy.get(sel('error-name')).should('be.visible');
        cy.get(sel('error-awStatsUrl')).should('be.visible');

        cy.login();
        listChildren(SETTINGS_ROOT).then((children: ChildNode[]) => {
            expect(children, 'configurations after a refused submit').to.have.length(0);
        });
    });

    it('saves a new configuration and lists it', () => {
        cy.login();
        openSettings();
        cy.get(sel('add-configuration')).click();

        fillForm({
            name: reportName,
            awStatsUrl: AWSTATS_REPORT_URL,
            includeFilter: '^/sites/digitall',
            excludeFilter: '/files/',
            titleSeparator: '|'
        });
        cy.get(sel('field-titleFromHTML')).check();
        cy.get(sel('submit-configuration')).click();

        // Back on the list, with the new row rendered
        cy.get(sel(`configuration-row-${reportName}`)).within(() => {
            cy.contains('td', AWSTATS_REPORT_URL).should('exist');
            cy.contains('td', '^/sites/digitall').should('exist');
            cy.contains('td', '/files/').should('exist');
            cy.contains('td', 'true').should('exist');
            cy.contains('td', '|').should('exist');
        });
    });

    it('persists the configuration under /settings/top-pages', () => {
        // The list above proves what was rendered; this proves what was stored, which is what
        // ConfigurationUtil.getSiteConfig() will read back at render time.
        cy.login();
        readProperty(`${SETTINGS_ROOT}/${reportName}`, 'awStatsUrl').should('eq', AWSTATS_REPORT_URL);
        readProperty(`${SETTINGS_ROOT}/${reportName}`, 'includeFilter').should('eq', '^/sites/digitall');
        readProperty(`${SETTINGS_ROOT}/${reportName}`, 'excludeFilter').should('eq', '/files/');
        readProperty(`${SETTINGS_ROOT}/${reportName}`, 'titleFromHTML').should('eq', 'true');
        readProperty(`${SETTINGS_ROOT}/${reportName}`, 'titleSeparator').should('eq', '|');
    });

    it('reloads the saved values into the edit form', () => {
        cy.login();
        openSettings();

        cy.get(sel(`edit-${reportName}`)).click();

        cy.get(sel('field-name')).should('have.value', reportName);
        cy.get(sel('field-awStatsUrl')).should('have.value', AWSTATS_REPORT_URL);
        cy.get(sel('field-includeFilter')).should('have.value', '^/sites/digitall');
        cy.get(sel('field-excludeFilter')).should('have.value', '/files/');
        cy.get(sel('field-titleFromHTML')).should('be.checked');
        cy.get(sel('field-titleSeparator')).should('have.value', '|');
        cy.get(sel('submit-configuration')).should('be.visible');
    });

    it('does not create a second configuration with an existing name', () => {
        cy.login();
        openSettings();
        cy.get(sel('add-configuration')).click();

        fillForm({name: reportName, awStatsUrl: 'http://example.invalid/awstats.pl'});
        cy.get(sel('submit-configuration')).click();

        // TopPagesMutation turns ConfigurationUtil's DUPLICATE into a GraphQL error rather than a
        // silent overwrite, and the screen keeps the operator on the form with their input intact
        // -- which is the whole point of reporting the refusal instead of dropping it.
        cy.get(sel('error-message')).should('contain', 'already exists');
        cy.get(sel('field-name')).should('have.value', reportName);

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
        cy.login();
        openSettings();
        cy.get(sel(`edit-${reportName}`)).click();

        fillForm({
            name: renamedReportName,
            includeFilter: '^/sites/other',
            excludeFilter: '',
            titleSeparator: '-'
        });
        cy.get(sel('field-titleFromHTML')).uncheck();
        cy.get(sel('submit-configuration')).click();

        cy.get(sel(`configuration-row-${renamedReportName}`)).should('exist');
        cy.get(sel(`configuration-row-${reportName}`)).should('not.exist');

        cy.login();
        readProperty(`${SETTINGS_ROOT}/${renamedReportName}`, 'includeFilter').should('eq', '^/sites/other');
        readProperty(`${SETTINGS_ROOT}/${renamedReportName}`, 'titleFromHTML').should('eq', 'false');
        readProperty(`${SETTINGS_ROOT}/${renamedReportName}`, 'titleSeparator').should('eq', '-');
        getNodeByPath(`${SETTINGS_ROOT}/${reportName}`).then((result: {data?: {jcr?: {nodeByPath?: unknown}}}) => {
            expect(result?.data?.jcr?.nodeByPath, 'node under the old name').to.not.be.ok;
        });
    });

    it('deletes a configuration once the confirmation is accepted', () => {
        cy.login();
        openSettings();

        // Deleting asks first, in the page: the row is replaced by a confirmation carrying the
        // name, and nothing is sent until that confirmation is accepted.
        cy.get(sel(`delete-${renamedReportName}`)).click();
        cy.get(sel('delete-confirmation')).should('contain', renamedReportName);
        cy.get(sel('confirm-delete')).click();

        cy.get(sel(`configuration-row-${renamedReportName}`)).should('not.exist');
        cy.get(sel('empty-state')).should('be.visible');

        cy.login();
        getNodeByPath(`${SETTINGS_ROOT}/${renamedReportName}`).then(
            (result: {data?: {jcr?: {nodeByPath?: unknown}}}) => {
                expect(result?.data?.jcr?.nodeByPath, 'deleted configuration node').to.not.be.ok;
            }
        );
    });
});
