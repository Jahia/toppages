package org.jahia.modules.utils;

import java.util.regex.Pattern;

/**
 * Validation of the report-configuration names that end up in a JCR path.
 *
 * <p>Every configuration is a child of {@link #CONFIG_ROOT_PATH}, and the flow handler and
 * {@link ConfigurationUtil} both reach it under a system session, which bypasses the access
 * manager. The name arrives from a client-controlled form field, so it must be proven to be a
 * single, harmless path segment before it is used — otherwise {@code ../../sites/mysite} reads or
 * deletes content it was never meant to reach.
 */
public final class SafeNames {

    /** Where the module keeps its global configuration, one child per AWStats report. */
    public static final String CONFIG_ROOT_PATH = "/settings/top-pages";

    /**
     * The rule a configuration name has to satisfy, as text.
     *
     * <p>Public because the GraphQL API quotes it back to a caller whose name was refused: the
     * rule is not a secret, and an error that does not say what was expected only produces
     * another wrong request.
     */
    public static final String SAFE_NAME_PATTERN = "[A-Za-z0-9._-]{1,100}";

    private static final Pattern SAFE_NODE_NAME = Pattern.compile(SAFE_NAME_PATTERN);

    private SafeNames() {
        // utility class
    }

    /**
     * @param name a candidate configuration node name
     * @return true when the name is a single safe path segment
     */
    public static boolean isValidConfigName(String name) {
        if (name == null || ".".equals(name) || "..".equals(name)) {
            return false;
        }
        return SAFE_NODE_NAME.matcher(name).matches();
    }
}
