import {addNode, publishAndWaitJobEnding, setNodeProperty} from '@jahia/cypress';
import {
    AWSTATS_BASE_URL,
    AWSTATS_REPORT_URL,
    LANGUAGE,
    SITE_KEY,
    callAction,
    clearAllSiteConfigs,
    createSiteConfig,
    createTopPagesNode,
    ensureModuleEnabled,
    ensureSettingsRoot,
    removeNodeIfPresent
} from '../support/toppages';

/**
 * The component's own view, jtopmix_topPages/html/topPages.jsp.
 *
 * Nothing else in the suite renders it: 02-topPagesActions drives the two actions over
 * HTTP, which leaves the whole browser half of the component -- the button, the ajax call
 * it fires and the list the script builds -- unasserted. A broken data attribute, a
 * JavaScript error or a POST that never leaves the page would not fail a single other test.
 *
 * The component is placed in `area-main` of a page of its own, because that is the area
 * Digitall's `home` template actually renders; a content node dropped straight under the
 * page node is never reached by the template.
 */
describe('Top Pages component view', () => {
    const reportName = 'e2e-view-report';
    const pageName = 'toppages-view-e2e';
    const homePath = `/sites/${SITE_KEY}/home`;
    const pagePath = `${homePath}/${pageName}`;
    const areaName = 'area-main';
    const areaPath = `${pagePath}/${areaName}`;

    const nodeName = 'top-pages-view';
    const nodePath = `${areaPath}/${nodeName}`;
    const nodeTitle = 'Most visited pages';

    // The script derives every id from the node name and its parent's name, so the
    // selectors below are the contract between the JSP's <c:set> block and its script.
    const resultId = `result-${nodeName}-${areaName}`;
    const buttonId = `updateBtn-${nodeName}-${areaName}`;

    // A node of its own: mutating customCSS on the shared node would leave every later
    // assertion of the `topPages` fallback broken if this test ever failed mid-way.
    const cssNodeName = 'top-pages-view-css';
    const cssNodePath = `${areaPath}/${cssNodeName}`;
    const cssResultId = `result-${cssNodeName}-${areaName}`;
    const cssClass = 'topPagesCustom';

    const xssNodeName = 'top-pages-view-xss';
    const xssNodePath = `${areaPath}/${xssNodeName}`;
    const xssResultId = `result-${xssNodeName}-${areaName}`;
    const xssButtonId = `updateBtn-${xssNodeName}-${areaName}`;
    // A stored title is content: an editor can write this, and the view used to build its
    // markup by string concatenation, so it used to execute.
    const xssTitle = '<img src=x onerror="window.__toppagesXss = true">Most visited';

    // Saving a jtopmix:topPages node fires the module's Drools rule, which fills jsonResult
    // straight away -- so the list is already on screen before the button is ever pressed.
    // Overwriting it with this sentinel first is what makes the click assertions mean
    // something, and it doubles as the assertion that a stored result renders on load.
    const sentinel = {topPages: [{title: 'Sentinel', href: 'http://awstats/sentinel.html', count: 42}]};

    // Straight out of tests/assets/awstats/awstats.pl, in descending hit-count order.
    const expectedTitles = ['Home', 'Our company', 'Contact us', 'News and events', 'Legal notice'];
    const expectedHrefs = [
        `${AWSTATS_BASE_URL}/pages/home.html`,
        `${AWSTATS_BASE_URL}/pages/our-company.html`,
        `${AWSTATS_BASE_URL}/pages/contact-us.html`,
        `${AWSTATS_BASE_URL}/pages/news-and-events.html`,
        `${AWSTATS_BASE_URL}/pages/legal-notice.html`
    ];

    const editModeUrl = `/cms/edit/default/${LANGUAGE}${pagePath}.html`;
    const liveUrl = `/cms/render/live/${LANGUAGE}${pagePath}.html`;

    /**
     * The rendered page inside jContent's Page Builder.
     *
     * Visiting a /cms/edit/ url does not stay there: Jahia sends the browser on to
     * /jahia/jcontent/<site>/<lang>/pages/... and renders the page inside an iframe, so
     * every assertion about the view in edit mode has to reach into that document. This is
     * also the only place the "Update Top Pages" button exists, since the JSP wraps it in
     * <c:if test="${renderContext.editMode}">.
     */
    const pageBuilder = (): Cypress.Chainable =>
        cy
            .get('iframe[data-sel-role="page-builder-frame-active"]', {timeout: 120000})
            .its('0.contentDocument.body')
            .should('not.be.empty')
            .then(cy.wrap);

    before(() => {
        cy.login();
        ensureModuleEnabled();
        ensureSettingsRoot();
        clearAllSiteConfigs();
        createSiteConfig(reportName, {awStatsUrl: AWSTATS_REPORT_URL});

        removeNodeIfPresent(pagePath);
        addNode({
            parentPathOrId: homePath,
            name: pageName,
            primaryNodeType: 'jnt:page',
            properties: [
                {name: 'jcr:title', type: 'STRING', value: 'Top Pages view', language: LANGUAGE},
                {name: 'j:templateName', type: 'STRING', value: 'home'}
            ]
        });
        addNode({parentPathOrId: pagePath, name: areaName, primaryNodeType: 'jnt:contentList'});

        createTopPagesNode(areaPath, nodeName, {
            jahiaSite: reportName,
            title: nodeTitle,
            numberOfResults: 5,
            nMonths: 1
        });
        createTopPagesNode(areaPath, xssNodeName, {
            jahiaSite: reportName,
            title: xssTitle,
            numberOfResults: 5,
            nMonths: 1
        });
    });

    after(() => {
        cy.login();
        removeNodeIfPresent(pagePath);
        clearAllSiteConfigs();
    });

    it('offers the Update Top Pages button in edit mode', () => {
        cy.login();
        cy.visit(editModeUrl);
        pageBuilder().find(`#${buttonId}`).should('be.visible').and('contain.text', 'Update Top Pages');
        // The result div carries everything the script reads; a data attribute that is
        // missing or misspelled leaves the component silently inert, which is exactly the
        // failure mode the rewrite of this view could introduce.
        pageBuilder()
            .find(`#${resultId}`)
            .should('have.attr', 'data-title', nodeTitle)
            .and('have.attr', 'data-list-class', 'topPages')
            .and($div => {
                expect($div.attr('data-update-url')).to.match(new RegExp(`${nodePath}\\.updateTopPages\\.do$`));
            });
    });

    it('renders the report ranked by hit count when the button is clicked', () => {
        cy.login();
        setNodeProperty(nodePath, 'jsonResult', JSON.stringify(sentinel), LANGUAGE);
        cy.visit(editModeUrl);
        pageBuilder().find(`#${resultId} ul.topPages li`).should('have.length', 1).and('have.text', 'Sentinel');

        pageBuilder().find(`#${buttonId}`).click();

        // The button posts to updateTopPages.do; the list only appears once that call has
        // come back, which is the end-to-end proof that the POST is accepted (the view used
        // to send a GET, which org.jahia.bin.Action answers with 405).
        pageBuilder().find(`#${resultId} ul.topPages li`).should('have.length', expectedTitles.length);
        pageBuilder()
            .find(`#${resultId} ul.topPages li a`)
            .should($links => {
                expect($links.toArray().map(a => a.textContent)).to.deep.equal(expectedTitles);
                expect($links.toArray().map(a => a.getAttribute('href'))).to.deep.equal(expectedHrefs);
            });
        pageBuilder().find(`#${resultId} h3`).should('have.text', nodeTitle);
    });

    it('renders a configured customCSS class instead of the default', () => {
        // The EL read `customCss` while the CND defines `customCSS`, so a configured class
        // silently resolved to nothing and every list fell back to `topPages`. Every other
        // assertion in this file pins that fallback branch, so this is the only one that can
        // catch the typo coming back.
        cy.login();
        createTopPagesNode(areaPath, cssNodeName, {
            jahiaSite: reportName,
            title: 'Custom class',
            numberOfResults: 5,
            nMonths: 1
        });
        setNodeProperty(cssNodePath, 'customCSS', cssClass, LANGUAGE);

        cy.visit(editModeUrl);
        pageBuilder()
            .find(`#${cssResultId} ul.${cssClass} li`)
            .should('have.length', expectedTitles.length);
        pageBuilder().find(`#${cssResultId} ul.topPages`).should('not.exist');
    });

    it('renders a stored title as text, never as markup', () => {
        cy.login();
        setNodeProperty(xssNodePath, 'jsonResult', JSON.stringify(sentinel), LANGUAGE);
        cy.visit(editModeUrl);

        // The heading must read the payload back literally, and nothing may have been
        // injected: the view builds DOM nodes and sets .text(), and passes the title
        // through an escaped data attribute instead of into the script source.
        pageBuilder().find(`#${xssResultId} h3`).should('have.text', xssTitle);
        pageBuilder().find(`#${xssResultId} img`).should('not.exist');

        // And the same must hold for the markup the update path rebuilds from scratch.
        pageBuilder().find(`#${xssButtonId}`).click();
        pageBuilder().find(`#${xssResultId} ul.topPages li`).should('have.length', expectedTitles.length);
        pageBuilder().find(`#${xssResultId} h3`).should('have.text', xssTitle);
        pageBuilder().find(`#${xssResultId} img`).should('not.exist');
        cy.get('iframe[data-sel-role="page-builder-frame-active"]')
            .its('0.contentWindow')
            .then(win => {
                expect((win as unknown as Record<string, unknown>).__toppagesXss, 'injected onerror handler').to.be
                    .undefined;
            });
    });

    it('renders the published result for an anonymous visitor', () => {
        // The live path has no button: the script reads the jsonResult that was published
        // with the node. This is the only rendering a site visitor ever gets.
        cy.login();
        callAction(nodePath, 'updateTopPages');
        publishAndWaitJobEnding(pagePath, [LANGUAGE]);

        cy.logout();
        cy.visit(liveUrl);
        cy.get(`#${buttonId}`).should('not.exist');
        cy.get(`#${resultId} ul.topPages li a`).should($links => {
            expect($links.toArray().map(a => a.textContent)).to.deep.equal(expectedTitles);
            expect($links.toArray().map(a => a.getAttribute('href'))).to.deep.equal(expectedHrefs);
        });
    });
});
