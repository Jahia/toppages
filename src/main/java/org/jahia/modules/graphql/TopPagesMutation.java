package org.jahia.modules.graphql;

import graphql.annotations.annotationTypes.GraphQLDescription;
import graphql.annotations.annotationTypes.GraphQLField;
import graphql.annotations.annotationTypes.GraphQLName;
import graphql.annotations.annotationTypes.GraphQLNonNull;
import org.jahia.modules.graphql.provider.dxm.security.GraphQLRequiresPermission;
import org.jahia.modules.models.SiteConfiguration;
import org.jahia.modules.utils.ConfigurationUtil;
import org.jahia.modules.utils.SafeNames;

/**
 * Write side of the Top Pages API. Reached as {@code mutation { topPages { ... } }}.
 *
 * <p>Every refusal is a GraphQL error, not a false return value: the caller asked for a write
 * that did not happen, and a boolean that has to be inspected is exactly how such a failure gets
 * ignored. {@link ConfigurationUtil} decides <em>whether</em> a write is legal; this class only
 * turns its answer into an error message.
 */
@GraphQLName("TopPagesMutation")
@GraphQLDescription("Create, update and delete Top Pages report configurations")
public class TopPagesMutation {

    @GraphQLField
    @GraphQLName("createReportConfiguration")
    @GraphQLDescription("Store a new report configuration; fails when one already exists under that name")
    @GraphQLRequiresPermission(TopPagesPermissions.ADMINISTRATION)
    public GqlReportConfiguration createReportConfiguration(
            @GraphQLName("name") @GraphQLNonNull
            @GraphQLDescription("Name of the configuration; also its JCR node name, so it must match "
                    + "[A-Za-z0-9._-]{1,100}") String name,
            @GraphQLName("awStatsUrl") @GraphQLNonNull
            @GraphQLDescription("URL of the AWStats report") String awStatsUrl,
            @GraphQLName("includeFilter")
            @GraphQLDescription("AWStats urlfilter; defaults to empty") String includeFilter,
            @GraphQLName("excludeFilter")
            @GraphQLDescription("Comma-separated URL fragments to drop; defaults to empty") String excludeFilter,
            @GraphQLName("titleFromHTML")
            @GraphQLDescription("Read titles from the page HTML; defaults to false") Boolean titleFromHTML,
            @GraphQLName("titleSeparator")
            @GraphQLDescription("Separator stripped from an HTML title; defaults to empty") String titleSeparator) {

        // All five properties are written, including the ones the caller left out: the rendering
        // code reads three of them with getProperty() inside a try that swallows
        // PathNotFoundException, so one missing property makes the whole configuration read back
        // as null.
        SiteConfiguration config = new SiteConfiguration(name, awStatsUrl,
                orEmpty(includeFilter), orEmpty(excludeFilter),
                Boolean.TRUE.equals(titleFromHTML), orEmpty(titleSeparator));

        check(TopPagesGraphQL.configurationService().createSiteConfig(config), name);
        return reload(name);
    }

    @GraphQLField
    @GraphQLName("updateReportConfiguration")
    @GraphQLDescription("Update a report configuration, optionally renaming it. "
            + "An argument that is not supplied leaves the stored value alone.")
    @GraphQLRequiresPermission(TopPagesPermissions.ADMINISTRATION)
    public GqlReportConfiguration updateReportConfiguration(
            @GraphQLName("name") @GraphQLNonNull
            @GraphQLDescription("Name the configuration is currently stored under") String name,
            @GraphQLName("newName")
            @GraphQLDescription("New name; renaming onto an existing configuration is refused") String newName,
            @GraphQLName("awStatsUrl")
            @GraphQLDescription("URL of the AWStats report") String awStatsUrl,
            @GraphQLName("includeFilter")
            @GraphQLDescription("AWStats urlfilter") String includeFilter,
            @GraphQLName("excludeFilter")
            @GraphQLDescription("Comma-separated URL fragments to drop") String excludeFilter,
            @GraphQLName("titleFromHTML")
            @GraphQLDescription("Read titles from the page HTML") Boolean titleFromHTML,
            @GraphQLName("titleSeparator")
            @GraphQLDescription("Separator stripped from an HTML title") String titleSeparator) {

        ConfigurationUtil service = TopPagesGraphQL.configurationService();

        // Read-modify-write rather than a blind overwrite, so that a caller who only wants to
        // change the URL does not silently erase the filters by omitting them. The read also
        // separates "no such configuration" from "the write failed", which the service cannot do
        // once a rename is in play.
        SiteConfiguration stored = service.getSiteConfig(name);
        if (stored == null) {
            throw new TopPagesConfigurationException(notFound(name));
        }

        SiteConfiguration updated = new SiteConfiguration(
                newName == null ? stored.getSiteName() : newName,
                awStatsUrl == null ? stored.getReportUrl() : awStatsUrl,
                includeFilter == null ? stored.getIncludeFilter() : includeFilter,
                excludeFilter == null ? stored.getExcludeFilter() : excludeFilter,
                titleFromHTML == null ? stored.isTitleFromHTML() : titleFromHTML,
                titleSeparator == null ? stored.getTitleSeparator() : titleSeparator);

        check(service.updateSiteConfig(name, updated), updated.getSiteName());
        return reload(updated.getSiteName());
    }

    @GraphQLField
    @GraphQLName("deleteReportConfiguration")
    @GraphQLNonNull
    @GraphQLDescription("Remove a report configuration; fails when there is none under that name")
    @GraphQLRequiresPermission(TopPagesPermissions.ADMINISTRATION)
    public boolean deleteReportConfiguration(
            @GraphQLName("name") @GraphQLNonNull
            @GraphQLDescription("Name of the configuration to remove") String name) {
        check(TopPagesGraphQL.configurationService().deleteSiteConfig(name), name);
        return true;
    }

    /** Turn a refused write into the GraphQL error the caller sees. */
    private static void check(ConfigurationUtil.Result result, String name) {
        switch (result) {
            case OK:
                return;
            case INVALID_NAME:
                // The name is echoed back deliberately: it is the caller's own input, and the
                // rule it broke is public (see SafeNames).
                throw new TopPagesConfigurationException("'" + name
                        + "' is not a valid report configuration name; it must match "
                        + SafeNames.SAFE_NAME_PATTERN);
            case DUPLICATE:
                throw new TopPagesConfigurationException(
                        "A report configuration named '" + name + "' already exists");
            case NOT_FOUND:
                throw new TopPagesConfigurationException(notFound(name));
            default:
                throw new TopPagesConfigurationException(
                        "The repository refused the operation on report configuration '" + name
                                + "'; see the server log");
        }
    }

    private static String notFound(String name) {
        return "There is no report configuration named '" + name + "'";
    }

    /**
     * Read the configuration back out of the repository rather than echoing the input, so the
     * answer is what was actually stored.
     */
    private static GqlReportConfiguration reload(String name) {
        SiteConfiguration stored = TopPagesGraphQL.configurationService().getSiteConfig(name);
        if (stored == null) {
            throw new TopPagesConfigurationException(
                    "Report configuration '" + name + "' was written but cannot be read back");
        }
        return new GqlReportConfiguration(stored);
    }

    private static String orEmpty(String value) {
        return value == null ? "" : value;
    }
}
