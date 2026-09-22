package org.jahia.modules.graphql;

/**
 * The permission every Top Pages GraphQL field is gated on.
 *
 * <p>{@code /settings/top-pages} is repository-wide configuration that every Top Pages component
 * on every site reads, and the module writes it under a <em>system</em> session, which bypasses
 * the access manager entirely. The web flow that edits the same nodes is reachable only from the
 * server administration; an API over the same data has to be no easier to reach, or it is simply
 * a way around that page.
 *
 * <p>{@code administrationAccess} is the server-scope permission that grants the administration
 * itself, declared by the {@code serverSettings} module - which this module already depends on,
 * so the permission always exists wherever this code runs. {@code @GraphQLRequiresPermission}
 * resolves it with {@code session.getNode("/").hasPermission(...)} against the <em>caller's</em>
 * session, so the system session the service uses afterwards never enters into it.
 */
public final class TopPagesPermissions {

    /** Server administration access, declared by the serverSettings module. */
    public static final String ADMINISTRATION = "administrationAccess";

    private TopPagesPermissions() {
        // constants holder
    }
}
