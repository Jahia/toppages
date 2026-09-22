package org.jahia.modules.graphql;

import graphql.annotations.annotationTypes.GraphQLDescription;
import graphql.annotations.annotationTypes.GraphQLField;
import graphql.annotations.annotationTypes.GraphQLName;
import graphql.annotations.annotationTypes.GraphQLNonNull;
import graphql.annotations.annotationTypes.GraphQLTypeExtension;
import org.jahia.modules.graphql.provider.dxm.DXGraphQLProvider;
import org.jahia.modules.graphql.provider.dxm.security.GraphQLRequiresPermission;

/**
 * The module's single entry point on the root {@code Mutation} type.
 *
 * <p>Same shape, and same reason, as {@link TopPagesQueryExtension}: one field carrying a
 * namespace type rather than one root field per operation.
 */
@GraphQLTypeExtension(DXGraphQLProvider.Mutation.class)
@GraphQLDescription("Top Pages mutations")
public class TopPagesMutationExtension {

    @GraphQLField
    @GraphQLName("topPages")
    @GraphQLNonNull
    @GraphQLDescription("Top Pages report configuration")
    @GraphQLRequiresPermission(TopPagesPermissions.ADMINISTRATION)
    public static TopPagesMutation getTopPages() {
        return new TopPagesMutation();
    }
}
