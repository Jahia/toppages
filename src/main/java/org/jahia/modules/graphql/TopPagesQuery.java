package org.jahia.modules.graphql;

import graphql.annotations.annotationTypes.GraphQLDescription;
import graphql.annotations.annotationTypes.GraphQLField;
import graphql.annotations.annotationTypes.GraphQLName;
import graphql.annotations.annotationTypes.GraphQLNonNull;
import org.jahia.modules.graphql.provider.dxm.security.GraphQLRequiresPermission;
import org.jahia.modules.models.SiteConfiguration;
import org.jahia.modules.models.TopPagesNode;
import org.jahia.modules.utils.TopPagesNodeLister;

import java.util.ArrayList;
import java.util.List;

/**
 * Read side of the Top Pages API. Reached as {@code query { topPages { ... } }}.
 */
@GraphQLName("TopPagesQuery")
@GraphQLDescription("Read the Top Pages report configurations")
public class TopPagesQuery {

    @GraphQLField
    @GraphQLName("reportConfigurations")
    @GraphQLNonNull
    @GraphQLDescription("Every report configuration stored under /settings/top-pages")
    @GraphQLRequiresPermission(TopPagesPermissions.ADMINISTRATION)
    public List<GqlReportConfiguration> getReportConfigurations() {
        List<GqlReportConfiguration> result = new ArrayList<>();
        for (SiteConfiguration config : TopPagesGraphQL.configurationService().getSiteConfigs()) {
            result.add(new GqlReportConfiguration(config));
        }
        return result;
    }

    @GraphQLField
    @GraphQLName("reportConfiguration")
    @GraphQLDescription("A single report configuration, or null when there is none under that name")
    @GraphQLRequiresPermission(TopPagesPermissions.ADMINISTRATION)
    public GqlReportConfiguration getReportConfiguration(
            @GraphQLName("name") @GraphQLNonNull
            @GraphQLDescription("Name of the configuration") String name) {
        // No name validation here on purpose: getSiteConfig() refuses anything that is not a
        // single safe path segment and answers null, which is the same answer as "there is no
        // configuration called that". Telling the two apart would only confirm to a caller that
        // an unreachable path exists.
        SiteConfiguration config = TopPagesGraphQL.configurationService().getSiteConfig(name);
        return config == null ? null : new GqlReportConfiguration(config);
    }

    @GraphQLField
    @GraphQLName("contentNodes")
    @GraphQLNonNull
    @GraphQLDescription("Every jtopmix:topPages content node in the edit workspace, for diagnostics: "
            + "which report each one reads, and which page - if any - it is rendered in")
    @GraphQLRequiresPermission(TopPagesPermissions.ADMINISTRATION)
    public List<GqlTopPagesNode> getContentNodes() {
        List<GqlTopPagesNode> result = new ArrayList<>();
        for (TopPagesNode node : TopPagesNodeLister.listAll()) {
            result.add(new GqlTopPagesNode(node));
        }
        return result;
    }
}
