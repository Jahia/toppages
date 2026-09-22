import {addNode, deleteNode, enableModule, getNodeByPath} from '@jahia/cypress';

export const SITE_KEY = Cypress.env('SITE_KEY') as string;
export const LANGUAGE = Cypress.env('LANGUAGE') as string;
export const AWSTATS_BASE_URL = Cypress.env('AWSTATS_BASE_URL') as string;

/** The AWStats report the fixture container serves (see tests/assets/awstats). */
export const AWSTATS_REPORT_URL = `${AWSTATS_BASE_URL}/awstats.pl`;

export const MODULE_ID = 'toppages';

/**
 * Enable toppages where each of its surfaces needs it.
 *
 * On `systemsite`, because a server-settings page is a template applied to the
 * jnt:globalSettings node `/settings`, and Jahia only resolves templates from modules
 * installed on the SYSTEM site -- without this the page is a bare HTTP 500
 * (TemplateNotFoundException), with no hint that a module is merely not enabled.
 * On the content site, so jtopmix:topPages is an available type there.
 *
 * This cannot move into assets/provisioning.yml: the harness runs the manifest first and
 * deploys the module artifact afterwards, so at manifest time there is nothing to enable.
 *
 * Note the provisioning operation is `enable:`, NOT `enableModule:` -- the API answers an
 * unknown operation with HTTP 200 and does nothing, so a wrong name fails silently.
 */
export const ensureModuleEnabled = (): void => {
    enableModule(MODULE_ID, 'systemsite');
    enableModule(MODULE_ID, SITE_KEY);
};

/** Where the module keeps its global configuration, one child per AWStats report. */
export const SETTINGS_ROOT = '/settings/top-pages';

/**
 * The administration screen, a React route registered by the module's Module Federation remote
 * (src/javascript/registerRoutes.js) on the `administration-server-configuration` target.
 *
 * jahia-administration mounts every server-scoped adminRoute at `/administration/<route key>`
 * (Administration.jsx builds the path that way), so this URL IS the route key, and the whole app
 * shell boots around it. That is deliberate: the route only exists inside the shell, and asserting
 * on it anywhere else would assert on something no administrator can reach.
 */
export const SETTINGS_URL = '/jahia/administration/top-pages-configuration';

/** Data-sel-role selector, the attribute every element of the admin UI is marked with. */
export const sel = (role: string): string => `[data-sel-role="${role}"]`;

/**
 * Open the administration screen as the user currently logged in.
 *
 * The app shell loads its remotes, resolves permissions and only then mounts the route, so the
 * first assertion has to wait for the route's own marker rather than for the page to load.
 */
export const openSettings = (): void => {
    cy.visit(SETTINGS_URL);
    cy.get(sel('toppages-settings'), {timeout: 60000}).should('exist');
};

export interface SiteConfig {
    awStatsUrl?: string;
    includeFilter?: string;
    excludeFilter?: string;
    titleFromHTML?: boolean;
    titleSeparator?: string;
}

type JcrWorkspace = 'EDIT' | 'LIVE';

const nodeExists = (path: string, workspace: JcrWorkspace = 'EDIT'): Cypress.Chainable<boolean> =>
    getNodeByPath(path, [], LANGUAGE, [], workspace).then((result: {data?: {jcr?: {nodeByPath?: unknown}}}) =>
        Boolean(result?.data?.jcr?.nodeByPath)
    );

/**
 * Create /settings/top-pages when nothing has ever been configured.
 *
 * Nothing creates it on a read any more: ConfigurationUtil.getSiteConfigs() is read-only and
 * answers an empty list when the root is absent, and the first createSiteConfig() is what brings
 * it into existence. Specs that seed configuration directly in the JCR therefore have to create
 * the root themselves.
 */
export const ensureSettingsRoot = (): void => {
    nodeExists('/settings').then(exists => {
        if (!exists) {
            addNode({parentPathOrId: '/', name: 'settings', primaryNodeType: 'jnt:globalSettings'});
        }
    });
    nodeExists(SETTINGS_ROOT).then(exists => {
        if (!exists) {
            addNode({parentPathOrId: '/settings', name: 'top-pages', primaryNodeType: 'jnt:globalSettings'});
        }
    });
};

/**
 * Seed a report configuration directly in the JCR.
 *
 * Every property is written, even the ones the caller did not ask about, because
 * ConfigurationUtil.getSiteConfig() reads awStatsUrl / includeFilter / titleFromHTML with
 * getProperty() inside a try that swallows PathNotFoundException: one missing property and
 * the whole configuration silently reads back as null.
 */
export const createSiteConfig = (name: string, config: SiteConfig = {}): void => {
    ensureSettingsRoot();
    deleteSiteConfig(name);
    addNode({
        parentPathOrId: SETTINGS_ROOT,
        name,
        primaryNodeType: 'jtopmix:siteConfig',
        properties: [
            {name: 'awStatsUrl', type: 'STRING', value: config.awStatsUrl ?? AWSTATS_REPORT_URL},
            {name: 'includeFilter', type: 'STRING', value: config.includeFilter ?? ''},
            {name: 'excludeFilter', type: 'STRING', value: config.excludeFilter ?? ''},
            {name: 'titleFromHTML', type: 'BOOLEAN', value: String(config.titleFromHTML ?? false)},
            {name: 'titleSeparator', type: 'STRING', value: config.titleSeparator ?? ''}
        ]
    });
};

export const deleteSiteConfig = (name: string): void => {
    nodeExists(`${SETTINGS_ROOT}/${name}`).then(exists => {
        if (exists) {
            deleteNode(`${SETTINGS_ROOT}/${name}`);
        }
    });
};

export interface TopPagesNodeProps {
    jahiaSite: string;
    title?: string;
    numberOfResults?: number;
    nMonths?: number;
    overrideConfig?: boolean;
    awStatsUrl?: string;
    includeFilter?: string;
    excludeFilter?: string;
    titleFromHTML?: boolean;
    titleSeparator?: string;
}

/** Create a jtopmix:topPages content node under `parentPath`. */
export const createTopPagesNode = (parentPath: string, name: string, props: TopPagesNodeProps): Cypress.Chainable => {
    removeNodeIfPresent(`${parentPath}/${name}`);
    return addNode({
        parentPathOrId: parentPath,
        name,
        primaryNodeType: 'jtopmix:topPages',
        properties: [
            {name: 'jcr:title', type: 'STRING', value: props.title ?? name, language: LANGUAGE},
            {name: 'jahiaSite', type: 'STRING', value: props.jahiaSite},
            {name: 'numberOfResults', type: 'LONG', value: String(props.numberOfResults ?? 5)},
            {name: 'nMonths', type: 'STRING', value: String(props.nMonths ?? 1)},
            {name: 'overrideConfig', type: 'BOOLEAN', value: String(props.overrideConfig ?? false)},
            {name: 'awStatsUrl', type: 'STRING', value: props.awStatsUrl ?? 'Global Configuration'},
            {name: 'includeFilter', type: 'STRING', value: props.includeFilter ?? 'Global Configuration'},
            {name: 'excludeFilter', type: 'STRING', value: props.excludeFilter ?? 'Global Configuration'},
            {name: 'titleFromHTML', type: 'BOOLEAN', value: String(props.titleFromHTML ?? false)},
            {name: 'titleSeparator', type: 'STRING', value: props.titleSeparator ?? ''}
        ]
    });
};

export interface CreatedNode {
    /** The JCR identifier -- a repository UUID. */
    uuid: string;
    /** The name the JCR actually stored, which is not necessarily the one that was asked for. */
    name: string;
}

/**
 * Create a jtopmix:topPages node and yield its identifier together with its stored name.
 *
 * Two things a spec cannot know up front and must not guess:
 *
 *  - the identifier. `jtopmix_topPages/html/topPages.jsp` derives every dom id from
 *    `${currentNode.identifier}`, so the selectors a test needs do not exist until the node
 *    does. A test that rebuilt them from the node name would be testing the vulnerable
 *    derivation it is supposed to have replaced.
 *  - the stored name. Jahia is free to rewrite the name it is handed, so a test that asserts
 *    on the name it ASKED for may be asserting about a node that is not in the repository.
 *
 * The addNode mutation answers with both, which makes this the only honest source for either.
 */
export const createTopPagesNodeAndRead = (
    parentPath: string,
    name: string,
    props: TopPagesNodeProps
): Cypress.Chainable =>
    createTopPagesNode(parentPath, name, props).then(
        (result: {data?: {jcr?: {addNode?: {uuid?: string; node?: {name?: string}}}}}) => {
            const created = result?.data?.jcr?.addNode;
            expect(created?.uuid, `identifier of the created node ${parentPath}/${name}`).to.be.a('string');
            return {uuid: created.uuid, name: created.node.name};
        }
    );

/**
 * Drop every report configuration, so a spec starts from a repository that has never
 * been configured. Leftovers from an interrupted run would otherwise break the
 * empty-state assertion and the choice-list assertions.
 */
export const clearAllSiteConfigs = (): void => {
    listChildren(SETTINGS_ROOT).then((children: ChildNode[]) => {
        children.forEach(child => deleteNode(child.path));
    });
};

// Return type stays loose on purpose: cy.then() resolves an array subject through its
// JQuery overload, so a precise Chainable<Array<...>> annotation does not type-check.
// Callers annotate the yielded value instead.
export const listChildren = (path: string): Cypress.Chainable =>
    cy
        .apollo({queryFile: 'graphql/query/getChildNodes.graphql', variables: {path}})
        .then(
            (result: {data?: {jcr?: {nodeByPath?: {children?: {nodes?: ChildNode[]}}}}}) =>
                result?.data?.jcr?.nodeByPath?.children?.nodes ?? []
        );

export interface ChildNode {
    name: string;
    path: string;
}

export const removeNodeIfPresent = (path: string): void => {
    nodeExists(path).then(exists => {
        if (exists) {
            deleteNode(path);
        }
    });
};

/**
 * Remove a node from BOTH workspaces.
 *
 * `removeNodeIfPresent` deletes in EDIT only, and a deletion that is never published leaves
 * the live copy standing. The next run then recreates the same paths with NEW identifiers,
 * publication will not write them over the live nodes already occupying those paths, and the
 * live page keeps serving the previous run's markup. Every assertion about the new ids fails
 * as though the view had stopped rendering, which points at the view instead of at the
 * leftover -- so any spec that publishes has to clean up both workspaces.
 */
export const removeNodeEverywhere = (path: string): void => {
    nodeExists(path, 'LIVE').then(exists => {
        if (exists) {
            deleteNode(path, 'LIVE');
        }
    });
    removeNodeIfPresent(path);
};

export interface CsrfToken {
    name: string;
    value: string;
}

/**
 * Read the session's CSRF token.
 *
 * Jahia's CSRF Guard protects /cms/render/**.do for GET as well as POST, and answers a
 * tokenless call with a 302 to /error.html (which then reports a misleading
 * "400 Unknown locale"). In a browser the guard's own script injects the token; a
 * cy.request() has to carry it explicitly.
 *
 * CsrfServlet returns minified JavaScript whose only stable landmarks are the token name
 * and the token itself, the latter being groups of four upper-case characters joined by
 * hyphens. The token is bound to the session, and cy.request() shares the browser's
 * cookie jar, so it stays valid for the call that follows.
 */
// Loose return type: cy.then() picks its JQuery overload for an object subject, so a
// precise Chainable<CsrfToken> annotation does not type-check. Callers annotate instead.
export const getCsrfToken = (): Cypress.Chainable =>
    cy.request({url: '/modules/CsrfServlet', log: false}).then((response: Cypress.Response<string>) => {
        const match = /='([A-Z0-9_]+)',\s*\w+='([A-Z0-9]{4}(?:-[A-Z0-9]{4})+)'/.exec(response.body);
        expect(match, 'CSRF token in the CsrfServlet response').to.not.be.a('null');
        return {name: match[1], value: match[2]};
    });

export type Workspace = 'default' | 'live';

export interface ActionOptions extends Partial<Cypress.RequestOptions> {
    workspace?: Workspace;
}

/**
 * Invoke one of the module's two actions.
 *
 * Three things are all required, and each fails in a way that looks like something else:
 *
 *  - POST. org.jahia.bin.Action defaults requiredMethods to ["POST"] and neither action
 *    overrides it, so a GET is 405 -- which is the point, since updateTopPages rewrites
 *    content. See the regression test in 02-topPagesActions.cy.ts.
 *  - The CSRF token. Jahia's CSRF Guard protects /cms/render/**.do for every method and
 *    answers a tokenless call with a 302 to /error.html, which surfaces as a misleading
 *    "400 Unknown locale".
 *  - Accept: application/json. Jahia only writes an ActionResult's JSON body when the
 *    caller asks for JSON; otherwise the action still RUNS and still writes to the JCR,
 *    but answers 200 with an empty body -- a silent success that looks like a no-op.
 */
export const callAction = (
    nodePath: string,
    action: 'getTopPages' | 'updateTopPages',
    options: ActionOptions = {}
): Cypress.Chainable<Cypress.Response<unknown>> => {
    const {workspace = 'default', ...requestOptions} = options;
    return getCsrfToken().then((token: CsrfToken) =>
        cy.request({
            method: 'POST',
            url: `/cms/render/${workspace}/${LANGUAGE}${nodePath}.${action}.do?${token.name}=${token.value}`,
            headers: {Accept: 'application/json'},
            timeout: 180000,
            ...requestOptions
        })
    );
};

/** Read a single property back from the EDIT workspace, or null when it is not set. */
export const readProperty = (path: string, property: string): Cypress.Chainable<string | null> =>
    getNodeByPath(path, [property], LANGUAGE).then(
        (result: {data?: {jcr?: {nodeByPath?: {properties?: Array<{name: string; value: string}>}}}}) => {
            const properties = result?.data?.jcr?.nodeByPath?.properties ?? [];
            const found = properties.find(p => p.name === property);
            return found ? found.value : null;
        }
    );

/** Parse the `jsonResult` property the module persists after an update. */
export const readJsonResult = (
    path: string
): Cypress.Chainable<{topPages: Array<{title: string; href: string; count: number}>} | null> =>
    readProperty(path, 'jsonResult').then(value => (value ? JSON.parse(value) : null));
