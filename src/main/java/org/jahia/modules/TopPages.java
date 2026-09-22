package org.jahia.modules;


import org.apache.commons.lang.StringUtils;
import org.apache.http.client.utils.URIBuilder;
import org.jahia.modules.models.SiteConfiguration;
import org.jahia.modules.models.AWStatsPage;
import org.jahia.modules.utils.ConfigurationUtil;
import org.jahia.modules.utils.HttpClientUtil;
import org.jahia.modules.utils.SafeText;
import org.jahia.modules.utils.SafeUrls;
import org.jahia.services.content.JCRNodeWrapper;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;
import org.jsoup.select.Elements;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import javax.jcr.RepositoryException;
import java.io.IOException;
import java.net.URISyntaxException;
import java.util.*;

public class TopPages {

    Logger logger = LoggerFactory.getLogger(TopPages.class);

    private ConfigurationUtil configurationUtil;

    public void setConfigurationUtil(ConfigurationUtil configurationUtil) {
        this.configurationUtil = configurationUtil;
    }

    private static final String P_INCLUDEFILTER = "includeFilter";
    private static final String P_EXCLUDEFILTER = "excludeFilter";
    private static final String P_JSONRESULT = "jsonResult";
    private static final String P_AWSTATSURL = "awStatsUrl";
    private static final String P_JAHIASITE = "jahiaSite";
    private static final String P_NUMBEROFRESULST = "numberOfResults";
    private static final String P_NMONTHS = "nMonths";
    private static final String P_LASTERROR = "lastErrorReceived";
    private static final String P_OVERRIDECONFIG = "overrideConfig";
    private static final String P_TITLEFROMHTML = "titleFromHTML";
    private static final String P_TITLESEPARATOR = "titleSeparator";

    private static final String NT_TOPPAGES = "jtopmix:topPages";

    /**
     * The properties read with getProperty() below, which throws rather than returning null.
     * jahiaSite, includeFilter, excludeFilter, awStatsUrl and titleSeparator are read with
     * getPropertyAsString() and are allowed to be absent.
     */
    private static final String[] REQUIRED_PROPERTIES = {
            P_OVERRIDECONFIG, P_TITLEFROMHTML, P_NMONTHS, P_NUMBEROFRESULST
    };

    private static final String F_TOPPAGES = "topPages";

    private static final String EMPTY_RESULT = "{\"" + F_TOPPAGES + "\":[]}";


    /**
     * Get pages stats from awstats and update the statsPages map, if a page exists, the view count will be aggregated
     * Awstats by default sorts the result by view count.
     *
     * @param numberOfResults number of items(pages) to get from the awstats report
     * @param uriBuilder      type of report from the jahiaSites map (academy, store, documentation)
     * @param errorMessages   collects the messages shown to the editor; never shared between calls
     */
    public void getPages(long numberOfResults, HttpClientUtil httpclient, URIBuilder uriBuilder,
                         Map<String, AWStatsPage> statsPagesMap, boolean titleFromHTML, String titleSeparator,
                         JSONArray errorMessages) {

        String html = httpclient.getHtmlPage(uriBuilder);
        if (StringUtils.isEmpty(html)) {
            logger.error("unable to retreive html page from awstats");
            return;
        }

        try {
            Document doc = Jsoup.parse(html);
            //get the first table with class aws_data
            Element statsTable = doc.select("table.aws_data").get(1);
            // get rows from the second row row onwards, the first is for the table header!
            Elements statsRows = statsTable.select("tr:gt(0)");
            //table rows iterator
            Iterator<Element> rowsIterator = statsRows.iterator();
            while (rowsIterator.hasNext() && numberOfResults-- > 0) {
                Element row = rowsIterator.next();
                Element link = row.select("td.aws>a[href]").first();
                // The report is a remote document: everything read out of it is untrusted input.
                String linkHref = SafeText.stripUrl(link.attr("href"));

                Element viewCountsCol = row.select("td:nth-child(2)").first();
                String viewCountHtml = viewCountsCol.html().replace(",", ""); //remove comma
                int viewCounts = Integer.parseInt(viewCountHtml);
                String title = titleFromHTML
                        ? readTitleFromPage(httpclient, linkHref, titleSeparator)
                        : getTitleFromLink(linkHref);

                AWStatsPage page = new AWStatsPage(linkHref, title, viewCounts);
                //update the count if page already exists in the map
                if (statsPagesMap.containsKey(title)) {
                    AWStatsPage p = statsPagesMap.get(title);
                    long newViewCount = p.getViewCount() + viewCounts;
                    p.setViewCount(newViewCount);
                } else {
                    statsPagesMap.put(title, page);
                }

            }

        } catch (Exception e) {
            errorMessages.put("Error while processing the html source of the report page");
            logger.error("Error while retrieving json from html", e);
        }


    }

    /**
     * Fetch the page behind a report row and take its title from the html {@code <title>} tag.
     * The fetch goes through {@link HttpClientUtil}, so the same outbound allow-list applies to
     * this second hop as to the report itself.
     *
     * @return the title, stripped of any markup, never null
     */
    private String readTitleFromPage(HttpClientUtil httpclient, String linkHref, String titleSeparator)
            throws URISyntaxException {
        String pageHtml = httpclient.getHtmlPage(new URIBuilder(linkHref));
        if (StringUtils.isEmpty(pageHtml)) {
            // Fall back to the link itself: an empty title for every unreachable page would
            // collapse all of them onto a single entry of the result map.
            return getTitleFromLink(linkHref);
        }

        String title = SafeText.stripMarkup(Jsoup.parse(pageHtml).title());
        if (StringUtils.isEmpty(title)) {
            return getTitleFromLink(linkHref);
        }
        if (StringUtils.isEmpty(titleSeparator)) {
            return title;
        }

        int separatorIdx = title.indexOf(titleSeparator);
        return separatorIdx > 0 ? title.substring(0, separatorIdx).trim() : title;
    }

    /**
     * This method retrieves the top N results (specified in the numberOfResults parameter) of the last N months from awstats report
     * The returns a JSONObject for the list of N sorted by view Count
     *
     * @param numberOfResults: number of results to retrieve
     * @param uri:             uri of the awstats to get the pages for
     * @param nMonths:         the number of past months
     * @param errorMessages:   collects the messages shown to the editor; never shared between calls
     */
    private JSONObject getTopPagesForNMonths(long numberOfResults, URIBuilder uri, long nMonths,
                                             boolean titleFromHTML, String titleSepartor, JSONArray errorMessages) {

        JSONObject result = null;
        // The client owns a pooled connection manager, so it is closed as soon as the report is read.
        try (HttpClientUtil httpClientUtil = new HttpClientUtil()) {
            if (!httpClientUtil.testConnection(uri)) {
                errorMessages.put(httpClientUtil.getErrorMessage());

                return null;
            }
            // Start from current year and month
            int year = Calendar.getInstance().get(Calendar.YEAR);
            int month = Calendar.getInstance().get(Calendar.MONTH);

            Map<String, AWStatsPage> resultMap = new HashMap<>();
            while (nMonths-- > 0) {
                uri.setParameter("year", String.valueOf(year));
                uri.setParameter("month", String.valueOf(month + 1)); //months starts at 0 in java Calendar

                getPages(numberOfResults, httpClientUtil, uri, resultMap, titleFromHTML, titleSepartor, errorMessages);

                //previous month
                Calendar calNow = Calendar.getInstance();
                calNow.add(Calendar.MONTH, -1);
                year = calNow.get(Calendar.YEAR);
                month = calNow.get(Calendar.MONTH);

            }
            // Sort the result
            List<AWStatsPage> pagesList = new ArrayList<>(resultMap.values());
            Collections.sort(pagesList, Collections.<AWStatsPage>reverseOrder());

            result = buildJsonResult(pagesList, numberOfResults, errorMessages);
        } catch (IOException e) {
            // Thrown by the close() of the resource above, once the result is already built.
            logger.warn("Unable to close the http client", e);
        }

        return result;
    }

    /**
     * Build the JSON payload persisted in {@code jsonResult}, capped at numberOfResults entries.
     */
    private JSONObject buildJsonResult(List<AWStatsPage> pagesList, long numberOfResults, JSONArray errorMessages) {
        JSONObject jsonResult = new JSONObject();
        long remaining = numberOfResults;
        try {
            JSONArray pagesjsonArray = new JSONArray();
            for (AWStatsPage sPage : pagesList) {
                JSONObject page = new JSONObject();
                page.put("title", sPage.getTitle());
                page.put("href", sPage.getUrl());
                page.put("count", sPage.getViewCount());

                pagesjsonArray.put(page);
                if (--remaining < 1)
                    break;
            }
            jsonResult.put(F_TOPPAGES, pagesjsonArray);
        } catch (JSONException e) {
            logger.error("error while parsing the JSON Result", e);
            errorMessages.put("error while parsing JSON result");
        }

        return jsonResult;
    }

    /**
     * Return a title from a link
     *
     * @param linkHref
     * @return
     */
    private String getTitleFromLink(String linkHref) {
        int idx = linkHref.lastIndexOf('/') + 1;
        String lastPart = linkHref.substring(idx, linkHref.length());
        lastPart = lastPart.replace(".html", "");
        lastPart = lastPart.replace("-", " ");
        if (lastPart.isEmpty()) {
            return "";
        }
        String title = lastPart.substring(0, 1).toUpperCase() + lastPart.substring(1).toLowerCase();

        return SafeText.stripMarkup(StringUtils.capitalize(title));
    }

    /**
     * Get top pages from JCR, the top pages is saved in JCR as a JSON String in the jsonResult property.
     *
     * <p>This is the read path, reachable anonymously through {@code getTopPages.do}: it never
     * writes to the repository and never issues an outbound request. A node whose result has not
     * been computed yet reads back as an empty result; computing it is the job of
     * {@link #updateTopPages(JCRNodeWrapper)}, the scheduled job or the editor's button.
     *
     * @param node
     * @return the stored result, or an empty result when there is none
     */
    public JSONObject getTopPages(JCRNodeWrapper node) {
        logger.info("Getting top Pages for node: {}", node.getPath());

        try {
            if (node.hasProperty(P_JSONRESULT)) {
                return new JSONObject(node.getPropertyAsString(P_JSONRESULT));
            }
            logger.info("No result stored yet for node {}, returning an empty result", node.getPath());
        } catch (RepositoryException | JSONException e) {
            logger.error("error while getting top pages node from JCR: ", e);
        }

        return emptyResult();
    }

    private JSONObject emptyResult() {
        try {
            return new JSONObject(EMPTY_RESULT);
        } catch (JSONException e) {
            // Unreachable: EMPTY_RESULT is a constant, valid document.
            logger.error("Unable to build the empty result", e);
            return new JSONObject();
        }
    }

    /**
     * Update the jsonResult property of the topPages node with the JSONObject returned by getTopPagesForNMonths
     *
     * @param node
     */
    public void updateTopPages(JCRNodeWrapper node) {
        JSONArray errorMessages = new JSONArray();
        try {
            if (!isUpdatable(node)) {
                return;
            }

            String reportName = node.getPropertyAsString(P_JAHIASITE);
            String includeFilter = node.getPropertyAsString(P_INCLUDEFILTER);
            String excludeFilter = node.getPropertyAsString(P_EXCLUDEFILTER);
            String awStatsUrl = node.getPropertyAsString(P_AWSTATSURL);
            boolean overRideConfig = node.getProperty(P_OVERRIDECONFIG).getBoolean();
            boolean titleFromHtml = node.getProperty(P_TITLEFROMHTML).getBoolean();
            String titleSeparator = node.getPropertyAsString(P_TITLESEPARATOR);

            // TopPages is instantiated with new on every path -- the two actions, the Drools
            // service and the scheduled job -- so it is never injected. ConfigurationUtil is an
            // OSGi Declarative Services component and hands out its activated instance; this
            // replaces the SpringContextSingleton.getBean("configurationUtil") lookup, which
            // cannot resolve a bean that no longer exists.
            if (configurationUtil == null) {
                configurationUtil = ConfigurationUtil.getInstance();
            }
            if (configurationUtil == null) {
                // Only reachable while the module's bundle is not started.
                logger.error("Unable to update the top pages for node {}: the configuration service is not available",
                        node.getPath());
                return;
            }

            SiteConfiguration siteConfig = configurationUtil.getSiteConfig(reportName);

            if (!overRideConfig) {
                if (siteConfig == null) {
                    logger.error("Unable to get the site configuration");
                    return;
                }
                includeFilter = siteConfig.getIncludeFilter();
                node.setProperty(P_INCLUDEFILTER, includeFilter);

                excludeFilter = siteConfig.getExcludeFilter();
                node.setProperty(P_EXCLUDEFILTER, excludeFilter);

                awStatsUrl = siteConfig.getReportUrl();
                node.setProperty(P_AWSTATSURL, awStatsUrl);

                titleFromHtml = siteConfig.isTitleFromHTML();
                node.setProperty(P_TITLEFROMHTML, titleFromHtml);

                titleSeparator = siteConfig.getTitleSeparator();
                node.setProperty(P_TITLESEPARATOR, titleSeparator);

            }

            long nMonths = node.getProperty(P_NMONTHS).getLong();
            long numberOfResults = node.getProperty(P_NUMBEROFRESULST).getLong();
            // buildReportUrl returns null for a url the outbound allow-list refuses; the report is
            // then simply not fetched and the reason is recorded on the node for the editor.
            URIBuilder uri = buildReportUrl(awStatsUrl, includeFilter, excludeFilter, errorMessages);
            JSONObject result = uri == null
                    ? null
                    : getTopPagesForNMonths(numberOfResults, uri, nMonths, titleFromHtml, titleSeparator, errorMessages);
            if (result != null) {
                node.setProperty(P_JSONRESULT, result.toString());
                node.setProperty(P_LASTERROR, "");
            } else {
                logger.error("Unable to update the top pages results, null result received, {}", errorMessages);
                node.setProperty(P_LASTERROR, errorMessages.toString());
            }

            node.saveSession();
            logger.info("updated top pages for node {} ", node.getPath());
        } catch (RepositoryException e) {
            logger.error("error updating top pages", e);
        }
    }

    /**
     * Second line of defence behind the scoping of the "update top pages" rule.
     *
     * <p>updateTopPages() is also reachable from the scheduled job and from the action, and a
     * node that does not carry the jtopmix:topPages properties makes the reads below throw a
     * PathNotFoundException. A node this method cannot work on is not an error worth a stack
     * trace: it is simply skipped, on one log line.
     *
     * @return true when the node has everything updateTopPages() reads
     */
    private boolean isUpdatable(JCRNodeWrapper node) throws RepositoryException {
        if (!node.isNodeType(NT_TOPPAGES)) {
            logger.debug("Skipping top pages update for {}: not a {} node", node.getPath(), NT_TOPPAGES);
            return false;
        }
        for (String property : REQUIRED_PROPERTIES) {
            if (!node.hasProperty(property)) {
                logger.warn("Skipping top pages update for {}: the property {} is not set", node.getPath(), property);
                return false;
            }
        }
        return true;
    }

    /**
     * Build a URI with the required parameters, after checking the configured report url against
     * the outbound allow-list. The same check applies whether the url comes from the global
     * configuration or from a node-level {@code overrideConfig} override.
     *
     * @param awStatsUrl
     * @param includeFilter
     * @param excludeFilter
     * @param errorMessages collects the reason when the url is refused
     * @return the builder, or null when the url is unusable
     */
    private URIBuilder buildReportUrl(String awStatsUrl, String includeFilter, String excludeFilter,
                                      JSONArray errorMessages) {
        try {
            URIBuilder builder = new URIBuilder(awStatsUrl);
            Optional<String> rejection = SafeUrls.validate(builder.build());
            if (rejection.isPresent()) {
                logger.error("Refusing the configured AWStats url {}: {}", awStatsUrl, rejection.get());
                errorMessages.put("Unable to connect to: " + rejection.get());
                return null;
            }

            builder.setParameter("urlfilter", includeFilter);
            builder.setParameter("urlfilterex", excludeFilter);
            builder.setParameter("output", "urldetail");
            return builder;

        } catch (URISyntaxException e) {
            logger.error("Unable to create URI Builder", e);
            errorMessages.put("Unable to connect to: the configured AWStats url is not a valid URL");
        }

        return null;

    }


}
