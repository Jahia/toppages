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

import javax.jcr.NodeIterator;
import javax.jcr.PathNotFoundException;
import javax.jcr.RepositoryException;
import java.util.ArrayList;
import java.util.List;

/**
 * Reads the module's global report configuration from {@code /settings/top-pages}.
 *
 * <p>Registered as an OSGi Declarative Services component, replacing the {@code configurationUtil}
 * Spring bean. {@link JCRTemplate} is injected as an OSGi service (Jahia's core Spring bridge
 * publishes it), so the component only activates once the repository is available.
 *
 * <p>The static {@link #getInstance()} accessor exists for the two callers that cannot receive an
 * injection: {@code TopPages}, which is instantiated with {@code new} on every code path, and the
 * Quartz job, which is instantiated by the scheduler. It replaces the previous
 * {@code SpringContextSingleton.getBean("configurationUtil")} lookup, which cannot work once the
 * bean no longer exists. It may legitimately read back null while the bundle is stopped, so every
 * caller has to handle that.
 */
@Component(service = ConfigurationUtil.class, immediate = true)
public class ConfigurationUtil {
    static Logger logger = LoggerFactory.getLogger(ConfigurationUtil.class);

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
                                JCRNodeWrapper configRoot = session.getNode(SafeNames.CONFIG_ROOT_PATH);
                                if (configRoot.hasNode(siteName)) {
                                    JCRNodeWrapper siteNode = configRoot.getNode(siteName);
                                    return new SiteConfiguration(siteNode.getName(), siteNode.getProperty("awStatsUrl").getString(), siteNode.getProperty("includeFilter").getString(),
                                            siteNode.getPropertyAsString("excludeFilter"), siteNode.getProperty("titleFromHTML").getBoolean(), siteNode.getPropertyAsString("titleSeparator"));
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


}
