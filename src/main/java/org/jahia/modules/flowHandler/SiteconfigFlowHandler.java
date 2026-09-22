package org.jahia.modules.flowHandler;

import org.apache.commons.lang.StringUtils;
import org.jahia.modules.models.SiteConfiguration;
import org.jahia.modules.models.TopPagesConfigModel;
import org.jahia.modules.models.TopPagesNode;
import org.jahia.modules.utils.ConfigurationUtil;
import org.jahia.services.content.*;
import org.slf4j.Logger;
import org.springframework.binding.message.MessageContext;
import org.springframework.webflow.execution.RequestContext;

import javax.jcr.NodeIterator;
import javax.jcr.RepositoryException;
import javax.jcr.query.Query;
import java.io.Serializable;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;

import static org.slf4j.LoggerFactory.getLogger;

/**
 * Backs the server-settings web flow at
 * <em>Administration &gt; Server &gt; Configuration &gt; Top Pages</em>.
 *
 * <p>It owns no repository access of its own any more: every read and write of
 * {@code /settings/top-pages} goes through {@link ConfigurationUtil}, which the GraphQL API uses
 * as well, so the name validation, the "write all five properties" rule and the duplicate
 * handling exist once instead of once per surface. What is left here is web flow glue: turning a
 * {@link ConfigurationUtil.Result} into a localized form message, and the diagnostic listing of
 * the {@code jtopmix:topPages} nodes, which is rendered by this page only.
 */
public class SiteconfigFlowHandler implements Serializable {

    private static final Logger logger = getLogger(SiteconfigFlowHandler.class);

    /** Node types the upward walk for an enclosing page recognises, and the one it stops at. */
    private static final String PAGE_TYPE = "jnt:page";
    private static final String SITE_TYPE = "jnt:virtualsite";

    /** Web flow message sources; the JSPs render the errors bound to these. */
    private static final String SRC_SAVE_ERROR = "saveError";
    private static final String SRC_CONFIG_UPDATE = "configUpdate";

    /** Resource bundle keys. */
    private static final String ILLEGAL_NAME_KEY = "toppages.form.error.IllegaleName";
    private static final String SAVE_ERROR_KEY = "toppages.form.error.saveError";
    private static final String ALREADY_EXISTS_KEY = "toppages.form.error.alreadyExist";

    TopPagesConfigModel model;

    /**
     * The handler is a web flow variable, not a Spring bean: it is instantiated per flow execution
     * and its state is serialized into the flow snapshot, which leaves an injected field null on
     * every restore. The service is therefore resolved on demand rather than injected once, and
     * may legitimately be absent while the module's bundle is stopped.
     */
    private static ConfigurationUtil getConfigurationService() {
        return ConfigurationUtil.getInstance();
    }

    public TopPagesConfigModel init() {
        if (logger.isDebugEnabled()) {
            logger.debug("Getting the configurations list");
        }

        TopPagesConfigModel sitesModel = new TopPagesConfigModel();
        sitesModel.setSelectedSiteName("");

        ConfigurationUtil service = getConfigurationService();
        if (service == null) {
            logger.error("Top pages: the configuration service is not available");
            this.model = sitesModel;
            return this.model;
        }

        // Opening the settings page is what brings /settings/top-pages into existence on a
        // repository that has never been configured; the listing itself never writes.
        service.ensureConfigRoot();
        for (SiteConfiguration config : service.getSiteConfigs()) {
            sitesModel.addSiteConfig(config);
        }

        this.model = sitesModel;
        return this.model;
    }


    public boolean saveSiteConfiguration(final SiteConfiguration site, MessageContext messageContext) {
        if (logger.isDebugEnabled()) {
            logger.debug("Saving new Site configuration: {}", site);
        }

        ConfigurationUtil service = getConfigurationService();
        if (service == null) {
            messageContext.addMessage(site.getMessage(SRC_SAVE_ERROR, SAVE_ERROR_KEY));
            logger.error("Top pages: the configuration service is not available");
            return false;
        }

        return reportResult(service.createSiteConfig(site), site, messageContext, SRC_SAVE_ERROR);
    }

    public SiteConfiguration setSelectedConfiguration(TopPagesConfigModel model) {
        if (logger.isDebugEnabled()) {
            logger.debug(" Setting the selected site: {}", model.getSelectedSiteName());
        }

        ConfigurationUtil service = getConfigurationService();
        if (service == null) {
            logger.error("Top pages: the configuration service is not available");
            return null;
        }

        SiteConfiguration config = service.getSiteConfig(model.getSelectedSiteName());
        if (config == null) {
            logger.debug("Unable to get the selected configuration: {}", model.getSelectedSiteName());
            return null;
        }
        config.setToBeUpdated(true);
        return config;
    }

    public boolean deleteSiteConfiguration() {
        if (!model.getConfirmDelete().equals("delete") || StringUtils.isEmpty(model.getSelectedSiteName())) {
            return false;
        }

        ConfigurationUtil service = getConfigurationService();
        if (service == null) {
            logger.error("Top pages: the configuration service is not available");
            return false;
        }

        // A configuration that is already gone still counts as deleted for the page: the listing
        // is rebuilt from the repository on the way back, so it shows the truth either way.
        return service.deleteSiteConfig(model.getSelectedSiteName()) != ConfigurationUtil.Result.INVALID_NAME;
    }


    public boolean updateSiteConfiguration(final SiteConfiguration siteConfig, MessageContext messageContext) {
        if (logger.isDebugEnabled()) {
            logger.debug("Saving new Site configuration: {}", siteConfig);
        }

        ConfigurationUtil service = getConfigurationService();
        if (service == null) {
            messageContext.addMessage(siteConfig.getMessage(SRC_CONFIG_UPDATE, SAVE_ERROR_KEY));
            logger.error("Top pages: the configuration service is not available");
            return false;
        }

        ConfigurationUtil.Result result = service.updateSiteConfig(this.model.getSelectedSiteName(), siteConfig);
        return reportResult(result, siteConfig, messageContext, SRC_CONFIG_UPDATE);
    }

    /**
     * Bind the error message the JSP renders for a failed write.
     *
     * @return true when the write succeeded and the flow may move on
     */
    private static boolean reportResult(ConfigurationUtil.Result result, SiteConfiguration site,
                                        MessageContext messageContext, String source) {
        switch (result) {
            case OK:
                return true;
            case INVALID_NAME:
                messageContext.addMessage(site.getMessage(source, ILLEGAL_NAME_KEY));
                return false;
            case DUPLICATE:
                messageContext.addMessage(site.getMessage(source, ALREADY_EXISTS_KEY));
                return false;
            default:
                messageContext.addMessage(site.getMessage(source, SAVE_ERROR_KEY));
                return false;
        }
    }

    public SiteConfiguration newSiteConfiguration() {
        return new SiteConfiguration();
    }

    public void getAllNodes(RequestContext context) {

        JCRSessionWrapper jcrSessionWrapper = null;
        final String query = "select * from [jtopmix:topPages]";
        List<TopPagesNode> allNodes = new ArrayList<>();
        try {
            //Get live
            jcrSessionWrapper = JCRSessionFactory.getInstance().getCurrentUserSession("default");
            NodeIterator iterator = jcrSessionWrapper.getWorkspace().getQueryManager().createQuery(query, Query.JCR_SQL2).execute().getNodes();
            if (!iterator.hasNext()) {
                logger.info("No top pages nodes available to list");
            }
            while (iterator.hasNext()) {
                JCRNodeWrapper node = (JCRNodeWrapper) iterator.nextNode();
                // Per node, so that one unreadable row is skipped and logged instead of
                // emptying the whole table: the listing is a diagnostic screen, and a
                // diagnostic screen that hides everything because of a single bad node is
                // worse than useless.
                try {
                    allNodes.add(readNode(node));
                } catch (RepositoryException e) {
                    logger.warn("Skipping a top pages node that could not be read: {}", node.getPath(), e);
                }
            }
            //Sort by siteName, tolerating a node whose jahiaSite property was never set.
            Comparator<TopPagesNode> compareBySite =
                    Comparator.comparing(TopPagesNode::getJahiaSite, Comparator.nullsLast(Comparator.naturalOrder()));
            Collections.sort(allNodes, compareBySite);

        } catch (RepositoryException e) {
            logger.error("An exception occurred while listing the top pages nodes", e);
        }

        // Always published, even empty or partial: an absent flow-scope variable is what
        // made a single failure erase the entire table.
        context.getFlowScope().put("allNodes", allNodes);

    }

    /** Read one {@code jtopmix:topPages} node into the row the listing renders. */
    private static TopPagesNode readNode(JCRNodeWrapper node) throws RepositoryException {
        return new TopPagesNode(node.getName(),
                node.getPropertyAsString("jahiaSite"),
                node.getPath(),
                node.getLastPublishedAsDate(),
                node.getResolveSite().getDefaultLanguage(),
                getParentPage(node));
    }

    /**
     * Path of the {@code jnt:page} the node is rendered in, or {@code null} when it has none.
     *
     * The walk is iterative and bounded twice over: it stops at the site node, and in any
     * case at the repository root. Content that lives outside any page - under
     * {@code /sites/<site>/contents}, for instance - therefore simply has no parent page.
     * The previous recursive version relied on {@code getParent()} throwing once it walked
     * past the root, which turned one such node into a {@code RepositoryException} that
     * emptied the whole administration listing.
     */
    private static String getParentPage(JCRNodeWrapper node) throws RepositoryException {
        JCRNodeWrapper current = node;
        while (current.getDepth() > 0) {
            JCRNodeWrapper parent = current.getParent();
            if (parent.isNodeType(PAGE_TYPE)) {
                return parent.getPath();
            }
            if (parent.isNodeType(SITE_TYPE)) {
                return null;
            }
            current = parent;
        }
        return null;
    }
}
