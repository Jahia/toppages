package org.jahia.modules.utils;

import org.jahia.modules.models.SiteConfiguration;
import org.jahia.services.content.JCRCallback;
import org.jahia.services.content.JCRNodeWrapper;
import org.jahia.services.content.JCRSessionWrapper;
import org.jahia.services.content.JCRTemplate;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import javax.jcr.NodeIterator;
import javax.jcr.PathNotFoundException;
import javax.jcr.RepositoryException;
import java.util.ArrayList;
import java.util.List;

public class ConfigurationUtil {
    static Logger logger = LoggerFactory.getLogger(ConfigurationUtil.class);
    private String key;

    public void setKey(String key) {
        this.key = key;
    }

    public String getKey() {
        return key;
    }


    private JCRTemplate jcrTemplate;

    public void setJcrTemplate(JCRTemplate jcrTemplate) {
        this.jcrTemplate = jcrTemplate;
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
