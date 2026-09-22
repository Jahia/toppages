package org.jahia.modules.utils;

import org.jahia.modules.models.TopPagesNode;
import org.jahia.services.content.JCRNodeWrapper;
import org.jahia.services.content.JCRSessionFactory;
import org.jahia.services.content.JCRSessionWrapper;
import org.slf4j.Logger;

import javax.jcr.NodeIterator;
import javax.jcr.RepositoryException;
import javax.jcr.query.Query;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;

import static org.slf4j.LoggerFactory.getLogger;

/**
 * The diagnostic listing of every {@code jtopmix:topPages} node in the repository.
 *
 * <p>This used to live in the server-settings web flow handler, which is gone; the listing itself
 * is not, because "which nodes exist, which report does each one read and can I open the page it
 * sits on" is the first question asked whenever a Top Pages component shows nothing. It is now
 * read through the GraphQL API and rendered by the React administration route.
 *
 * <p>The session is the <em>caller's</em>, not a system session: the GraphQL field is gated on
 * {@code administrationAccess}, and a diagnostic screen that showed content its viewer may not
 * read would be a way around the access manager.
 */
public final class TopPagesNodeLister {

    private static final Logger logger = getLogger(TopPagesNodeLister.class);

    /** Node types the upward walk for an enclosing page recognises, and the one it stops at. */
    private static final String PAGE_TYPE = "jnt:page";
    private static final String SITE_TYPE = "jnt:virtualsite";

    private static final String QUERY = "select * from [jtopmix:topPages]";
    private static final String EDIT_WORKSPACE = "default";

    private TopPagesNodeLister() {
        // utility class
    }

    /**
     * Every {@code jtopmix:topPages} node the caller may read, sorted by the report configuration
     * it is bound to.
     *
     * @return the rows; never null, and never partial because one node failed - see below
     */
    public static List<TopPagesNode> listAll() {
        List<TopPagesNode> allNodes = new ArrayList<>();
        try {
            JCRSessionWrapper session = JCRSessionFactory.getInstance().getCurrentUserSession(EDIT_WORKSPACE);
            NodeIterator iterator = session.getWorkspace().getQueryManager()
                    .createQuery(QUERY, Query.JCR_SQL2).execute().getNodes();
            if (!iterator.hasNext()) {
                logger.info("No top pages nodes available to list");
            }
            while (iterator.hasNext()) {
                addIfReadable(allNodes, (JCRNodeWrapper) iterator.nextNode());
            }
            // Sort by siteName, tolerating a node whose jahiaSite property was never set.
            Comparator<TopPagesNode> compareBySite =
                    Comparator.comparing(TopPagesNode::getJahiaSite, Comparator.nullsLast(Comparator.naturalOrder()));
            Collections.sort(allNodes, compareBySite);
        } catch (RepositoryException e) {
            logger.error("An exception occurred while listing the top pages nodes", e);
        }

        // Always returned, even empty or partial: an absent listing is what made a single failure
        // erase the entire table.
        return allNodes;
    }

    /**
     * Append one node to the listing, skipping and logging it when it cannot be read.
     *
     * <p>Per node, so that one unreadable row is skipped instead of emptying the whole table: this
     * is a diagnostic screen, and a diagnostic screen that hides everything because of a single bad
     * node is worse than useless. The {@code throws} clause exists so that the {@code getPath()}
     * call in the log statement needs no second handler; it propagates to the caller exactly as it
     * did inline.
     */
    private static void addIfReadable(List<TopPagesNode> rows, JCRNodeWrapper node) throws RepositoryException {
        try {
            rows.add(readNode(node));
        } catch (RepositoryException e) {
            logger.warn("Skipping a top pages node that could not be read: {}", node.getPath(), e);
        }
    }

    /** Read one {@code jtopmix:topPages} node into the row the listing renders. */
    private static TopPagesNode readNode(JCRNodeWrapper node) throws RepositoryException {
        return new TopPagesNode(node.getName(),
                node.getPropertyAsString("jahiaSite"),
                node.getPath(),
                node.getLastPublishedAsDate(),
                node.getResolveSite().getDefaultLanguage(),
                getParentPage(node));
    }

    /**
     * Path of the {@code jnt:page} the node is rendered in, or {@code null} when it has none.
     *
     * <p>The walk is iterative and bounded twice over: it stops at the site node, and in any case
     * at the repository root. Content that lives outside any page - under
     * {@code /sites/<site>/contents}, for instance - therefore simply has no parent page. The
     * previous recursive version relied on {@code getParent()} throwing once it walked past the
     * root, which turned one such node into a {@code RepositoryException} that emptied the whole
     * administration listing.
     */
    private static String getParentPage(JCRNodeWrapper node) throws RepositoryException {
        JCRNodeWrapper current = node;
        while (current.getDepth() > 0) {
            JCRNodeWrapper parent = current.getParent();
            if (parent.isNodeType(PAGE_TYPE)) {
                return parent.getPath();
            }
            if (parent.isNodeType(SITE_TYPE)) {
                return null;
            }
            current = parent;
        }
        return null;
    }
}
