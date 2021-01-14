package org.jahia.modules;


import org.apache.commons.lang.StringUtils;
import org.apache.http.client.utils.URIBuilder;
import org.jahia.modules.models.SiteConfiguration;
import org.jahia.modules.models.AWStatsPage;
import org.jahia.modules.utils.ConfigurationUtil;
import org.jahia.modules.utils.HttpClientUtil;
import org.jahia.services.SpringContextSingleton;
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
import org.springframework.beans.factory.annotation.Autowired;

import javax.jcr.RepositoryException;
import java.net.URISyntaxException;
import java.util.*;

public class TopPages {

    Logger logger = LoggerFactory.getLogger(TopPages.class);

    @Autowired
    private ConfigurationUtil configurationUtil;

    public void setConfigurationUtil(ConfigurationUtil configurationUtil) {
        this.configurationUtil = configurationUtil;
    }

    private String key;

    public void setKey(String key) {
        this.key = key;
    }

    private JSONArray errorMessages = new JSONArray();
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


    /**
     * Get pages stats from awstats and update the statsPages map, if a page exists, the view count will be aggregated
     * Awstats by default sorts the result by view count.
     *
     * @param numberOfResults number of items(pages) to get from the awstats report
     * @param uriBuilder      type of report from the jahiaSites map (academy, store, documentation)
     * @return a Map that contains the number of requeired resullts,
     */
    public void getPages(long numberOfResults, HttpClientUtil httpclient, URIBuilder uriBuilder, Map<String, AWStatsPage> statsPagesMap, boolean titleFromHTML, String titleSeparator) {

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
                String linkHref = link.attr("href");

                Element viewCountsCol = row.select("td:nth-child(2)").first();
                String viewCountHtml = viewCountsCol.html().replace(",", ""); //remove comma
                int viewCounts = Integer.parseInt(viewCountHtml);
                String title = "";
                if (titleFromHTML) {
                    //Get page title tag from the page source
                    URIBuilder uri = new URIBuilder(linkHref);
                    String pageHtml = httpclient.getHtmlPage(uri);
                    title = Jsoup.parse(pageHtml).title().trim();
                    if (!StringUtils.isEmpty(title)) {
                        if (!StringUtils.isEmpty(titleSeparator)) {
                            int separatorIdx = title.indexOf(titleSeparator);
                            if (separatorIdx > 0) {
                                title = title.substring(0, title.indexOf(titleSeparator)).trim();
                            }
                        }
                    }
                } else {
                    title = getTitleFromLink(linkHref);
                }

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
            this.errorMessages.put("Error while processing the html source of the report page");
            logger.error("Error while retrieving json from html", e);
        }


    }

    /**
     * This method retrieves the top N results (specified in the numberOfResults parameter) of the last N months from awstats report
     * The returns a JSONObject for the list of N sorted by view Count
     *
     * @param numberOfResults: number of results to retrieve
     * @param uri:             uri of the awstats to get the pages for
     * @param nMonths:         the number of past months
     */
    private JSONObject getTopPagesForNMonths(long numberOfResults, URIBuilder uri, long nMonths,
                                             boolean titleFromHTML, String titleSepartor) {

        HttpClientUtil httpClientUtil = new HttpClientUtil();

        if (!httpClientUtil.testConnection(uri)) {
            this.errorMessages.put(httpClientUtil.getErrorMessage());

            return null;
        }
        // Start from current year and month
        int year = Calendar.getInstance().get(Calendar.YEAR);
        int month = Calendar.getInstance().get(Calendar.MONTH);

        Map<String, AWStatsPage> resultMap = new HashMap<>();
        while (nMonths-- > 0) {
            uri.setParameter("year", String.valueOf(year));
            uri.setParameter("month", String.valueOf(month + 1)); //months starts at 0 in java Calendar

            getPages(numberOfResults, httpClientUtil, uri, resultMap, titleFromHTML, titleSepartor);

            //previous month
            Calendar calNow = Calendar.getInstance();
            calNow.add(Calendar.MONTH, -1);
            year = calNow.get(calNow.YEAR);
            month = calNow.get(calNow.MONTH);

        }
        // Sort the result
        List<AWStatsPage> pagesList = new ArrayList<>(resultMap.values());
        Collections.sort(pagesList, Collections.<AWStatsPage>reverseOrder());

        //build JSONObject from the list with size of numberOfResults
        JSONObject jsonResult = new JSONObject();
        try {
            JSONArray pagesjsonArray = new JSONArray();
            for (AWStatsPage sPage : pagesList) {
                JSONObject page = new JSONObject();
                page.put("title", sPage.getTitle());
                page.put("href", sPage.getUrl());
                page.put("count", sPage.getViewCount());

                pagesjsonArray.put(page);
                if (--numberOfResults < 1)
                    break;
            }
            jsonResult.put("topPages", pagesjsonArray);
        } catch (JSONException e) {
            logger.error("error while parsing the JSON Result", e);
            this.errorMessages.put("error while parsing JSON result");
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
        String title = lastPart.substring(0, 1).toUpperCase() + lastPart.substring(1).toLowerCase();

        return StringUtils.capitalize(title);
    }

    /**
     * Get top pages from JCR, the top pages is saved in JCR as a JSON String in the jsonResult property.
     * The result is returned from JCR to avoid multiple calls to the awstats script
     *
     * @param node
     * @return
     */
    public JSONObject getTopPages(JCRNodeWrapper node) {
        JSONObject result = null;
        logger.info("Getting top Pages for node: {}", node.getPath());

        try {
            //if jsonResult is already available in JCR, return the result
            if (node.hasProperty(P_JSONRESULT)) {
                String jsonResult = node.getPropertyAsString(P_JSONRESULT);
                result = new JSONObject(jsonResult);
                if (this.errorMessages.length() > 0) {
                    result.put("errorMessages", this.errorMessages);
                }
                return result;
            }
            //if not, populate the property and save the node
            updateTopPages(node);

        } catch (RepositoryException | JSONException e) {
            logger.error("error while getting top pages node from JCR: ", e);
        }


        return result;

    }

    /**
     * Update the jsonResult property of the topPages node with the JSONObject returned by getTopPagesForNMonths
     *
     * @param node
     */
    public void updateTopPages(JCRNodeWrapper node) {
        try {

            String reportName = node.getPropertyAsString(P_JAHIASITE);
            String includeFilter = node.getPropertyAsString(P_INCLUDEFILTER);
            String excludeFilter = node.getPropertyAsString(P_EXCLUDEFILTER);
            String awStatsUrl = node.getPropertyAsString(P_AWSTATSURL);
            boolean overRideConfig = node.getProperty(P_OVERRIDECONFIG).getBoolean();
            boolean titleFromHtml = node.getProperty(P_TITLEFROMHTML).getBoolean();
            String titleSeparator = node.getPropertyAsString(P_TITLESEPARATOR);

            if (configurationUtil == null) {
                configurationUtil = (ConfigurationUtil) SpringContextSingleton.getBean("configurationUtil");
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
            URIBuilder uri = buildReportUrl(awStatsUrl, includeFilter, excludeFilter);
            JSONObject result = this.getTopPagesForNMonths(numberOfResults, uri, nMonths, titleFromHtml, titleSeparator);
            if (result != null) {
                node.setProperty(P_JSONRESULT, result.toString());
                node.setProperty(P_LASTERROR, "");
            } else {
                logger.error("Unable to update the top pages results, null result received, {}", this.errorMessages);
                node.setProperty(P_LASTERROR, this.errorMessages.toString());
            }

            node.saveSession();
            logger.info("updated top pages for node {} ", node.getPath());
        } catch (RepositoryException e) {
            logger.error("error updating top pages", e);
        }
    }

    /**
     * Build a URI with the required parameters
     *
     * @param awStatsUrl
     * @param includeFilter
     * @param excludeFilter
     * @return
     */
    private URIBuilder buildReportUrl(String awStatsUrl, String includeFilter, String excludeFilter) {
        try {
            URIBuilder builder = new URIBuilder(awStatsUrl);
            builder.setParameter("urlfilter", includeFilter);
            builder.setParameter("urlfilterex", excludeFilter);
            builder.setParameter("output", "urldetail");
            return builder;

        } catch (URISyntaxException e) {
            logger.error("Unable to create URI Builder", e);
        }

        return null;

    }


}
