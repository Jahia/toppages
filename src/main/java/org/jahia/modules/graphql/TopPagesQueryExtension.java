package org.jahia.modules.graphql;

import graphql.annotations.annotationTypes.GraphQLDescription;
import graphql.annotations.annotationTypes.GraphQLField;
import graphql.annotations.annotationTypes.GraphQLName;
import graphql.annotations.annotationTypes.GraphQLNonNull;
import graphql.annotations.annotationTypes.GraphQLTypeExtension;
import org.jahia.modules.graphql.provider.dxm.DXGraphQLProvider;
import org.jahia.modules.graphql.provider.dxm.security.GraphQLRequiresPermission;

/**
 * The module's single entry point on the root {@code Query} type.
 *
 * <p>One field, {@code topPages}, returning a namespace type that carries the actual operations.
 * Not several flat fields, and this is not a style preference: every module's extensions are
 * folded into one schema, two bundles declaring the same root field make {@code DXGraphQLProvider}
 * fail with a duplicate-field error, and that failure takes down the <em>whole</em> schema, not
 * just this module's part of it. One field named after the module is one collision surface.
 *
 * <p>The namespace comes from the return type, {@link TopPagesQuery} - {@code @GraphQLName} only
 * renames the field.
 */
@GraphQLTypeExtension(DXGraphQLProvider.Query.class)
@GraphQLDescription("Top Pages queries")
public class TopPagesQueryExtension {

    private TopPagesQueryExtension() {
        // The single field below is static: graphql-java-annotations invokes it without an
        // instance, so this class is never constructed.
    }

    @GraphQLField
    @GraphQLName("topPages")
    @GraphQLNonNull
    @GraphQLDescription("Top Pages report configuration")
    @GraphQLRequiresPermission(TopPagesPermissions.ADMINISTRATION)
    public static TopPagesQuery getTopPages() {
        return new TopPagesQuery();
    }
}
