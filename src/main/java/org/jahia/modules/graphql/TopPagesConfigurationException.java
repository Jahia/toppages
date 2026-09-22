package org.jahia.modules.graphql;

import org.jahia.modules.graphql.provider.dxm.BaseGqlClientException;

/**
 * A report-configuration write the caller asked for and the module refused.
 *
 * <p>Extending {@link BaseGqlClientException} is what makes the platform report this as a proper
 * GraphQL error instead of an anonymous "Internal Server Error". It matters that a caller can
 * tell "the name you sent is not a legal one" and "that name is taken" apart from "you are not
 * allowed to do this at all", which arrives as {@code GqlAccessDeniedException}.
 */
public class TopPagesConfigurationException extends BaseGqlClientException {

    private static final long serialVersionUID = 1L;

    /**
     * @param message what was refused and why, in terms of the caller's own input
     */
    public TopPagesConfigurationException(String message) {
        // No graphql ErrorType on purpose: DXGraphQLError falls back to this class's simple name,
        // so the error carries classification "TopPagesConfigurationException". The alternatives
        // all lie - ValidationError means the *query* failed to validate, and DataFetchingException
        // means something went wrong rather than "you asked for something that is not allowed".
        super(message, null);
    }
}
