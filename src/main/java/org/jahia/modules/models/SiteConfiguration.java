package org.jahia.modules.models;

import java.io.Serializable;


/**
 * One AWStats report configuration, as stored in a {@code jtopmix:siteConfig} node under
 * {@code /settings/top-pages}.
 *
 * <p>A plain bean, carrying no framework of its own: it used to double as a Spring Web Flow form
 * model, with bean-validation constraints and a message-resolver helper, and both went with the
 * flow. The mandatory-field rules they expressed are now enforced where they belong - the GraphQL
 * schema makes {@code name} and {@code awStatsUrl} non-null arguments, and
 * {@link org.jahia.modules.utils.ConfigurationUtil} refuses an unsafe name - so the same input is
 * still rejected, by the surface the caller actually reaches.
 */
public class SiteConfiguration implements Serializable {

    private String siteName;
    private String reportUrl;
    private String includeFilter;
    private String excludeFilter;
    private boolean titleFromHTML = false;
    private String titleSeparator;

    public boolean isTitleFromHTML() {
        return titleFromHTML;
    }

    public void setTitleFromHTML(boolean titleFromHTML) {
        this.titleFromHTML = titleFromHTML;
    }


    public String getTitleSeparator() {
        return titleSeparator;
    }

    public void setTitleSeparator(String titleSeparator) {
        this.titleSeparator = titleSeparator;
    }


    public SiteConfiguration() {
    }

    public SiteConfiguration(String siteName, String reportUrl, String includeFilter, String excludeFilter, boolean titleFromHTML, String titleSeparator) {
        this.siteName = siteName;
        this.reportUrl = reportUrl;
        this.includeFilter = includeFilter;
        this.excludeFilter = excludeFilter;
        this.titleFromHTML = titleFromHTML;
        this.titleSeparator = titleSeparator;
    }

    public String getSiteName() {
        return siteName;
    }

    public void setSiteName(String siteName) {
        this.siteName = siteName;
    }

    public String getReportUrl() {
        return reportUrl;
    }

    public void setReportUrl(String reportUrl) {
        this.reportUrl = reportUrl;
    }

    public String getIncludeFilter() {
        return includeFilter;
    }

    public void setIncludeFilter(String includeFilter) {
        this.includeFilter = includeFilter;
    }

    public String getExcludeFilter() {
        return excludeFilter;
    }

    public void setExcludeFilter(String excludeFilter) {
        this.excludeFilter = excludeFilter;
    }

}


