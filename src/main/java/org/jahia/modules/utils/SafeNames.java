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

    private static final Pattern SAFE_NODE_NAME = Pattern.compile("[A-Za-z0-9._-]{1,100}");

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
