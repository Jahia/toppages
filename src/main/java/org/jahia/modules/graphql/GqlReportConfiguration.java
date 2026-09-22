package org.jahia.modules.graphql;

import graphql.annotations.annotationTypes.GraphQLDescription;
import graphql.annotations.annotationTypes.GraphQLField;
import graphql.annotations.annotationTypes.GraphQLName;
import graphql.annotations.annotationTypes.GraphQLNonNull;
import org.jahia.modules.models.SiteConfiguration;

/**
 * One AWStats report configuration, as stored in a {@code jtopmix:siteConfig} node under
 * {@code /settings/top-pages}.
 *
 * <p>A read-only projection of {@link SiteConfiguration}, which is a mutable bean the module also
 * writes through; a schema should not carry its setters. All five stored properties are exposed,
 * because a configuration missing any one of them is one the rendering code reads back as null -
 * so being able to see which one is absent is the point.
 */
@GraphQLName("TopPagesReportConfiguration")
@GraphQLDescription("An AWStats report configuration stored under /settings/top-pages")
public class GqlReportConfiguration {

    private final SiteConfiguration config;

    public GqlReportConfiguration(SiteConfiguration config) {
        this.config = config;
    }

    @GraphQLField
    @GraphQLName("name")
    @GraphQLNonNull
    @GraphQLDescription("Name of the configuration, and of the JCR node holding it")
    public String getName() {
        return config.getSiteName();
    }

    @GraphQLField
    @GraphQLName("awStatsUrl")
    @GraphQLDescription("URL of the AWStats report this configuration reads")
    public String getAwStatsUrl() {
        return config.getReportUrl();
    }

    @GraphQLField
    @GraphQLName("includeFilter")
    @GraphQLDescription("AWStats urlfilter applied when fetching the report")
    public String getIncludeFilter() {
        return config.getIncludeFilter();
    }

    @GraphQLField
    @GraphQLName("excludeFilter")
    @GraphQLDescription("Comma-separated URL fragments dropped from the report")
    public String getExcludeFilter() {
        return config.getExcludeFilter();
    }

    @GraphQLField
    @GraphQLName("titleFromHTML")
    @GraphQLDescription("Whether page titles are read from the fetched HTML rather than from the report")
    public boolean isTitleFromHTML() {
        return config.isTitleFromHTML();
    }

    @GraphQLField
    @GraphQLName("titleSeparator")
    @GraphQLDescription("Separator whose trailing part is stripped from a title read from HTML")
    public String getTitleSeparator() {
        return config.getTitleSeparator();
    }
}
