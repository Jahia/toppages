package org.jahia.modules.graphql;

import graphql.annotations.annotationTypes.GraphQLDescription;
import graphql.annotations.annotationTypes.GraphQLField;
import graphql.annotations.annotationTypes.GraphQLName;
import graphql.annotations.annotationTypes.GraphQLNonNull;
import org.jahia.modules.models.TopPagesNode;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.TimeZone;

/**
 * One {@code jtopmix:topPages} content node, as the administration's diagnostic listing sees it.
 *
 * <p>A read-only projection of {@link TopPagesNode}, for the same reason
 * {@link GqlReportConfiguration} is one of {@code SiteConfiguration}: the model class is a mutable
 * bean and the schema should not carry its setters.
 *
 * <p>{@code parentPage} is deliberately nullable. A Top Pages node does not have to live inside a
 * page - content under {@code /sites/<site>/contents} has no {@code jnt:page} ancestor - and such
 * a node must still be listed. Null here is what tells the UI to render no "open the page" link
 * rather than one pointing at {@code /cms/edit/default/en/.html}.
 */
@GraphQLName("TopPagesContentNode")
@GraphQLDescription("A jtopmix:topPages content node, as listed by the administration diagnostics")
public class GqlTopPagesNode {

    /**
     * ISO-8601 in UTC. A GraphQL scalar for the date would be nicer, but the platform's own
     * date-time scalar is not something this module can depend on without pulling in more of the
     * provider's API surface, and the only consumer formats it for display anyway.
     */
    private static final String ISO_8601 = "yyyy-MM-dd'T'HH:mm:ss'Z'";

    private final TopPagesNode node;

    public GqlTopPagesNode(TopPagesNode node) {
        this.node = node;
    }

    @GraphQLField
    @GraphQLName("name")
    @GraphQLNonNull
    @GraphQLDescription("Name of the JCR node")
    public String getName() {
        return node.getName();
    }

    @GraphQLField
    @GraphQLName("path")
    @GraphQLNonNull
    @GraphQLDescription("Path of the JCR node in the edit workspace")
    public String getPath() {
        return node.getPath();
    }

    @GraphQLField
    @GraphQLName("reportConfiguration")
    @GraphQLDescription("Name of the report configuration the node reads, as stored in jahiaSite")
    public String getReportConfiguration() {
        return node.getJahiaSite();
    }

    @GraphQLField
    @GraphQLName("lastPublished")
    @GraphQLDescription("When the node was last published, ISO-8601 in UTC, or null when it never was")
    public String getLastPublished() {
        Date lastPublished = node.getLastPublished();
        if (lastPublished == null) {
            return null;
        }
        SimpleDateFormat format = new SimpleDateFormat(ISO_8601);
        format.setTimeZone(TimeZone.getTimeZone("UTC"));
        return format.format(lastPublished);
    }

    @GraphQLField
    @GraphQLName("parentPage")
    @GraphQLDescription("Path of the jnt:page the node is rendered in, or null when it sits outside any page")
    public String getParentPage() {
        return node.getParentPage();
    }

    @GraphQLField
    @GraphQLName("defaultLanguage")
    @GraphQLDescription("Default language of the site the node belongs to, for building an edit URL")
    public String getDefaultLanguage() {
        return node.getDefaultLanguage();
    }
}
