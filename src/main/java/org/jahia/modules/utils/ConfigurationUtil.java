package org.jahia.modules.utils;

import org.jahia.modules.models.SiteConfiguration;
import org.jahia.services.content.JCRCallback;
import org.jahia.services.content.JCRNodeWrapper;
import org.jahia.services.content.JCRSessionWrapper;
import org.jahia.services.content.JCRTemplate;
import org.osgi.service.component.annotations.Activate;
import org.osgi.service.component.annotations.Component;
import org.osgi.service.component.annotations.Deactivate;
import org.osgi.service.component.annotations.Reference;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import javax.jcr.ItemExistsException;
import javax.jcr.NodeIterator;
import javax.jcr.PathNotFoundException;
import javax.jcr.RepositoryException;
import java.util.ArrayList;
import java.util.List;

/**
 * The single owner of the module's global report configuration, the {@code jtopmix:siteConfig}
 * nodes under {@code /settings/top-pages}.
 *
 * <p>The class name is historical: it started out read-only, for the rendering code, while the
 * web flow handler kept its own copy of the same JCR access. Both surfaces - and now the GraphQL
 * API - go through this component, so the repository layout, the property names and the
 * invariants below are written down exactly once.
 *
 * <p>Registered as an OSGi Declarative Services component, replacing the {@code configurationUtil}
 * Spring bean. {@link JCRTemplate} is injected as an OSGi service (Jahia's core Spring bridge
 * publishes it), so the component only activates once the repository is available.
 *
 * <p>The static {@link #getInstance()} accessor exists for the callers that cannot receive an
 * injection: {@code TopPages}, which is instantiated with {@code new} on every code path, the
 * Quartz job, which is instantiated by the scheduler, the web flow handler, which is a flow
 * variable restored from a serialized snapshot, and the GraphQL types, which graphql-java
 * instantiates by reflection. It replaces the previous
 * {@code SpringContextSingleton.getBean("configurationUtil")} lookup, which cannot work once the
 * bean no longer exists. It may legitimately read back null while the bundle is stopped, so every
 * caller has to handle that.
 *
 * <p><strong>Two invariants every write path here has to keep.</strong> First, the name of a
 * configuration becomes a JCR path segment and all of this runs under a system session, which
 * bypasses the access manager: it is checked with {@link SafeNames#isValidConfigName(String)}
 * before it is used, never after. Second, {@link #writeConfig} writes <em>all five</em>
 * properties, because {@link #readConfig} reads three of them with {@code getProperty()} inside a
 * try that swallows {@link PathNotFoundException} - one missing property and the whole
 * configuration silently reads back as null.
 */
@Component(service = ConfigurationUtil.class, immediate = true)
public class ConfigurationUtil {
    static Logger logger = LoggerFactory.getLogger(ConfigurationUtil.class);

    private static final String SETTINGS_NAME = "settings";
    private static final String SETTINGS_PATH = "/" + SETTINGS_NAME;
    private static final String CONFIG_ROOT_NAME = "top-pages";
    private static final String GLOBAL_SETTINGS_TYPE = "jnt:globalSettings";
    private static final String SITE_CONFIG_TYPE = "jtopmix:siteConfig";

    /** Properties of a {@code jtopmix:siteConfig} node. */
    private static final String P_AWSTATS_URL = "awStatsUrl";
    private static final String P_INCLUDE_FILTER = "includeFilter";
    private static final String P_EXCLUDE_FILTER = "excludeFilter";
    private static final String P_TITLE_FROM_HTML = "titleFromHTML";
    private static final String P_TITLE_SEPARATOR = "titleSeparator";

    /**
     * Outcome of a write operation.
     *
     * <p>Deliberately not an exception: both callers - the web flow, which turns it into a
     * localized form message, and the GraphQL API, which turns it into a typed error - need to
     * tell the cases apart, and neither of them is an exceptional condition.
     */
    public enum Result {
        /** The configuration was created, updated or removed. */
        OK,
        /** The name is not a single safe path segment; nothing was touched. */
        INVALID_NAME,
        /** A configuration already exists under that name; the existing one was not overwritten. */
        DUPLICATE,
        /** There is no configuration under that name. */
        NOT_FOUND,
        /** The repository refused the operation; see the log. */
        ERROR
    }

    private static volatile ConfigurationUtil instance;

    private JCRTemplate jcrTemplate;

    @Reference
    public void setJcrTemplate(JCRTemplate jcrTemplate) {
        this.jcrTemplate = jcrTemplate;
    }

    public void unsetJcrTemplate(JCRTemplate jcrTemplate) {
        this.jcrTemplate = null;
    }

    @Activate
    public void activate() {
        instance = this;
    }

    @Deactivate
    public void deactivate() {
        instance = null;
    }

    /**
     * @return the activated component, or null when the module's bundle is not started
     */
    public static ConfigurationUtil getInstance() {
        return instance;
    }

    public List<String> getSitesConfigList() {

        List<String> result = null;
        try {
            result = jcrTemplate.doExecuteWithSystemSession(
                    new JCRCallback<List<String>>() {
                        @Override
                        public List<String> doInJCR(JCRSessionWrapper session) throws RepositoryException {
                            JCRNodeWrapper sitesNode = null;
                            ArrayList<String> configList = new ArrayList<>();
                            //Getting filter Sites nodes
                            try {
                                sitesNode = session.getNode(SafeNames.CONFIG_ROOT_PATH);
                                NodeIterator iterator = sitesNode.getNodes();
                                while (iterator.hasNext()) {
                                    JCRNodeWrapper configNode = (JCRNodeWrapper) iterator.nextNode();

                                    configList.add(configNode.getName());
                                }
                            } catch (PathNotFoundException e) {
                                logger.debug("TopPages: Configuration Node does not exist in JCR", e);
                            }

                            return configList;
                        }
                    }
            );
        } catch (RepositoryException e) {
            logger.error("TopPages: Unable to get Configuration", e);

        }

        return result;
    }


    public SiteConfiguration getSiteConfig(final String siteName) {

        // The name reaches this method from a content property, and the lookup below runs under a
        // system session: it must be proven to be a single safe path segment before it is used.
        if (!SafeNames.isValidConfigName(siteName)) {
            logger.warn("TopPages: refusing an invalid report configuration name");
            return null;
        }

        SiteConfiguration result = null;
        try {
            result = jcrTemplate.doExecuteWithSystemSession(
                    new JCRCallback<SiteConfiguration>() {
                        @Override
                        public SiteConfiguration doInJCR(JCRSessionWrapper session) throws RepositoryException {
                            //Getting filter Sites nodes
                            try {
                                JCRNodeWrapper siteNode = findConfigNode(session, siteName);
                                if (siteNode != null) {
                                    return readConfig(siteNode);
                                }
                            } catch (PathNotFoundException e) {
                                logger.debug("TopPages: Configuration Node does not exist in JCR", e);

                            }
                            return null;
                        }
                    }
            );
        } catch (RepositoryException e) {
            logger.error("TopPages: Unable to get Configuration", e);

        }

        return result;
    }

    /**
     * Every report configuration, in repository order.
     *
     * <p>Read-only: it never creates the configuration root, so a caller that only lists - the
     * GraphQL query, the choice list, the administration screen - cannot write to the repository
     * as a side effect. {@code /settings/top-pages} comes into existence with the first
     * configuration that is saved, and until then this answers an empty list rather than an
     * error, which is exactly the empty state the administration screen renders.
     *
     * <p>A configuration that cannot be read is skipped and logged, not allowed to empty or
     * truncate the answer: a listing exists to show what is configured, and one that hides
     * everything because of a single bad node is worse than useless. The same reasoning as the
     * per-node handling in TopPagesNodeLister.
     *
     * @return the configurations that could be read, in repository order; empty when there are
     *         none or the root does not exist
     */
    public List<SiteConfiguration> getSiteConfigs() {
        try {
            return jcrTemplate.doExecuteWithSystemSession(
                    new JCRCallback<List<SiteConfiguration>>() {
                        @Override
                        public List<SiteConfiguration> doInJCR(JCRSessionWrapper session) throws RepositoryException {
                            List<SiteConfiguration> configs = new ArrayList<>();
                            try {
                                JCRNodeWrapper configRoot = session.getNode(SafeNames.CONFIG_ROOT_PATH);
                                for (JCRNodeWrapper configNode : configRoot.getNodes()) {
                                    try {
                                        configs.add(readConfig(configNode));
                                    } catch (RepositoryException e) {
                                        logger.warn("TopPages: skipping a report configuration that could not be read: {}",
                                                configNode.getPath(), e);
                                    }
                                }
                            } catch (PathNotFoundException e) {
                                logger.debug("TopPages: Configuration Node does not exist in JCR", e);
                            }
                            return configs;
                        }
                    }
            );
        } catch (RepositoryException e) {
            logger.error("TopPages: Unable to list the report configurations", e);
            return new ArrayList<>();
        }
    }

    /**
     * Add a configuration under {@code /settings/top-pages}.
     *
     * @return {@link Result#DUPLICATE} when one already exists under that name - the existing
     *         configuration is never overwritten
     */
    public Result createSiteConfig(final SiteConfiguration config) {
        final String siteName = config.getSiteName();
        if (!SafeNames.isValidConfigName(siteName)) {
            logger.warn("Refused a report configuration name that is not a single safe path segment");
            return Result.INVALID_NAME;
        }

        try {
            return jcrTemplate.doExecuteWithSystemSession(
                    new JCRCallback<Result>() {
                        @Override
                        public Result doInJCR(JCRSessionWrapper session) throws RepositoryException {
                            JCRNodeWrapper configRoot = getOrCreateConfigRoot(session);
                            Result result = Result.OK;
                            try {
                                writeConfig(configRoot.addNode(siteName, SITE_CONFIG_TYPE), config);
                            } catch (ItemExistsException e) {
                                result = Result.DUPLICATE;
                                logger.warn("A site with the same name already exists", e);
                            }
                            session.save();
                            return result;
                        }
                    }
            );
        } catch (RepositoryException e) {
            return reportWriteFailure("create", e);
        }
    }

    /**
     * Overwrite an existing configuration, renaming it when {@code config} carries another name.
     *
     * @param currentName the name the configuration is stored under today
     * @return {@link Result#NOT_FOUND} when nothing is stored under {@code currentName}, and
     *         {@link Result#DUPLICATE} when the rename would collide with another configuration
     */
    public Result updateSiteConfig(final String currentName, final SiteConfiguration config) {
        final String newName = config.getSiteName();
        if (!SafeNames.isValidConfigName(currentName) || !SafeNames.isValidConfigName(newName)) {
            logger.warn("Refused an update for a configuration name that is not a single safe path segment");
            return Result.INVALID_NAME;
        }

        try {
            return jcrTemplate.doExecuteWithSystemSession(
                    new JCRCallback<Result>() {
                        @Override
                        public Result doInJCR(JCRSessionWrapper session) throws RepositoryException {
                            JCRNodeWrapper configNode = findConfigNode(session, currentName);
                            if (configNode == null) {
                                logger.warn("Unable to update the configuration {}, it no longer exists", currentName);
                                return Result.NOT_FOUND;
                            }
                            try {
                                if (!currentName.equals(newName)) {
                                    configNode.rename(newName);
                                }
                                writeConfig(configNode, config);
                                session.save();
                            } catch (ItemExistsException e) {
                                logger.warn("Unable to update site configuration, a site configuration with the same name already exists", e);
                                return Result.DUPLICATE;
                            }
                            return Result.OK;
                        }
                    }
            );
        } catch (RepositoryException e) {
            return reportWriteFailure("update", e);
        }
    }

    /**
     * Remove a configuration.
     *
     * @return {@link Result#NOT_FOUND} when there is nothing to remove
     */
    public Result deleteSiteConfig(final String siteName) {
        if (!SafeNames.isValidConfigName(siteName)) {
            logger.warn("Refused a delete for a configuration name that is not a single safe path segment");
            return Result.INVALID_NAME;
        }

        try {
            return jcrTemplate.doExecuteWithSystemSession(
                    new JCRCallback<Result>() {
                        @Override
                        public Result doInJCR(JCRSessionWrapper session) throws RepositoryException {
                            JCRNodeWrapper configNode = findConfigNode(session, siteName);
                            if (configNode == null) {
                                logger.debug("Error while deleting the site: {}, site not found", siteName);
                                return Result.NOT_FOUND;
                            }
                            configNode.remove();
                            session.save();
                            return Result.OK;
                        }
                    }
            );
        } catch (RepositoryException e) {
            return reportWriteFailure("delete", e);
        }
    }

    /**
     * Classify a repository failure.
     *
     * <p>{@link SafeNames#isValidConfigName(String)} already rules out every name the JCR would
     * reject, so the {@code IllegalNameException} branch should now be unreachable; it is kept
     * because the web flow renders a different message for it and losing that would be a silent
     * behaviour change.
     */
    private static Result reportWriteFailure(String operation, RepositoryException e) {
        if (e.getCause() != null && e.getCause().toString().contains("IllegalNameException")) {
            logger.error("Failed to {} a top pages site configuration node, Illegal Name found", operation, e);
            return Result.INVALID_NAME;
        }
        logger.error("Failed to {} a top pages site configuration node", operation, e);
        return Result.ERROR;
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

    /** Read a {@code jtopmix:siteConfig} node into the model. */
    private static SiteConfiguration readConfig(JCRNodeWrapper node) throws RepositoryException {
        return new SiteConfiguration(node.getName(),
                node.getProperty(P_AWSTATS_URL).getString(),
                node.getProperty(P_INCLUDE_FILTER).getString(),
                node.getPropertyAsString(P_EXCLUDE_FILTER),
                node.getProperty(P_TITLE_FROM_HTML).getBoolean(),
                node.getPropertyAsString(P_TITLE_SEPARATOR));
    }

    /**
     * Write the model onto a {@code jtopmix:siteConfig} node.
     *
     * <p>All five properties, always: {@link #readConfig} reads three of them with
     * {@code getProperty()} and the callers swallow {@link PathNotFoundException}, so a
     * configuration missing one property reads back as null instead of as a partial value.
     * A null string is written as an empty one rather than passed through, because
     * {@code setProperty(name, null)} <em>removes</em> the property - which is precisely the
     * partial write this invariant exists to prevent. The web flow binds empty strings from its
     * form, so only an API caller can reach the null.
     */
    private static void writeConfig(JCRNodeWrapper node, SiteConfiguration site) throws RepositoryException {
        node.setProperty(P_AWSTATS_URL, notNull(site.getReportUrl()));
        node.setProperty(P_INCLUDE_FILTER, notNull(site.getIncludeFilter()));
        node.setProperty(P_EXCLUDE_FILTER, notNull(site.getExcludeFilter()));
        node.setProperty(P_TITLE_FROM_HTML, site.isTitleFromHTML());
        node.setProperty(P_TITLE_SEPARATOR, notNull(site.getTitleSeparator()));
    }

    private static String notNull(String value) {
        return value == null ? "" : value;
    }
}
