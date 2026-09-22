package org.jahia.modules.graphql;

import org.jahia.modules.utils.ConfigurationUtil;

/**
 * Bridge between the GraphQL types and the module's OSGi services.
 *
 * <p>graphql-java instantiates the type classes by reflection, so they cannot be Declarative
 * Services components and cannot have anything injected. They reach {@link ConfigurationUtil}
 * through its static accessor instead, which reads back null while the module's bundle is
 * stopped - a state that is reachable in practice, since the GraphQL servlet lives in another
 * bundle and keeps answering.
 */
final class TopPagesGraphQL {

    private TopPagesGraphQL() {
        // utility class
    }

    /**
     * @return the activated configuration service
     * @throws TopPagesConfigurationException when the module's bundle is not started, rather than
     *         letting a null reference surface as a bare "Internal Server Error"
     */
    static ConfigurationUtil configurationService() {
        ConfigurationUtil service = ConfigurationUtil.getInstance();
        if (service == null) {
            throw new TopPagesConfigurationException(
                    "The Top Pages configuration service is not available; the module is not started");
        }
        return service;
    }
}
