import {addNode, publishAndWaitJobEnding, setNodeProperty} from '@jahia/cypress';
import {
    AWSTATS_REPORT_URL,
    CsrfToken,
    LANGUAGE,
    callAction,
    getCsrfToken,
    clearAllSiteConfigs,
    createSiteConfig,
    createTopPagesNode,
    ensureModuleEnabled,
    ensureSettingsRoot,
    readJsonResult,
    readProperty,
    openSettings,
    removeNodeIfPresent,
    sel,
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
        // jmix:droppableContent, and this gives the node an enclosing jnt:page one level up,
        // so SiteconfigFlowHandler.getParentPage has a page to find and the listing a "View
        // Page" link to render. The node outside any page is created by its own test.
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

        createSiteConfig(brokenReport, {
            awStatsUrl: `${AWSTATS_REPORT_URL.replace('awstats.pl', '')}does-not-exist.pl`
        });
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
        // "Show all Top Pages nodes" is now Query.topPages.contentNodes, backed by
        // TopPagesNodeLister: the same JCR-SQL2 query, and the same upward walk for each node's
        // enclosing page, read through GraphQL and rendered by the React administration route.
        cy.login();
        openSettings();
        cy.get(sel('list-nodes')).click();

        cy.get(sel('node-listing')).within(() => {
            cy.get(sel(`node-row-${nodeName}`)).should('exist');
            cy.get(sel(`node-row-${nodeName}`)).contains('td', reportName).should('exist');
            cy.get(sel(`node-row-${nodeName}`)).contains('td', nodePath).should('exist');
            // A node that does sit inside a page still gets its link to that page, pointing at
            // the enclosing page -- the home page, not the jnt:contentList in between.
            cy.get(sel(`node-link-${nodeName}`))
                .should('have.attr', 'href')
                .and('include', `/cms/edit/default/${LANGUAGE}`)
                .and('include', `/sites/${SITE_KEY}/home.html`);
        });
    });

    it('lists a node outside any page alongside the others', () => {
        cy.login();
        const orphanName = 'e2e-top-pages-orphan';
        const orphanParent = `/sites/${SITE_KEY}/contents`;
        createTopPagesNode(orphanParent, orphanName, {jahiaSite: reportName});

        openSettings();
        cy.get(sel('list-nodes')).click();

        // TopPagesNodeLister resolves every node's enclosing page. Content under
        // /sites/<site>/contents has no jnt:page ancestor: getParentPage() used to recurse
        // upwards until getParent() threw past the repository root, the RepositoryException was
        // caught around the whole loop, and the listing was never populated -- so ONE misplaced
        // node emptied the entire table, taking the perfectly valid node asserted just above
        // with it.
        //
        // The walk now terminates at the site node and at the root, and each row is read under
        // its own try, so both of these must be listed.
        cy.get(sel('node-listing')).within(() => {
            cy.get(sel(`node-row-${orphanName}`)).should('exist');
            cy.get(sel(`node-row-${orphanName}`)).contains('td', `${orphanParent}/${orphanName}`).should('exist');
            // And the valid node is still there: the orphan did not take the table down.
            cy.get(sel(`node-row-${nodeName}`)).should('exist');
            cy.get(sel(`node-row-${nodeName}`)).contains('td', nodePath).should('exist');
        });

        // No enclosing page means no link to it -- not a link to /cms/edit/default/en/.html,
        // which is what interpolating a null path produces.
        cy.get(sel(`node-row-${orphanName}`)).find('a').should('not.exist');

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

    it('rejects a GET on updateTopPages, which rewrites content', () => {
        // UpdateTopPages fetches a remote report and rewrites the node: it must not be
        // reachable through a GET, which a third-party page can trigger with nothing more
        // than an <img src>. org.jahia.bin.Action defaults requiredMethods to ["POST"] and
        // UpdateTopPagesAction keeps that default, so the answer is 405.
        //
        // jtopmix_topPages/html/topPages.jsp used to drive its "Update Top Pages" button with
        // $.getJSON(updateActionUrl) -- a GET -- so the button could never work on Jahia 8.2.
        // The view now sends the POST this assertion pins as the only accepted method.
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
        // updateTopPages requires the jcr:write permission on the node, which guest does not hold.
        cy.logout();
        callAction(nodePath, 'updateTopPages', {workspace: 'live', failOnStatusCode: false})
            .its('status')
            .should('not.eq', 200);
    });
});
