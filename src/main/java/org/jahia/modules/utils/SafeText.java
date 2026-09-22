package org.jahia.modules.utils;

import java.util.regex.Pattern;

/**
 * Neutralises text taken out of a remote document before it is stored and rendered.
 *
 * <p>Page titles and link targets in an AWStats report are attacker-influenced: anybody who can
 * get a URL into the statistics of the monitored site controls them. The rendering view builds its
 * DOM with jQuery {@code .text()}, so the values never reach an HTML parser — this is the
 * server-side half of that defence, applied before the value is persisted in {@code jsonResult}.
 *
 * <p>Markup is <em>stripped</em> rather than entity-escaped on purpose: escaping here and rendering
 * through {@code .text()} would double-escape, so an ordinary title containing {@code &} would be
 * shown to editors as {@code &amp;}.
 */
public final class SafeText {

    private static final Pattern TAG = Pattern.compile("<[^>]*>");
    private static final Pattern ANGLE_BRACKET = Pattern.compile("[<>]");
    private static final Pattern CONTROL_CHARACTER = Pattern.compile("\\p{Cntrl}");
    private static final Pattern WHITESPACE = Pattern.compile("\\s");

    private SafeText() {
        // utility class
    }

    /**
     * @param value free text read from a remote document, may be null
     * @return the value with tag-like sequences and control characters removed, never null
     */
    public static String stripMarkup(String value) {
        if (value == null) {
            return "";
        }
        String stripped = TAG.matcher(value).replaceAll("");
        stripped = ANGLE_BRACKET.matcher(stripped).replaceAll("");
        return CONTROL_CHARACTER.matcher(stripped).replaceAll("").trim();
    }

    /**
     * @param url a link target read from a remote document, may be null
     * @return the url without control characters or whitespace, never null
     */
    public static String stripUrl(String url) {
        if (url == null) {
            return "";
        }
        String stripped = CONTROL_CHARACTER.matcher(url).replaceAll("");
        return WHITESPACE.matcher(stripped).replaceAll("");
    }
}
