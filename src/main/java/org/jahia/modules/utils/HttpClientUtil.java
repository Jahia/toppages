package org.jahia.modules.utils;

import org.apache.http.HttpEntity;
import org.apache.http.client.config.RequestConfig;
import org.apache.http.client.methods.CloseableHttpResponse;
import org.apache.http.client.methods.HttpGet;
import org.apache.http.client.utils.URIBuilder;
import org.apache.http.entity.ContentType;
import org.apache.http.impl.client.CloseableHttpClient;
import org.apache.http.impl.client.HttpClients;
import org.apache.http.util.EntityUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.ByteArrayOutputStream;
import java.io.Closeable;
import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.URISyntaxException;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.util.Optional;

/**
 * The single outbound HTTP entry point of the module.
 *
 * <p>Every request it issues is checked against {@link SafeUrls} first, bounded by explicit
 * timeouts, forbidden from following redirects (a redirect is how an allow-listed host hands the
 * fetch to a blocked one) and capped in size before the body is handed to jsoup.
 *
 * <p>The instance owns a pooled {@link CloseableHttpClient}, so it is {@link Closeable} and callers
 * must close it — see {@code TopPages#getTopPagesForNMonths}.
 */
public class HttpClientUtil implements Closeable {

    private static final Logger logger = LoggerFactory.getLogger(HttpClientUtil.class);

    private static final int CONNECT_TIMEOUT_MS = 5000;
    private static final int SOCKET_TIMEOUT_MS = 10000;
    private static final int CONNECTION_REQUEST_TIMEOUT_MS = 5000;
    /** Plenty for an AWStats report page; anything larger is a denial of service, not a report. */
    private static final int MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
    private static final int READ_BUFFER_BYTES = 8192;
    private static final int HTTP_OK = 200;

    private static final RequestConfig REQUEST_CONFIG = RequestConfig.custom()
            .setConnectTimeout(CONNECT_TIMEOUT_MS)
            .setSocketTimeout(SOCKET_TIMEOUT_MS)
            .setConnectionRequestTimeout(CONNECTION_REQUEST_TIMEOUT_MS)
            .setRedirectsEnabled(false)
            .build();

    private String errorMessage = "";
    private final CloseableHttpClient httpClient;

    public HttpClientUtil() {
        this.httpClient = HttpClients.custom().setDefaultRequestConfig(REQUEST_CONFIG).build();
    }

    /**
     * Fetch a page and return its body, or null when it could not be retrieved.
     *
     * @param uriBuilder the target, validated against the outbound allow-list before any request
     * @return the response body, truncated to {@value #MAX_RESPONSE_BYTES} bytes, or null
     */
    public String getHtmlPage(URIBuilder uriBuilder) {
        URI uri = buildUri(uriBuilder);
        if (uri == null) {
            return null;
        }

        Optional<String> rejection = SafeUrls.validate(uri);
        if (rejection.isPresent()) {
            this.errorMessage = rejection.get();
            logger.error("Refused to fetch {}: {}", uri, rejection.get());
            return null;
        }

        try (CloseableHttpResponse response = httpClient.execute(new HttpGet(uri))) {
            HttpEntity entity = response.getEntity();
            try {
                int statusCode = response.getStatusLine().getStatusCode();
                if (statusCode != HTTP_OK) {
                    this.errorMessage = "Error while connecting to url, please check if the url is correct";
                    logger.error("Error while connecting to url: {}, please check if the url is correct, HTTP Status {}",
                            uri, response.getStatusLine());
                    return null;
                }
                return entity == null ? null : readBoundedBody(entity);
            } finally {
                EntityUtils.consumeQuietly(entity);
            }
        } catch (IOException e) {
            this.errorMessage = "Error while connecting to url";
            logger.error("Error while connecting to URL: {}", uri, e);
        }

        return null;
    }

    /**
     * A method to test if awStats url is reachable.
     *
     * @param uriBuilder the target, validated against the outbound allow-list before any request
     * @return true if response code is 200
     */
    public boolean testConnection(URIBuilder uriBuilder) {
        URI uri = buildUri(uriBuilder);
        if (uri == null) {
            return false;
        }

        Optional<String> rejection = SafeUrls.validate(uri);
        if (rejection.isPresent()) {
            this.errorMessage = rejection.get();
            logger.error("Refused to connect to {}: {}", uri, rejection.get());
            return false;
        }

        try (CloseableHttpResponse response = httpClient.execute(new HttpGet(uri))) {
            EntityUtils.consumeQuietly(response.getEntity());
            int responseCode = response.getStatusLine().getStatusCode();
            if (responseCode == HTTP_OK) {
                return true;
            }
            this.errorMessage += "Unable to connect to:" + uri.getHost() + uri.getPath()
                    + ". Error code received: " + responseCode;
            logger.error(this.errorMessage);
        } catch (IOException e) {
            this.errorMessage = "Unable to connect to awStats url";
            logger.error("Error while connecting to awStats URL {} ", uri, e);
        }
        return false;
    }

    public String getErrorMessage() {
        return this.errorMessage;
    }

    @Override
    public void close() throws IOException {
        this.httpClient.close();
    }

    private URI buildUri(URIBuilder uriBuilder) {
        if (uriBuilder == null) {
            this.errorMessage = "No URL supplied";
            return null;
        }
        try {
            return uriBuilder.build();
        } catch (URISyntaxException e) {
            this.errorMessage = "The url is not a valid URI";
            logger.error("Unable to build a URI from {}", uriBuilder, e);
            return null;
        }
    }

    /**
     * Read at most {@value #MAX_RESPONSE_BYTES} bytes of the body. An unbounded read straight into
     * jsoup lets a hostile or merely broken report exhaust the JVM heap.
     */
    private String readBoundedBody(HttpEntity entity) throws IOException {
        Charset charset = charsetOf(entity);
        try (InputStream content = entity.getContent()) {
            if (content == null) {
                return null;
            }
            ByteArrayOutputStream buffer = new ByteArrayOutputStream();
            byte[] chunk = new byte[READ_BUFFER_BYTES];
            int read;
            while (buffer.size() < MAX_RESPONSE_BYTES && (read = content.read(chunk)) != -1) {
                buffer.write(chunk, 0, Math.min(read, MAX_RESPONSE_BYTES - buffer.size()));
            }
            if (buffer.size() >= MAX_RESPONSE_BYTES) {
                logger.warn("The report response exceeded {} bytes and was truncated", MAX_RESPONSE_BYTES);
            }
            return new String(buffer.toByteArray(), charset);
        }
    }

    private Charset charsetOf(HttpEntity entity) {
        try {
            ContentType contentType = ContentType.get(entity);
            if (contentType != null && contentType.getCharset() != null) {
                return contentType.getCharset();
            }
        } catch (RuntimeException e) {
            logger.debug("Unparseable Content-Type, falling back to UTF-8", e);
        }
        return StandardCharsets.UTF_8;
    }
}
