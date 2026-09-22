package org.jahia.modules.flowHandler;

import org.apache.commons.lang.StringUtils;
import org.jahia.modules.models.SiteConfiguration;
import org.jahia.modules.models.TopPagesConfigModel;
import org.jahia.modules.models.TopPagesNode;
import org.jahia.modules.utils.SafeNames;
import org.jahia.services.content.*;
import org.slf4j.Logger;
import org.springframework.binding.message.MessageContext;
import org.springframework.binding.message.MessageResolver;
import org.springframework.webflow.execution.RequestContext;

import javax.jcr.ItemExistsException;
import javax.jcr.NodeIterator;
import javax.jcr.PathNotFoundException;
import javax.jcr.RepositoryException;
import javax.jcr.query.Query;
import java.io.Serializable;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;

import static org.slf4j.LoggerFactory.getLogger;

public class SiteconfigFlowHandler implements Serializable {

    private static final Logger logger = getLogger(SiteconfigFlowHandler.class);

    private static final String SETTINGS_NAME = "settings";
    private static final String SETTINGS_PATH = "/" + SETTINGS_NAME;
    private static final String CONFIG_ROOT_NAME = "top-pages";
    private static final String GLOBAL_SETTINGS_TYPE = "jnt:globalSettings";
    private static final String SITE_CONFIG_TYPE = "jtopmix:siteConfig";

    /** Node types the upward walk for an enclosing page recognises, and the one it stops at. */
    private static final String PAGE_TYPE = "jnt:page";
    private static final String SITE_TYPE = "jnt:virtualsite";

    /** Properties of a {@code jtopmix:siteConfig} node. */
    private static final String P_AWSTATS_URL = "awStatsUrl";
    private static final String P_INCLUDE_FILTER = "includeFilter";
    private static final String P_EXCLUDE_FILTER = "excludeFilter";
    private static final String P_TITLE_FROM_HTML = "titleFromHTML";
    private static final String P_TITLE_SEPARATOR = "titleSeparator";

    /** Web flow message sources; the JSPs render the errors bound to these. */
    private static final String SRC_SAVE_ERROR = "saveError";
    private static final String SRC_CONFIG_UPDATE = "configUpdate";

    /** Resource bundle keys. */
    private static final String ILLEGAL_NAME_KEY = "toppages.form.error.IllegaleName";
    private static final String SAVE_ERROR_KEY = "toppages.form.error.saveError";
    private static final String ALREADY_EXISTS_KEY = "toppages.form.error.alreadyExist";

    private transient JCRTemplate jcrTemplate;

    TopPagesConfigModel model;

    public void setJcrTemplate(JCRTemplate jcrTemplate) {
        this.jcrTemplate = jcrTemplate;
    }

    /**
     * The handler is a web flow variable, not a Spring bean: it is instantiated per flow execution
     * and its state is serialized into the flow snapshot, which leaves an injected field null on
     * every restore. The template is therefore resolved on demand rather than injected once.
     */
    private JCRTemplate getJcrTemplate() {
        if (jcrTemplate == null) {
            jcrTemplate = JCRTemplate.getInstance();
        }
        return jcrTemplate;
    }

    public TopPagesConfigModel init() {
        if (logger.isDebugEnabled()) {
            logger.debug("Getting the configurations list");
        }

        try {
            this.model = getJcrTemplate().doExecuteWithSystemSession(
                    new JCRCallback<TopPagesConfigModel>() {
                        @Override
                        public TopPagesConfigModel doInJCR(JCRSessionWrapper session) throws RepositoryException {
                            TopPagesConfigModel sitesModel = new TopPagesConfigModel();
                            sitesModel.setSelectedSiteName("");
                            //Getting filter Sites nodes
                            JCRNodeWrapper sitesNode = getOrCreateConfigRoot(session);

                            for (JCRNodeWrapper site : sitesNode.getNodes()) {
                                sitesModel.addSiteConfig(readConfig(site));
                            }
                            session.save();

                            if (logger.isDebugEnabled()) {
                                logger.debug("End of Retreiving top pages sites configuratoins");
                            }

                            return sitesModel;
                        }
                    }
            );

        } catch (RepositoryException e) {
            logger.error("Top pages: Unable to find an existing sites configuration", e);
            return new TopPagesConfigModel();
        }
        return this.model;
    }


    public boolean saveSiteConfiguration(final SiteConfiguration site, MessageContext messageContext) {
        if (logger.isDebugEnabled()) {
            logger.debug("Saving new Site configuration: {}", site);
        }

        final String siteName = site.getSiteName();
        if (!SafeNames.isValidConfigName(siteName)) {
            messageContext.addMessage(site.getMessage(SRC_SAVE_ERROR, ILLEGAL_NAME_KEY));
            logger.warn("Refused a report configuration name that is not a single safe path segment");
            return false;
        }

        boolean created = true;
        final MessageResolver itemAlreadyExistsMessage = site.getMessage(SRC_SAVE_ERROR, ALREADY_EXISTS_KEY);
        try {

            MessageResolver creationResult = getJcrTemplate().doExecuteWithSystemSession(
                    new JCRCallback<MessageResolver>() {
                        @Override
                        public MessageResolver doInJCR(JCRSessionWrapper session) throws RepositoryException {
                            return createConfigNode(session, siteName, site) ? null : itemAlreadyExistsMessage;
                        }
                    }
            );

            if (creationResult != null) {//Name already exists
                messageContext.addMessage(creationResult);
                created = false;
            }

        } catch (RepositoryException e) {//Any other node creation Issue
            if (isIllegalName(e)) {
                messageContext.addMessage(this.model.getMessage(SRC_SAVE_ERROR, ILLEGAL_NAME_KEY));
                logger.error("Failed to create top Pages site configuration node, Illegal Name found", e);

            } else {
                messageContext.addMessage(this.model.getMessage(SRC_SAVE_ERROR, SAVE_ERROR_KEY));
                logger.error("Failed to create top Pages site configuration node", e);

            }
        }

        return created;

    }

    /**
     * Add a configuration node under the configuration root and write its properties.
     *
     * @param siteName a name already checked with {@link SafeNames#isValidConfigName(String)}
     * @return false when a configuration already exists under that name, true otherwise
     */
    private static boolean createConfigNode(JCRSessionWrapper session, String siteName, SiteConfiguration site)
            throws RepositoryException {
        JCRNodeWrapper configRoot = getOrCreateConfigRoot(session);
        boolean jcrOk = true;
        try {
            writeConfig(configRoot.addNode(siteName, SITE_CONFIG_TYPE), site);
        } catch (ItemExistsException e) {
            jcrOk = false;
            logger.warn("A site with the same name already exists", e);
        }
        session.save();
        return jcrOk;
    }

    public SiteConfiguration setSelectedConfiguration(TopPagesConfigModel model) {
        if (logger.isDebugEnabled()) {
            logger.debug(" Setting the selected site: {}", model.getSelectedSiteName());
        }
        final String selectedSiteName = model.getSelectedSiteName();
        if (!SafeNames.isValidConfigName(selectedSiteName)) {
            logger.warn("Refused a selected configuration name that is not a single safe path segment");
            return null;
        }
        try {
            return getJcrTemplate().doExecuteWithSystemSession(
                    new JCRCallback<SiteConfiguration>() {
                        @Override
                        public SiteConfiguration doInJCR(JCRSessionWrapper session) throws RepositoryException {
                            JCRNodeWrapper siteNode = findConfigNode(session, selectedSiteName);
                            if (siteNode == null) {
                                logger.debug("Unable to get the selected configuration: {}", selectedSiteName);
                                return null;
                            }
                            SiteConfiguration config = readConfig(siteNode);
                            config.setToBeUpdated(true);

                            if (logger.isDebugEnabled()) {
                                logger.debug("End of Retreiving top pages sites configurations");
                            }
                            return config;
                        }
                    }
            );
        } catch (RepositoryException e) {
            logger.error("Failed to set the selected site", e);

        }
        return null;

    }

    public boolean deleteSiteConfiguration() {
        if (!model.getConfirmDelete().equals("delete") || StringUtils.isEmpty(model.getSelectedSiteName())) {
            return false;
        }

        final String selectedSiteName = model.getSelectedSiteName();
        if (!SafeNames.isValidConfigName(selectedSiteName)) {
            logger.warn("Refused a delete for a configuration name that is not a single safe path segment");
            return false;
        }

        try {
            getJcrTemplate().doExecuteWithSystemSession(
                    new JCRCallback<Boolean>() {
                        @Override
                        public Boolean doInJCR(JCRSessionWrapper session) throws RepositoryException {
                            JCRNodeWrapper siteNode = findConfigNode(session, selectedSiteName);
                            if (siteNode == null) {
                                logger.debug("Error while deleting the site: {}, site not found", selectedSiteName);
                                return false;
                            }
                            siteNode.remove();
                            session.save();
                            return true;
                        }
                    }
            );
        } catch (RepositoryException e) {
            logger.error("Top-pages - Failed to delete site configuration", e);

        }

        return true;
    }


    public boolean updateSiteConfiguration(final SiteConfiguration siteConfig, MessageContext messageContext) {
        if (logger.isDebugEnabled()) {
            logger.debug("Saving new Site configuration: {}", siteConfig);
        }

        final String siteToUpdate = this.model.getSelectedSiteName();
        final String siteName = siteConfig.getSiteName();
        if (!SafeNames.isValidConfigName(siteToUpdate) || !SafeNames.isValidConfigName(siteName)) {
            messageContext.addMessage(siteConfig.getMessage(SRC_CONFIG_UPDATE, ILLEGAL_NAME_KEY));
            logger.warn("Refused an update for a configuration name that is not a single safe path segment");
            return false;
        }

        boolean updated = true;

        try {

            MessageResolver updateResult = getJcrTemplate().doExecuteWithSystemSession(
                    new JCRCallback<MessageResolver>() {
                        @Override
                        public MessageResolver doInJCR(JCRSessionWrapper session) throws RepositoryException {
                            JCRNodeWrapper topPagesSite = findConfigNode(session, siteToUpdate);
                            if (topPagesSite == null) {
                                logger.warn("Unable to update the configuration {}, it no longer exists", siteToUpdate);
                                return siteConfig.getMessage(SRC_CONFIG_UPDATE, SAVE_ERROR_KEY);
                            }
                            try {
                                if (!siteToUpdate.equals(siteName)) { // Updated Name
                                    topPagesSite.rename(siteName);
                                }
                                writeConfig(topPagesSite, siteConfig);

                                session.save();
                            } catch (ItemExistsException e) {
                                logger.warn("Unable to update site configuration, a site configuration with the same name already exists", e);
                                return siteConfig.getMessage(SRC_CONFIG_UPDATE, ALREADY_EXISTS_KEY);
                            }
                            return null;
                        }
                    }

            );

            if (updateResult != null) {
                updated = false;
                messageContext.addMessage(updateResult);
            }

        } catch (RepositoryException e) {//Any other node creation Issue
            if (isIllegalName(e)) {
                messageContext.addMessage(siteConfig.getMessage(SRC_CONFIG_UPDATE, ILLEGAL_NAME_KEY));
                logger.error("Failed to update top Pages site configuration node", e);

            } else {
                messageContext.addMessage(siteConfig.getMessage(SRC_CONFIG_UPDATE, SAVE_ERROR_KEY));
                logger.error("Failed to updated top Pages site configuration node", e);

            }
        }

        return updated;

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

    /**
     * Return the configuration root, creating it - and the {@code /settings} node it hangs from -
     * when it is not there yet.
     */
    private static JCRNodeWrapper getOrCreateConfigRoot(JCRSessionWrapper session) throws RepositoryException {
        try {
            return session.getNode(SafeNames.CONFIG_ROOT_PATH);
        } catch (PathNotFoundException e) {//Folders has to be created
            logger.debug("The top pages configuration root does not exist yet, creating it", e);
            if (session.nodeExists(SETTINGS_PATH)) {
                return session.getNode(SETTINGS_PATH).addNode(CONFIG_ROOT_NAME, GLOBAL_SETTINGS_TYPE);
            }
            return session.getNode("/").addNode(SETTINGS_NAME, GLOBAL_SETTINGS_TYPE)
                    .addNode(CONFIG_ROOT_NAME, GLOBAL_SETTINGS_TYPE);
        }
    }

    /**
     * Resolve a configuration node by name, without ever concatenating the name into a path.
     *
     * @param name a name already checked with {@link SafeNames#isValidConfigName(String)}
     * @return the node, or null when there is no configuration under that name
     */
    private static JCRNodeWrapper findConfigNode(JCRSessionWrapper session, String name) throws RepositoryException {
        try {
            JCRNodeWrapper configRoot = session.getNode(SafeNames.CONFIG_ROOT_PATH);
            return configRoot.hasNode(name) ? configRoot.getNode(name) : null;
        } catch (PathNotFoundException e) {
            logger.debug("The top pages configuration root does not exist yet", e);
            return null;
        }
    }

    /** Read a {@code jtopmix:siteConfig} node into the form model. */
    private static SiteConfiguration readConfig(JCRNodeWrapper node) throws RepositoryException {
        return new SiteConfiguration(node.getName(),
                node.getProperty(P_AWSTATS_URL).getString(),
                node.getProperty(P_INCLUDE_FILTER).getString(),
                node.getPropertyAsString(P_EXCLUDE_FILTER),
                node.getProperty(P_TITLE_FROM_HTML).getBoolean(),
                node.getPropertyAsString(P_TITLE_SEPARATOR));
    }

    /** Write the form model onto a {@code jtopmix:siteConfig} node. */
    private static void writeConfig(JCRNodeWrapper node, SiteConfiguration site) throws RepositoryException {
        node.setProperty(P_AWSTATS_URL, site.getReportUrl());
        node.setProperty(P_INCLUDE_FILTER, site.getIncludeFilter());
        node.setProperty(P_EXCLUDE_FILTER, site.getExcludeFilter());
        node.setProperty(P_TITLE_FROM_HTML, site.isTitleFromHTML());
        node.setProperty(P_TITLE_SEPARATOR, site.getTitleSeparator());
    }

    private static boolean isIllegalName(RepositoryException e) {
        return e.getCause() != null && e.getCause().toString().contains("IllegalNameException");
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
