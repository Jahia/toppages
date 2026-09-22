import {addNode, publishAndWaitJobEnding, setNodeProperty} from '@jahia/cypress';
import {
    AWSTATS_REPORT_URL,
    CsrfToken,
    LANGUAGE,
    SETTINGS_URL,
    callAction,
    getCsrfToken,
    clearAllSiteConfigs,
    createSiteConfig,
    createTopPagesNode,
    ensureModuleEnabled,
    ensureSettingsRoot,
    readJsonResult,
    readProperty,
    removeNodeIfPresent,
    SITE_KEY
} from '../support/toppages';

/**
 * The getTopPages / updateTopPages actions, against the static AWStats fixture served by
 * the `awstats` container. The fixture is what makes these assertions exact: nginx ignores
 * the ?year=&month= query string TopPages appends, so every month of an aggregation reads
 * the same five rows.
 */
describe('Top Pages actions', () => {
    const reportName = 'e2e-action-report';
    const containerPath = '/sites/digitall/home/toppages-e2e';
    const nodeName = 'top-pages-single-month';
    const nodePath = `${containerPath}/${nodeName}`;

    // Straight out of tests/assets/awstats/awstats.pl, in the order TopPages must produce
    // (descending hit count -- AWStatsPage.compareTo sorted with Collections.reverseOrder).
    const expectedTitles = ['Home', 'Our company', 'Contact us', 'News and events', 'Legal notice'];
    const expectedCounts = [5000, 4200, 3100, 1750, 900];

    before(() => {
        cy.login();
        ensureModuleEnabled();
        ensureSettingsRoot();
        clearAllSiteConfigs();
        createSiteConfig(reportName, {awStatsUrl: AWSTATS_REPORT_URL});

        // A jnt:contentList directly under the home page: jtopmix:topPages is
        // jmix:droppableContent, and a page ancestor is required by the admin listing
        // (SiteconfigFlowHandler.getParentPage walks up until it finds a jnt:page).
        removeNodeIfPresent(containerPath);
        addNode({
            parentPathOrId: '/sites/digitall/home',
            name: 'toppages-e2e',
            primaryNodeType: 'jnt:contentList'
        });
        createTopPagesNode(containerPath, nodeName, {
            jahiaSite: reportName,
            title: 'E2E Top Pages',
            numberOfResults: 5,
            nMonths: 1
        });
    });

    after(() => {
        cy.login();
        removeNodeIfPresent(containerPath);
        clearAllSiteConfigs();
    });

    it('parses the AWStats report and returns the pages ranked by hit count', () => {
        cy.login();
        callAction(nodePath, 'updateTopPages').then(response => {
            expect(response.status).to.eq(200);
            const pages = (response.body as {topPages: Array<{title: string; href: string; count: number}>}).topPages;
            expect(pages.map(p => p.title)).to.deep.equal(expectedTitles);
            expect(pages.map(p => p.count)).to.deep.equal(expectedCounts);
            expect(pages[0].href).to.eq(`${AWSTATS_REPORT_URL.replace('/awstats.pl', '')}/pages/home.html`);
        });
    });

    it('stores the result in the jsonResult property and clears the last error', () => {
        cy.login();
        readJsonResult(nodePath).then(stored => {
            expect(stored, 'jsonResult').to.not.be.a('null');
            expect(stored.topPages.map(p => p.title)).to.deep.equal(expectedTitles);
        });
        readProperty(nodePath, 'lastErrorReceived').should('eq', '');
    });

    it('copies the global configuration onto the node when overrideConfig is false', () => {
        // UpdateTopPages does not merely read the global configuration, it writes it back
        // onto the node -- which is how the content editor sees which report is in use.
        cy.login();
        readProperty(nodePath, 'awStatsUrl').should('eq', AWSTATS_REPORT_URL);
        readProperty(nodePath, 'includeFilter').should('eq', '');
        readProperty(nodePath, 'titleFromHTML').should('eq', 'false');
    });

    it('serves the stored result without re-reading the report', () => {
        // GetTopPages is documented as returning the JCR copy to avoid hammering AWStats.
        // Overwriting jsonResult with a sentinel is the only way to tell "returned the
        // cached value" apart from "fetched the same value again".
        cy.login();
        const sentinel = {topPages: [{title: 'Sentinel', href: 'http://awstats/sentinel.html', count: 42}]};
        setNodeProperty(nodePath, 'jsonResult', JSON.stringify(sentinel), LANGUAGE);

        callAction(nodePath, 'getTopPages').then(response => {
            expect(response.status).to.eq(200);
            expect(response.body).to.deep.equal(sentinel);
        });
    });

    it('aggregates hit counts across the configured number of months', () => {
        cy.login();
        const multiMonthName = 'top-pages-three-months';
        const multiMonthPath = `${containerPath}/${multiMonthName}`;
        createTopPagesNode(containerPath, multiMonthName, {
            jahiaSite: reportName,
            numberOfResults: 5,
            nMonths: 3
        });

        callAction(multiMonthPath, 'updateTopPages').then(response => {
            const pages = (response.body as {topPages: Array<{title: string; count: number}>}).topPages;
            expect(pages.map(p => p.title)).to.deep.equal(expectedTitles);
            expect(pages.map(p => p.count)).to.deep.equal(expectedCounts.map(c => c * 3));
        });

        removeNodeIfPresent(multiMonthPath);
    });

    it('takes titles from each page <title> when titleFromHTML is set', () => {
        cy.login();
        const htmlTitleReport = 'e2e-action-report-html-title';
        const htmlTitleName = 'top-pages-html-title';
        const htmlTitlePath = `${containerPath}/${htmlTitleName}`;

        // With the separator, "Welcome home | Digitall E2E" must be cut down to "Welcome home".
        createSiteConfig(htmlTitleReport, {
            awStatsUrl: AWSTATS_REPORT_URL,
            titleFromHTML: true,
            titleSeparator: '|'
        });
        createTopPagesNode(containerPath, htmlTitleName, {
            jahiaSite: htmlTitleReport,
            numberOfResults: 5,
            nMonths: 1
        });

        callAction(htmlTitlePath, 'updateTopPages').then(response => {
            const pages = (response.body as {topPages: Array<{title: string; count: number}>}).topPages;
            expect(pages.map(p => p.title)).to.deep.equal([
                'Welcome home',
                'About our company',
                'Get in touch',
                'Newsroom',
                'Legal information'
            ]);
            expect(pages.map(p => p.count)).to.deep.equal(expectedCounts);
        });

        removeNodeIfPresent(htmlTitlePath);
    });

    it('records the failure and keeps the previous result when the report is unreachable', () => {
        cy.login();
        const brokenReport = 'e2e-action-report-broken';
        const brokenName = 'top-pages-broken';
        const brokenPath = `${containerPath}/${brokenName}`;

        createSiteConfig(brokenReport, {awStatsUrl: `${AWSTATS_REPORT_URL.replace('awstats.pl', '')}does-not-exist.pl`});
        createTopPagesNode(containerPath, brokenName, {jahiaSite: brokenReport, nMonths: 1});

        callAction(brokenPath, 'updateTopPages');

        readProperty(brokenPath, 'lastErrorReceived').should(value => {
            expect(value, 'lastErrorReceived').to.be.a('string').and.to.not.equal('');
            expect(value).to.contain('Unable to connect to');
        });
        readProperty(brokenPath, 'jsonResult').should('be.null');

        removeNodeIfPresent(brokenPath);
    });

    it('lists the node in the administration page, with its report and page path', () => {
        // "Show all Top Pages nodes" runs a JCR-SQL2 query and resolves each node's
        // enclosing page; a node with no jnt:page ancestor makes getParentPage recurse
        // past the repository root, which is why the fixture lives under /home.
        cy.login();
        cy.visit(SETTINGS_URL);
        cy.get('#getAllPages').click();

        cy.get('#allTopPagesNodes').within(() => {
            cy.contains('tr', nodeName).should('exist');
            cy.contains('tr', nodeName).contains('td', reportName).should('exist');
            cy.contains('tr', nodeName).contains('td', nodePath).should('exist');
        });
    });

    it('KNOWN DEFECT: one node outside a page empties the whole administration listing', () => {
        cy.login();
        const orphanName = 'e2e-top-pages-orphan';
        const orphanParent = `/sites/${SITE_KEY}/contents`;
        createTopPagesNode(orphanParent, orphanName, {jahiaSite: reportName});

        cy.visit(SETTINGS_URL);
        cy.get('#getAllPages').click();

        // GetAllNodes() resolves every node's enclosing page with getParentPage(), which
        // recurses upwards until it hits a jnt:page. Content under /sites/<site>/contents
        // has no page ancestor, so the recursion walks past the repository root and throws;
        // the RepositoryException is caught and the model is never populated. The blast
        // radius is the whole table -- the perfectly valid node asserted just above
        // disappears from the administration screen too.
        //
        // Fix getParentPage() to stop at the site (or skip the node) and this test fails,
        // which is the signal to turn it into an assertion that both nodes are listed.
        cy.get('#allTopPagesNodes').should('not.contain.text', nodeName);

        removeNodeIfPresent(`${orphanParent}/${orphanName}`);
    });

    it('serves the published result to an anonymous visitor in live mode', () => {
        // This is the production path: the topPages view calls getTopPages from a live
        // page, and GetTopPagesAction sets requireAuthenticatedUser=false for exactly that.
        cy.login();
        callAction(nodePath, 'updateTopPages');
        publishAndWaitJobEnding('/sites/digitall/home', [LANGUAGE]);

        cy.logout();
        callAction(nodePath, 'getTopPages', {workspace: 'live'}).then(response => {
            expect(response.status).to.eq(200);
            const pages = (response.body as {topPages: Array<{title: string}>}).topPages;
            expect(pages.map(p => p.title)).to.deep.equal(expectedTitles);
        });
    });

    it('KNOWN DEFECT: rejects the GET that the edit-mode button actually sends', () => {
        // The view jtopmix_topPages/html/topPages.jsp drives the "Update Top Pages" button with
        // $.getJSON(updateActionUrl) -- a GET. org.jahia.bin.Action defaults
        // requiredMethods to ["POST"] and UpdateTopPagesAction never overrides it, so on
        // Jahia 8.2 that button cannot work.
        //
        // This records the defect rather than blessing it: fix the JSP (or set
        // requiredMethods on the action) and this test will fail, which is the signal to
        // change it into an assertion that the button succeeds.
        cy.login();
        getCsrfToken()
            .then((token: CsrfToken) =>
                cy.request({
                    method: 'GET',
                    url: `/cms/render/default/${LANGUAGE}${nodePath}.updateTopPages.do?${token.name}=${token.value}`,
                    headers: {Accept: 'application/json'},
                    failOnStatusCode: false
                })
            )
            .its('status')
            .should('eq', 405);
    });

    it('refuses an anonymous updateTopPages', () => {
        // Reading the cached result is public by design; rewriting it is not.
        // UpdateTopPagesAction leaves requireAuthenticatedUser at its default of true.
        cy.logout();
        callAction(nodePath, 'updateTopPages', {workspace: 'live', failOnStatusCode: false})
            .its('status')
            .should('not.eq', 200);
    });
});
