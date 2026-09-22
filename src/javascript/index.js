/*
 * Webpack entry point. A Module Federation remote reaches its code through the container's
 * exposed './init', never through this entry, so it is deliberately empty: it exists only so the
 * bundle carries the webpack runtime the container needs.
 */
