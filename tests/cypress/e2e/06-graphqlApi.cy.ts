import gql from 'graphql-tag';
import {DocumentNode} from 'graphql';
import {
    AWSTATS_REPORT_URL,
    ChildNode,
    SETTINGS_ROOT,
    clearAllSiteConfigs,
    deleteSiteConfig,
    ensureModuleEnabled,
    ensureSettingsRoot,
    listChildren,
    readProperty
} from '../support/toppages';

/**
 * The GraphQL API over the report configurations under /settings/top-pages.
 *
 * Two things are under test and they are not the same thing. One is the CRUD contract: the
 * operations, the invariants the module has always enforced (a name that is a safe path segment,
 * all five properties written, no silent overwrite), and the fact that what comes back out is
 * what went into the JCR. The other is that the API is not a second, unguarded door onto the
 * configuration that 04-permissions proves the server-settings page keeps shut -- these mutations
 * run under a SYSTEM session, which bypasses the access manager entirely, so the only thing
 * standing between an editor and repository-wide configuration is the permission check on the
 * field itself.
 */
describe('GraphQL API - report configuration', () => {
    const reportName = 'e2e-graphql-report';
    // Deliberately not a superstring of reportName, for the same reason 01-serverSettings picks a
    // disjoint name: an assertion that the old name is gone has to be able to fail.
    const renamedName = 'e2e-renamed-graphql';
    const otherName = 'e2e-graphql-other';

    /** A name that is exactly what SafeNames.isValidConfigName exists to refuse. */
    const traversalName = '../../sites/digitall';

    const CONFIG_FIELDS = 'name awStatsUrl includeFilter excludeFilter titleFromHTML titleSeparator';

    interface ReportConfiguration {
        name: string;
        awStatsUrl: string;
        includeFilter: string;
        excludeFilter: string;
        titleFromHTML: boolean;
        titleSeparator: string;
    }

    /**
     * What cy.apollo yields.
     *
     * It does NOT fail a test on a GraphQL error: it catches the ApolloError and yields it as the
     * subject, so `data` is simply absent and the errors live under `graphQLErrors`. Every
     * negative case below therefore asserts on both - that no data came back, and that the error
     * is the specific one expected - rather than expecting a throw that never happens.
     */
    interface ApolloOutcome<T> {
        data?: T;
        graphQLErrors?: Array<{message: string; extensions?: {classification?: string}}>;
    }

    // Loose return type on purpose, exactly as in support/toppages.ts: cy.then() resolves an
    // object subject through its JQuery overload, so a precise Chainable<ApolloOutcome<T>>
    // annotation does not type-check. Callers annotate the yielded value instead.
    const run = (document: DocumentNode, isMutation = false): Cypress.Chainable =>
        cy.apollo(isMutation ? {mutation: document} : {query: document});

    const createMutation = (name: string): DocumentNode =>
        gql`
            mutation {
                topPages {
                    createReportConfiguration(
                        name: "${name}"
                        awStatsUrl: "${AWSTATS_REPORT_URL}"
                        includeFilter: "/en/"
                        excludeFilter: "/private"
                        titleFromHTML: true
                        titleSeparator: " | "
                    ) { ${CONFIG_FIELDS} }
                }
            }
        `;

    const listQuery = gql`
        query {
            topPages {
                reportConfigurations { ${CONFIG_FIELDS} }
            }
        }
    `;

    /** The field names the named root type carries, straight from schema introspection. */
    const rootFieldsOf = (typeName: string): Cypress.Chainable =>
        run(gql`query { __type(name: "${typeName}") { fields { name } } }`).then(
            (result: ApolloOutcome<{__type: {fields: Array<{name: string}>}}>) =>
                result.data.__type.fields.map(field => field.name)
        );

    /** The operations belong to TopPagesQuery / TopPagesMutation, never to a root type. */
    const assertNoFlatOperations = (rootFields: string[], typeName: string): void => {
        [
            'reportConfiguration',
            'reportConfigurations',
            'createReportConfiguration',
            'updateReportConfiguration',
            'deleteReportConfiguration'
        ].forEach(operation => {
            expect(rootFields, `root ${typeName} must not carry ${operation}`).to.not.include(operation);
        });
    };

    /** Names currently stored under /settings/top-pages, read over the JCR API, not over ours. */
    const storedNames = (): Cypress.Chainable =>
        listChildren(SETTINGS_ROOT).then((children: ChildNode[]) => children.map(child => child.name));

    before(() => {
        cy.login();
        ensureModuleEnabled();
        ensureSettingsRoot();
        // The listing assertions count what this spec put there, so it must own the whole list.
        clearAllSiteConfigs();
    });

    after(() => {
        cy.login();
        deleteSiteConfig(reportName);
        deleteSiteConfig(renamedName);
        deleteSiteConfig(otherName);
    });

    describe('schema shape', () => {
        it('adds exactly one field to the root Query and one to the root Mutation', () => {
            cy.login();
            // The one assertion that cannot be made from behaviour. Every module's extensions are
            // folded into ONE schema: two bundles declaring the same root field make
            // DXGraphQLProvider fail with a duplicate-field error that takes down the whole
            // schema, not just this module's part of it. One namespaced field is one collision
            // surface, so the operations must NOT be reachable at the root.
            //
            // Asked as two queries rather than one, because graphql-java's "good faith
            // introspection" guard rejects a document that selects __Type.fields more than once
            // ("__Type.fields is present too often!"), which reaching for queryType AND
            // mutationType in a single query does.
            rootFieldsOf('Query').then((queryFields: string[]) => {
                expect(
                    queryFields.filter(name => name === 'topPages'),
                    'root Query fields named topPages'
                ).to.have.length(1);
                assertNoFlatOperations(queryFields, 'Query');
            });

            rootFieldsOf('Mutation').then((mutationFields: string[]) => {
                expect(
                    mutationFields.filter(name => name === 'topPages'),
                    'root Mutation fields named topPages'
                ).to.have.length(1);
                assertNoFlatOperations(mutationFields, 'Mutation');
            });
        });
    });

    describe('CRUD round trip', () => {
        // These run in order and build on each other, like 01-serverSettings: the whole point is
        // that a configuration created through the API can then be read, renamed and removed
        // through it.

        it('creates a configuration and answers with what was stored', () => {
            cy.login();
            run(createMutation(reportName), true).then(
                (result: ApolloOutcome<{topPages: {createReportConfiguration: ReportConfiguration}}>) => {
                    const created = result.data.topPages.createReportConfiguration;
                    expect(created.name).to.eq(reportName);
                    expect(created.awStatsUrl).to.eq(AWSTATS_REPORT_URL);
                    expect(created.includeFilter).to.eq('/en/');
                    expect(created.excludeFilter).to.eq('/private');
                    expect(created.titleFromHTML).to.eq(true);
                    expect(created.titleSeparator).to.eq(' | ');
                }
            );
        });

        it('writes all five properties on the JCR node', () => {
            cy.login();
            // Not a restatement of the previous test: the answer is built by re-reading the node,
            // but a property that was never written would still read back as absent here.
            // ConfigurationUtil.getSiteConfig() reads awStatsUrl, includeFilter and titleFromHTML
            // with getProperty() inside a try that swallows PathNotFoundException, so ONE missing
            // property makes the whole configuration read back as null for the rendering code.
            const path = `${SETTINGS_ROOT}/${reportName}`;
            readProperty(path, 'awStatsUrl').should('eq', AWSTATS_REPORT_URL);
            readProperty(path, 'includeFilter').should('eq', '/en/');
            readProperty(path, 'excludeFilter').should('eq', '/private');
            readProperty(path, 'titleFromHTML').should('eq', 'true');
            readProperty(path, 'titleSeparator').should('eq', ' | ');
        });

        it('reads one configuration back by name', () => {
            cy.login();
            run(gql`
                query {
                    topPages {
                        reportConfiguration(name: "${reportName}") { ${CONFIG_FIELDS} }
                    }
                }
            `).then((result: ApolloOutcome<{topPages: {reportConfiguration: ReportConfiguration}}>) => {
                expect(result.data.topPages.reportConfiguration.name).to.eq(reportName);
                expect(result.data.topPages.reportConfiguration.awStatsUrl).to.eq(AWSTATS_REPORT_URL);
            });
        });

        it('answers null, not an error, for a name that is not configured', () => {
            cy.login();
            // "No such configuration" is an ordinary answer to a read. It is also the answer for
            // a name the module refuses outright, on purpose: a distinguishable error would
            // confirm to a caller that an unreachable path exists.
            run(gql`
                query {
                    topPages {
                        absent: reportConfiguration(name: "e2e-no-such-report") { name }
                        refused: reportConfiguration(name: "${traversalName}") { name }
                    }
                }
            `).then((result: ApolloOutcome<{topPages: {absent: unknown; refused: unknown}}>) => {
                expect(result.data.topPages.absent).to.eq(null);
                expect(result.data.topPages.refused).to.eq(null);
            });
        });

        it('lists every configuration', () => {
            cy.login();
            run(createMutation(otherName), true);
            run(listQuery).then((result: ApolloOutcome<{topPages: {reportConfigurations: ReportConfiguration[]}}>) => {
                const names = result.data.topPages.reportConfigurations.map(c => c.name);
                expect(names).to.have.members([reportName, otherName]);
            });
        });

        it('updates and renames, leaving the arguments that were omitted alone', () => {
            cy.login();
            run(
                gql`
                mutation {
                    topPages {
                        updateReportConfiguration(
                            name: "${reportName}"
                            newName: "${renamedName}"
                            awStatsUrl: "http://awstats/renamed.pl"
                        ) { ${CONFIG_FIELDS} }
                    }
                }
            `,
                true
            ).then((result: ApolloOutcome<{topPages: {updateReportConfiguration: ReportConfiguration}}>) => {
                const updated = result.data.topPages.updateReportConfiguration;
                expect(updated.name).to.eq(renamedName);
                expect(updated.awStatsUrl).to.eq('http://awstats/renamed.pl');
                // Omitted arguments mean "leave it alone", not "clear it" -- a partial update
                // that silently wiped the filters would be the worst kind of success.
                expect(updated.includeFilter).to.eq('/en/');
                expect(updated.excludeFilter).to.eq('/private');
                expect(updated.titleFromHTML).to.eq(true);
                expect(updated.titleSeparator).to.eq(' | ');
            });

            storedNames().then((names: string[]) => {
                expect(names, 'the old node is gone').to.not.include(reportName);
                expect(names, 'the renamed node is there').to.include(renamedName);
            });
        });

        it('deletes a configuration, and refuses to delete it twice', () => {
            cy.login();
            run(gql`mutation { topPages { deleteReportConfiguration(name: "${renamedName}") } }`, true).then(
                (result: ApolloOutcome<{topPages: {deleteReportConfiguration: boolean}}>) => {
                    expect(result.data.topPages.deleteReportConfiguration).to.eq(true);
                }
            );

            storedNames().then((names: string[]) => {
                expect(names).to.not.include(renamedName);
            });

            run(gql`mutation { topPages { deleteReportConfiguration(name: "${renamedName}") } }`, true).then(
                (result: ApolloOutcome<unknown>) => {
                    expect(result.data, 'no data for a delete that found nothing').to.be.undefined;
                    expect(result.graphQLErrors[0].extensions.classification).to.eq('TopPagesConfigurationException');
                }
            );
        });
    });

    describe('input the module refuses', () => {
        it('rejects a name that is not a single safe path segment', () => {
            cy.login();
            // These writes run under a system session, so a name carrying '..' would address
            // content anywhere in the repository. The assertion is not only that the call failed
            // but that nothing at all was created: a refusal that still wrote a node somewhere
            // would look identical from the error alone.
            run(createMutation(traversalName), true).then((result: ApolloOutcome<unknown>) => {
                expect(result.data, 'no data for a refused name').to.be.undefined;
                expect(result.graphQLErrors[0].extensions.classification).to.eq('TopPagesConfigurationException');
                expect(result.graphQLErrors[0].message).to.contain('[A-Za-z0-9._-]{1,100}');
            });

            storedNames().then((names: string[]) => {
                expect(names, 'nothing was created for the refused name').to.have.members([otherName]);
            });
        });

        it('refuses a duplicate name instead of overwriting the stored configuration', () => {
            cy.login();
            run(
                gql`
                mutation {
                    topPages {
                        createReportConfiguration(
                            name: "${otherName}"
                            awStatsUrl: "http://awstats/overwritten.pl"
                        ) { name }
                    }
                }
            `,
                true
            ).then((result: ApolloOutcome<unknown>) => {
                expect(result.data, 'no data for a duplicate name').to.be.undefined;
                expect(result.graphQLErrors[0].extensions.classification).to.eq('TopPagesConfigurationException');
                expect(result.graphQLErrors[0].message).to.contain('already exists');
            });

            // The discriminating half: a silent overwrite would also report nothing useful, so
            // the existing configuration is read back and must be untouched.
            readProperty(`${SETTINGS_ROOT}/${otherName}`, 'awStatsUrl').should('eq', AWSTATS_REPORT_URL);
        });
    });

    describe('authorization', () => {
        const forbiddenName = 'e2e-graphql-forbidden';

        /**
         * A GraphQL call with no credentials at all.
         *
         * cy.apolloClient() cannot express this: with neither a token nor a username it falls
         * back to root's Basic header, so an "anonymous" apollo client would quietly be root.
         * A raw request is the only way to send none. The Origin header is set explicitly because
         * Jahia's API security filter auto-applies the hosted scope on a same-origin call, which
         * is exactly the path a browser would take.
         */
        const anonymousCall = (
            query: string
        ): Cypress.Chainable<
            Cypress.Response<{
                data?: unknown;
                errors?: Array<{message: string; extensions?: {classification?: string}}>;
            }>
        > =>
            cy.request({
                method: 'POST',
                url: '/modules/graphql',
                headers: {'Content-Type': 'application/json', Origin: String(Cypress.config().baseUrl)},
                body: {query},
                failOnStatusCode: false
            });

        /**
         * Run a call as someone other than root.
         *
         * Chained rather than two statements: cy.apolloClient() is registered with
         * `prevSubject: 'optional'`, so the client it yields is handed straight to cy.apollo as
         * its subject. Calling them separately would make cy.apollo fall back to the aliased
         * client instead, which is one more thing to get wrong.
         */
        const callAs = (
            username: string,
            password: string,
            options: {
                query?: DocumentNode;
                mutation?: DocumentNode;
            }
        ): Cypress.Chainable => cy.apolloClient({username, password}).apollo(options);

        after(() => {
            cy.login();
            deleteSiteConfig(forbiddenName);
        });

        it('lets a server administrator read and write (positive control)', () => {
            // Without this, a blanket failure would make every negative below pass for the wrong
            // reason -- the same trap 04-permissions guards against for the settings page.
            cy.login();
            run(listQuery).then((result: ApolloOutcome<{topPages: {reportConfigurations: ReportConfiguration[]}}>) => {
                expect(result.data.topPages.reportConfigurations.map(c => c.name)).to.include(otherName);
            });
        });

        it('refuses the editor mathias', () => {
            // The user root is the JCR system user and bypasses the access manager, so it proves
            // nothing about permissions; mathias is an ordinary editor shipped by Digitall.
            callAs('mathias', 'password', {query: listQuery}).then((result: ApolloOutcome<unknown>) => {
                expect(result.data, 'no data for an editor').to.be.undefined;
                expect(result.graphQLErrors[0].extensions.classification).to.eq('GqlAccessDeniedException');
            });

            callAs('mathias', 'password', {mutation: createMutation(forbiddenName)}).then(
                (result: ApolloOutcome<unknown>) => {
                    expect(result.data, 'no data for an editor mutation').to.be.undefined;
                    expect(result.graphQLErrors[0].extensions.classification).to.eq('GqlAccessDeniedException');
                }
            );
        });

        it('refuses an anonymous caller', () => {
            cy.logout();

            anonymousCall('query { topPages { reportConfigurations { name } } }').then(response => {
                expect(response.body.data, 'no data for an anonymous query').to.be.null;
                expect(response.body.errors[0].extensions.classification).to.eq('GqlAccessDeniedException');
            });

            anonymousCall(
                `mutation { topPages { createReportConfiguration(name: "${forbiddenName}", awStatsUrl: "http://x") { name } } }`
            ).then(response => {
                expect(response.body.data, 'no data for an anonymous mutation').to.be.null;
                expect(response.body.errors[0].extensions.classification).to.eq('GqlAccessDeniedException');
            });
        });

        it('wrote nothing for either refused caller', () => {
            // The refusals above are only worth something if they refused the *write* and not
            // merely the response: the configuration they both tried to create must not exist.
            cy.login();
            storedNames().then((names: string[]) => {
                expect(names, 'a refused caller created nothing').to.not.include(forbiddenName);
            });
        });
    });
});
