package org.jahia.modules.utils;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.net.InetAddress;
import java.net.URI;
import java.net.UnknownHostException;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.Locale;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Allow-list for every outbound URL this module fetches.
 *
 * <p>The module fetches two kinds of URL, both ultimately supplied by a user: the AWStats report
 * URL (global configuration or the per-node {@code overrideConfig} override) and, when
 * {@code titleFromHTML} is set, every link found inside that remote report. Both must go through
 * {@link #validate(URI)} before a request is issued.
 *
 * <p>What is blocked, and why:
 * <ul>
 *   <li>any scheme other than {@code http} / {@code https} — {@code file:}, {@code jar:} and
 *       friends turn a report URL into a local file read;</li>
 *   <li>loopback addresses — services bound to localhost are never meant to be reachable;</li>
 *   <li>link-local addresses — this is what stops {@code http://169.254.169.254/} cloud
 *       metadata credential theft;</li>
 *   <li>wildcard/any-local and multicast addresses.</li>
 * </ul>
 *
 * <p>Site-local (RFC 1918) addresses are deliberately <em>allowed</em>: AWStats is normally hosted
 * on an internal statistics host, so blocking private ranges would break the module's primary
 * legitimate use.
 *
 * <p>Caveat: the host is resolved here and resolved again by the HTTP client, so a DNS entry that
 * changes between the two calls is not covered. Preventing that requires pinning the resolved
 * address into the connection manager, which is out of scope for this guard.
 */
public final class SafeUrls {

    private static final Logger logger = LoggerFactory.getLogger(SafeUrls.class);

    private static final Set<String> ALLOWED_SCHEMES =
            Collections.unmodifiableSet(new HashSet<>(Arrays.asList("http", "https")));

    /** A link target the browser may safely be handed as an {@code href}. */
    private static final Pattern ABSOLUTE_HTTP_URL = Pattern.compile("^https?://\\S+$", Pattern.CASE_INSENSITIVE);

    private SafeUrls() {
        // utility class
    }

    /**
     * Check a URI against the allow-list.
     *
     * @param uri the URI about to be fetched
     * @return an empty Optional when the URI may be fetched, otherwise the reason it was rejected
     */
    public static Optional<String> validate(URI uri) {
        if (uri == null) {
            return Optional.of("No URL supplied");
        }

        String scheme = uri.getScheme();
        if (scheme == null || !ALLOWED_SCHEMES.contains(scheme.toLowerCase(Locale.ROOT))) {
            return Optional.of("Only http and https URLs are allowed, received: " + scheme);
        }

        String host = uri.getHost();
        if (host == null || host.trim().isEmpty()) {
            return Optional.of("The URL has no host");
        }

        final InetAddress[] addresses;
        try {
            addresses = InetAddress.getAllByName(host);
        } catch (UnknownHostException e) {
            logger.debug("Unable to resolve host {}", host, e);
            return Optional.of("Unable to resolve host: " + host);
        }

        for (InetAddress address : addresses) {
            if (isBlocked(address)) {
                logger.warn("Rejected an outbound request to a blocked address: {} ({})", host, address.getHostAddress());
                return Optional.of("The host " + host + " resolves to an address that is not allowed");
            }
        }

        return Optional.empty();
    }

    /**
     * Whether a value read out of a remote document may be used as a link target in a rendered page.
     * Only absolute http(s) URLs qualify; anything else (javascript:, data:, relative paths) does not.
     */
    public static boolean isSafeLinkTarget(String url) {
        return url != null && ABSOLUTE_HTTP_URL.matcher(url).matches();
    }

    private static boolean isBlocked(InetAddress address) {
        return address.isLoopbackAddress()
                || address.isLinkLocalAddress()
                || address.isAnyLocalAddress()
                || address.isMulticastAddress();
    }
}
