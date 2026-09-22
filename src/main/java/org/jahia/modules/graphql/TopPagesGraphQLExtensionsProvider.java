package org.jahia.modules.graphql;

import org.jahia.modules.graphql.provider.dxm.DXGraphQLExtensionsProvider;
import org.osgi.service.component.annotations.Component;

import java.util.Arrays;
import java.util.Collection;

/**
 * Registers this module's GraphQL types with {@code graphql-dxm-provider}.
 *
 * <p>The provider tracks every {@link DXGraphQLExtensionsProvider} service and folds the classes
 * it returns into the one schema the platform serves at {@code /modules/graphql}. The interface's
 * default {@code getExtensions()} would find the same two classes by scanning this bundle for
 * {@code @GraphQLTypeExtension}, but only under this class's own package and below; listing them
 * is one line and does not break the day someone puts an extension elsewhere.
 *
 * <p>The package imports this pulls in are optional, as every import of this bundle is (the
 * Jahia parent POM's bnd configuration makes them so), so a platform without the GraphQL
 * provider still resolves the module - this one component simply never activates, and the rest
 * of the module carries on.
 */
@Component(service = DXGraphQLExtensionsProvider.class, immediate = true)
public class TopPagesGraphQLExtensionsProvider implements DXGraphQLExtensionsProvider {

    @Override
    public Collection<Class<?>> getExtensions() {
        return Arrays.<Class<?>>asList(TopPagesQueryExtension.class, TopPagesMutationExtension.class);
    }
}
