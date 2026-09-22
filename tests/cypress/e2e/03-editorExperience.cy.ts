import {
    AWSTATS_REPORT_URL,
    LANGUAGE,
    SITE_KEY,
    clearAllSiteConfigs,
    createSiteConfig,
    createTopPagesNode,
    ensureModuleEnabled,
    ensureSettingsRoot,
    removeNodeIfPresent
} from '../support/toppages';

/**
 * What an editor sees of this module in jContent.
 *
 * Asserted through the browser rather than through GraphQL: a query only proves what we
 * believe jContent asks for, and the content browser's type filters are not the ones the
 * content picker uses. jtopmix:topPages is jmix:editorialContent (via jtopmix:JahiaTopPages),
 * which is exactly what the default flat Content view filters on.
 *
 * NOT covered here: the "Select report" choice list fed by
 * org.jahia.modules.ChoiceListInitializer. See the "Known gap" section of tests/README.md --
 * the platform image under test exposes no Content Editor forms API at all, so there is
 * currently no way to exercise a ChoiceListInitializer from a test.
 */
describe('Editor experience', () => {
    const reportName = 'e2e-editor-report';
    const contentsPath = `/sites/${SITE_KEY}/contents`;
    const nodeName = 'e2e-top-pages-in-jcontent';
    const nodeTitle = 'Most visited pages';
    const nodePath = `${contentsPath}/${nodeName}`;
    const contentsUrl = `/jahia/jcontent/${SITE_KEY}/${LANGUAGE}/content-folders/contents`;

    before(() => {
        cy.login();
        ensureModuleEnabled();
        ensureSettingsRoot();
        clearAllSiteConfigs();
        createSiteConfig(reportName, {awStatsUrl: AWSTATS_REPORT_URL});
        removeNodeIfPresent(nodePath);
        createTopPagesNode(contentsPath, nodeName, {jahiaSite: reportName, title: nodeTitle});
    });

    after(() => {
        cy.login();
        removeNodeIfPresent(nodePath);
        clearAllSiteConfigs();
    });

    it('lists the Top Pages content in jContent for an administrator', () => {
        cy.login();
        cy.visit(contentsUrl);
        // The jContent list shows the display title, not the JCR node name.
        cy.get('[data-cm-role="table-content-list-cell-name"]').should('contain.text', nodeTitle);
    });

    it('labels the content type from the module resource bundle', () => {
        // Proves resources/toppages.properties is picked up: without `jtopmix_topPages`
        // the Type column would read the raw node type instead of "Top Pages".
        cy.login();
        cy.visit(contentsUrl);
        cy.contains('tr', nodeTitle).should('contain.text', 'Top Pages');
        cy.contains('tr', nodeTitle).should('not.contain.text', 'jtopmix:topPages');
    });

    it('lists the Top Pages content in jContent for a plain editor', () => {
        // The root user is the JCR system user and bypasses the access manager entirely, so the
        // tests above prove nothing about what an ordinary editor may see. mathias does.
        cy.login('mathias', 'password');
        cy.visit(contentsUrl);
        cy.get('[data-cm-role="table-content-list-cell-name"]').should('contain.text', nodeTitle);
    });
});
