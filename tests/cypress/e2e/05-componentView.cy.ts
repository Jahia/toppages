import 'cypress-wait-until';
import {addNode, publishAndWaitJobEnding, setNodeProperty} from '@jahia/cypress';
import {
    AWSTATS_BASE_URL,
    AWSTATS_REPORT_URL,
    CreatedNode,
    LANGUAGE,
    SITE_KEY,
    callAction,
    clearAllSiteConfigs,
    createSiteConfig,
    createTopPagesNodeAndRead,
    ensureModuleEnabled,
    ensureSettingsRoot,
    removeNodeEverywhere
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

    /**
     * The four dom ids the view emits for one component.
     *
     * They are derived from the node's JCR identifier, NOT from its name (see the
     * `<c:set>` block in the JSP and the regression test at the bottom of this file), so a
     * spec cannot build them until the node exists -- which is why they are `let`s filled in
     * by `before()` rather than the module-level constants they used to be.
     */
    interface ComponentIds {
        result: string;
        messages: string;
        loader: string;
        button: string;
    }

    const idsOf = (uuid: string): ComponentIds => ({
        result: `result-${uuid}`,
        messages: `messages-${uuid}`,
        loader: `loader-${uuid}`,
        button: `updateBtn-${uuid}`
    });

    const ID_PREFIXES = ['result', 'messages', 'loader', 'updateBtn'];

    /** A JCR identifier: hex and hyphens, and nothing a payload could ride in on. */
    const IDENTIFIER = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    let ids: ComponentIds;

    // A node of its own: mutating customCSS on the shared node would leave every later
    // assertion of the `topPages` fallback broken if this test ever failed mid-way.
    const cssNodeName = 'top-pages-view-css';
    const cssNodePath = `${areaPath}/${cssNodeName}`;
    const cssClass = 'topPagesCustom';
    let cssIds: ComponentIds;

    const xssNodeName = 'top-pages-view-xss';
    const xssNodePath = `${areaPath}/${xssNodeName}`;
    let xssIds: ComponentIds;

    /**
     * The payload from the JAHIA-SEC-411 fiche, and the only shape that can detect this
     * vulnerability class.
     *
     * Every carrier this view ever interpolated -- jcr:title, jsonResult, lastErrorReceived
     * -- sat INSIDE a <script> block. The `"><img ...>` payload that proves the sibling
     * fiches is inert in that position: it is just text in a script, and a probe using it
     * reports the sink as safe. An HTML parser, however, ends a <script> element at the
     * first `</script>` regardless of the JavaScript string quoting around it, so a
     * script-breaking payload -- and only a script-breaking payload -- turns the injection
     * into a real element whose handler runs.
     */
    const xssTitle = '</script><img src=x onerror="window.__toppagesXss = true">Most visited';

    /** What fn:escapeXml makes of the head of that payload, quotes excluded. */
    const escapedXssHead = '&lt;/script&gt;&lt;img src=x onerror=';

    /**
     * The second JAHIA-SEC-411 carrier: the node NAME, which the view used to interpolate
     * raw into `$("#...")` and into `id="..."`.
     *
     * This is the fiche's payload verbatim. Jahia's node-name sanitizer strips `<` and `>`
     * but keeps the double quote, so tag injection is blocked and a JavaScript-string
     * breakout is not. JCR forbids `/` in a name, so `//` cannot comment out the tail of the
     * generated line; the payload re-opens a string instead, which is why
     * `var resultDiv = $("#result-x");SEC411NAME98a54a83=1;a=("-pagecontent");` parses
     * cleanly (`node --check` accepts it) and the injected assignment RUNS rather than
     * raising a SyntaxError that would have neutralised it.
     */
    const breakoutNonce = '98a54a83';
    const breakoutSequence = `");SEC411NAME${breakoutNonce}=1;a=("`;
    const breakoutNodeName = `x${breakoutSequence}`;

    /**
     * Carried by the hostile node's title, in the same response as every negative below.
     *
     * A "the payload did not execute" assertion passes trivially against a page that never
     * rendered the component at all, so the fiche pairs its payload nonce with a control
     * nonce. This one travels through `data-title`, a path the fix does not touch.
     */
    const controlNonce = `SEC411CTRL${breakoutNonce}`;
    const breakoutNodeTitle = `${controlNonce} top pages`;

    /**
     * A page of its own for the hostile node, with one ordinary sibling on it.
     *
     * Not shared with the tests above, for two reasons. Jahia caches a live page per visitor
     * and publication lands asynchronously, so a page an earlier test already fetched as a
     * guest can still be serving that earlier body -- and a second publish that has nothing
     * left to do does not flush it. And the sibling makes the "two components on one page get
     * distinct ids" requirement something this test can assert on its own page rather than on
     * whatever the tests before it happened to leave behind.
     */
    const breakoutPageName = 'toppages-sec411-e2e';
    const breakoutPagePath = `${homePath}/${breakoutPageName}`;
    const breakoutAreaPath = `${breakoutPagePath}/${areaName}`;
    const breakoutLiveUrl = `/cms/render/live/${LANGUAGE}${breakoutPagePath}.html`;
    const breakoutEditUrl = `/cms/edit/default/${LANGUAGE}${breakoutPagePath}.html`;
    const siblingNodeName = 'top-pages-sec411-sibling';

    let breakoutIds: ComponentIds;
    let siblingIds: ComponentIds;
    /** What the JCR actually stored, which is not necessarily what was asked for. */
    let breakoutStoredName = '';

    /** The default-workspace render, fetched as markup rather than through the browser. */
    const renderUrl = `/cms/render/default/${LANGUAGE}${pagePath}.html`;

    /**
     * Assert on the HTML as it leaves the server, which is where this bug lives.
     *
     * The DOM assertions below can only observe what the parser made of the response; this
     * one observes the response itself, and is the direct form of the fiche's reproduction
     * step. `</script>` must reach the browser escaped, or the script element is terminated
     * early and everything after it is markup.
     */
    const assertPayloadIsInert = (body: string): void => {
        // Booleans rather than expect(body).to.contain(...): chai prints the subject on
        // failure, and the subject here is a whole rendered Digitall page, which buries the
        // one line that matters under 60kB of markup.
        expect(body.includes(escapedXssHead), 'escaped payload in the served html').to.be.true;
        expect(body.includes('</script><img'), 'unescaped </script> from the stored title').to.be.false;
        expect(/<img[^>]*onerror/i.test(body), 'an img carrying an event handler in the served html').to.be.false;
    };

    /**
     * What `fn:escapeXml` makes of a value.
     *
     * JSTL writes a double quote as `&#034;` and an apostrophe as `&#039;`, NOT as the
     * `&quot;` / `&apos;` entities, which is why the escaped forms asserted on below are
     * spelled numerically.
     */
    const escapeXml = (value: string): string =>
        value
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&#034;')
            .replace(/'/g, '&#039;');

    /** Every capture of `pattern` in `body`, in document order. */
    const captures = (body: string, pattern: RegExp): string[] => {
        const found: string[] = [];
        const global = new RegExp(pattern.source, 'g');
        let match = global.exec(body);
        while (match !== null) {
            found.push(match[1]);
            match = global.exec(body);
        }

        return found;
    };

    /**
     * Every dom id this view emits, in every context it emits it into, is a bare identifier.
     *
     * The three contexts are asserted separately because they fail differently: a quote in
     * the `id="..."` attribute injects an attribute, the same quote in `$("#...")` both
     * breaks the selector and executes whatever follows, and an escaping that fixes one
     * leaves the other broken. That is the reason the fix replaces the value instead of
     * escaping it.
     */
    const assertComponentIdsAreInert = (body: string): void => {
        ID_PREFIXES.forEach(prefix => {
            captures(body, new RegExp(`id="${prefix}-([^"]*)"`)).forEach(value => {
                expect(IDENTIFIER.test(value), `${prefix} id attribute "${value}" is a bare jcr identifier`).to.be.true;
            });
            captures(body, new RegExp(`\\$\\("#${prefix}-([^"]*)"\\)`)).forEach(value => {
                expect(IDENTIFIER.test(value), `${prefix} jquery selector "${value}" is a bare jcr identifier`).to.be
                    .true;
            });
            // An injected attribute leaves the id value itself looking innocent -- it is
            // truncated at the quote -- and shows up only as markup glued to the closing
            // quote: id="result-x"onerror=x-pagecontent".
            expect(
                new RegExp(`id="${prefix}-[^"]*"[^\\s>]`).test(body),
                `an attribute injected immediately after a ${prefix} id`
            ).to.be.false;
        });
    };

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

        removeNodeEverywhere(pagePath);
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

        createTopPagesNodeAndRead(areaPath, nodeName, {
            jahiaSite: reportName,
            title: nodeTitle,
            numberOfResults: 5,
            nMonths: 1
        }).then((created: CreatedNode) => {
            ids = idsOf(created.uuid);
        });
        createTopPagesNodeAndRead(areaPath, xssNodeName, {
            jahiaSite: reportName,
            title: xssTitle,
            numberOfResults: 5,
            nMonths: 1
        }).then((created: CreatedNode) => {
            xssIds = idsOf(created.uuid);
        });

        removeNodeEverywhere(breakoutPagePath);
        addNode({
            parentPathOrId: homePath,
            name: breakoutPageName,
            primaryNodeType: 'jnt:page',
            properties: [
                {name: 'jcr:title', type: 'STRING', value: 'Top Pages hostile name', language: LANGUAGE},
                {name: 'j:templateName', type: 'STRING', value: 'home'}
            ]
        });
        addNode({parentPathOrId: breakoutPagePath, name: areaName, primaryNodeType: 'jnt:contentList'});
        createTopPagesNodeAndRead(breakoutAreaPath, breakoutNodeName, {
            jahiaSite: reportName,
            title: breakoutNodeTitle,
            numberOfResults: 5,
            nMonths: 1
        }).then((created: CreatedNode) => {
            breakoutIds = idsOf(created.uuid);
            breakoutStoredName = created.name;
        });
        createTopPagesNodeAndRead(breakoutAreaPath, siblingNodeName, {
            jahiaSite: reportName,
            title: 'Ordinary sibling',
            numberOfResults: 5,
            nMonths: 1
        }).then((created: CreatedNode) => {
            siblingIds = idsOf(created.uuid);
        });
    });

    after(() => {
        cy.login();
        // Both workspaces: a live leftover makes the NEXT run of this spec fail on the page
        // it recreates, not on anything this one did.
        removeNodeEverywhere(pagePath);
        removeNodeEverywhere(breakoutPagePath);
        clearAllSiteConfigs();
    });

    it('offers the Update Top Pages button in edit mode', () => {
        cy.login();
        cy.visit(editModeUrl);
        pageBuilder().find(`#${ids.button}`).should('be.visible').and('contain.text', 'Update Top Pages');
        // The result div carries everything the script reads; a data attribute that is
        // missing or misspelled leaves the component silently inert, which is exactly the
        // failure mode the rewrite of this view could introduce.
        pageBuilder()
            .find(`#${ids.result}`)
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
        pageBuilder().find(`#${ids.result} ul.topPages li`).should('have.length', 1).and('have.text', 'Sentinel');

        pageBuilder().find(`#${ids.button}`).click();

        // The button posts to updateTopPages.do; the list only appears once that call has
        // come back, which is the end-to-end proof that the POST is accepted (the view used
        // to send a GET, which org.jahia.bin.Action answers with 405).
        pageBuilder().find(`#${ids.result} ul.topPages li`).should('have.length', expectedTitles.length);
        pageBuilder()
            .find(`#${ids.result} ul.topPages li a`)
            .should($links => {
                expect($links.toArray().map(a => a.textContent)).to.deep.equal(expectedTitles);
                expect($links.toArray().map(a => a.getAttribute('href'))).to.deep.equal(expectedHrefs);
            });
        pageBuilder().find(`#${ids.result} h3`).should('have.text', nodeTitle);
    });

    it('renders a configured customCSS class instead of the default', () => {
        // The EL read `customCss` while the CND defines `customCSS`, so a configured class
        // silently resolved to nothing and every list fell back to `topPages`. Every other
        // assertion in this file pins that fallback branch, so this is the only one that can
        // catch the typo coming back.
        cy.login();
        // Everything that needs the new node's ids lives inside the then(): a selector is a
        // template literal, and a template literal built while the command queue is still
        // being assembled reads an id that has not been fetched yet.
        createTopPagesNodeAndRead(areaPath, cssNodeName, {
            jahiaSite: reportName,
            title: 'Custom class',
            numberOfResults: 5,
            nMonths: 1
        }).then((created: CreatedNode) => {
            cssIds = idsOf(created.uuid);
            setNodeProperty(cssNodePath, 'customCSS', cssClass, LANGUAGE);

            cy.visit(editModeUrl);
            pageBuilder()
                .find(`#${cssIds.result} ul.${cssClass} li`)
                .should('have.length', expectedTitles.length);
            pageBuilder().find(`#${cssIds.result} ul.topPages`).should('not.exist');
        });
    });

    it('renders a stored title as text, never as markup', () => {
        cy.login();
        setNodeProperty(xssNodePath, 'jsonResult', JSON.stringify(sentinel), LANGUAGE);

        // First on the wire: the title must arrive escaped, with its `</script>` unable to
        // close the block the script travels in.
        cy.request(renderUrl).then(response => {
            expect(response.status).to.eq(200);
            assertPayloadIsInert(response.body as string);
        });

        cy.visit(editModeUrl);

        // The heading must read the payload back literally, and nothing may have been
        // injected: the view builds DOM nodes and sets .text(), and passes the title
        // through an escaped data attribute instead of into the script source.
        pageBuilder().find(`#${xssIds.result} h3`).should('have.text', xssTitle);
        pageBuilder().find(`#${xssIds.result} img`).should('not.exist');

        // And the same must hold for the markup the update path rebuilds from scratch.
        pageBuilder().find(`#${xssIds.button}`).click();
        pageBuilder().find(`#${xssIds.result} ul.topPages li`).should('have.length', expectedTitles.length);
        pageBuilder().find(`#${xssIds.result} h3`).should('have.text', xssTitle);
        pageBuilder().find(`#${xssIds.result} img`).should('not.exist');
        cy.get('iframe[data-sel-role="page-builder-frame-active"]')
            .its('0.contentWindow')
            .then(win => {
                expect((win as unknown as Record<string, unknown>).__toppagesXss, 'injected onerror handler').to.be
                    .undefined;
            });
    });

    it('serves a stored title inert to an anonymous visitor in live mode', () => {
        // The fiche is explicit that the victim of this carrier is ANY anonymous visitor,
        // not only an administrator: jcr:title renders on an ordinary page in live mode,
        // unlike ${updateError} (lastErrorReceived), which the JSP keeps inside
        // <c:if test="${renderContext.editMode}"> and is therefore administrator-only.
        // A logged-out request on the live url plus a string assertion on the raw response
        // is the fiche's own reproduction step.
        cy.login();
        setNodeProperty(xssNodePath, 'jsonResult', JSON.stringify(sentinel), LANGUAGE);
        publishAndWaitJobEnding(pagePath, [LANGUAGE]);

        cy.logout();
        cy.request(liveUrl).then(response => {
            expect(response.status).to.eq(200);
            assertPayloadIsInert(response.body as string);
        });

        // And once the browser has parsed it: the title is a text node, the handler never ran.
        cy.visit(liveUrl);
        cy.get(`#${xssIds.result} h3`).should('have.text', xssTitle);
        cy.get(`#${xssIds.result} img`).should('not.exist');
        cy.window().then(win => {
            expect((win as unknown as Record<string, unknown>).__toppagesXss, 'injected onerror handler').to.be
                .undefined;
        });
    });

    it('serves a hostile node name inert to an anonymous visitor in live mode', () => {
        // JAHIA-SEC-411, the carrier the 3.0.0 release left open. The three PROPERTY carriers
        // were closed by escaping; the four dom ids were still built from ${currentNode.name}
        // and its parent's and interpolated raw into a <script> block and into id="..."
        // attributes. The victim is the same one the fiche names: an unauthenticated visitor
        // on an ordinary live page.
        cy.login();
        publishAndWaitJobEnding(breakoutPagePath, [LANGUAGE]);
        cy.logout();

        // Publication lands asynchronously and Jahia caches a live page per visitor, so the
        // first anonymous read can arrive before the component is on it. Retry until the
        // node's own title is in the response -- a title the fix does not touch, so this
        // waits for "the component rendered" and not for "the fix worked". A timeout here
        // fails the test; it cannot turn into a silent pass.
        let body = '';
        cy.waitUntil(
            () =>
                cy.request({url: breakoutLiveUrl, failOnStatusCode: false}).then(response => {
                    body = response.body as string;
                    return response.status === 200 && body.includes(controlNonce);
                }),
            {
                timeout: 60000,
                interval: 2000,
                errorMsg: 'the hostile component never reached the live page'
            }
        );

        cy.then(() => {
            // Positive control, in this very response: the component rendered, so every
            // negative below is about an inert payload and not about an empty page.
            expect(body.includes(controlNonce), 'the control nonce carried by the hostile node title').to.be.true;

            // The fiche's reproduction, inverted. Booleans rather than expect(body).to.contain,
            // because chai prints the subject on failure and the subject is a whole rendered
            // Digitall page.
            expect(body.includes(breakoutSequence), 'the fiche breakout sequence, unescaped').to.be.false;
            expect(body.includes(breakoutStoredName), 'the raw node name in the served html').to.be.false;
            assertComponentIdsAreInert(body);

            // Second positive control: the payload really did reach the renderer rather than
            // having been dropped between the mutation and the response. The node path still
            // travels in data-update-url, where fn:escapeXml turns its quotes into &#034; and
            // the breakout cannot re-open anything. The guard on the stored name is what stops
            // this test passing vacuously if Jahia ever starts sanitising the name away.
            expect(breakoutStoredName.indexOf('");'), 'the jcr kept the breakout sequence in the node name').to.be.gte(
                0
            );
            expect(
                body.includes(escapeXml(breakoutStoredName)),
                'the hostile node name reached the response, escaped'
            ).to.be.true;

            // The ids are the identifiers, in the attribute and in the selector.
            expect(body.includes(`id="${breakoutIds.result}"`), 'the result div carries the identifier').to.be.true;
            expect(body.includes(`$("#${breakoutIds.result}")`), 'the jquery selector carries the identifier').to.be
                .true;

            // Two Top Pages components on one page must not collide, which is what the node
            // name and its parent's name were combined for in the first place.
            const resultIds = captures(body, /id="(result-[^"]*)"/);
            expect(resultIds, 'the result ids on this page').to.have.members([
                breakoutIds.result,
                siblingIds.result
            ]);
            expect(breakoutIds.result, 'the two components got distinct ids').to.not.eq(siblingIds.result);
        });

        // The other three ids exist only in edit mode, so the anonymous response above cannot
        // see their attribute context. It does see all four SELECTORS, which the script emits
        // unconditionally, but an id="..." is a context of its own.
        cy.login();
        cy.visit(breakoutEditUrl);
        pageBuilder().find(`#${breakoutIds.button}`).should('exist');
        pageBuilder().find(`#${breakoutIds.messages}`).should('exist');
        pageBuilder().find(`#${breakoutIds.loader}`).should('exist');
        pageBuilder().find('[onerror]').should('not.exist');
    });

    it('renders the published result for an anonymous visitor', () => {
        // The live path has no button: the script reads the jsonResult that was published
        // with the node. This is the only rendering a site visitor ever gets.
        cy.login();
        callAction(nodePath, 'updateTopPages');
        publishAndWaitJobEnding(pagePath, [LANGUAGE]);

        cy.logout();
        cy.visit(liveUrl);
        cy.get(`#${ids.button}`).should('not.exist');
        cy.get(`#${ids.result} ul.topPages li a`).should($links => {
            expect($links.toArray().map(a => a.textContent)).to.deep.equal(expectedTitles);
            expect($links.toArray().map(a => a.getAttribute('href'))).to.deep.equal(expectedHrefs);
        });
    });
});
