package org.jahia.modules.actions;


import org.jahia.bin.Action;
import org.jahia.bin.ActionResult;
import org.jahia.modules.TopPages;
import org.jahia.services.content.JCRSessionWrapper;
import org.jahia.services.render.RenderContext;
import org.jahia.services.render.Resource;
import org.jahia.services.render.URLResolver;
import org.json.JSONObject;
import org.osgi.service.component.annotations.Component;

import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import java.util.List;
import java.util.Map;

/**
 * Registered as an OSGi Declarative Services component providing {@link Action}; Jahia's extension
 * registry tracks that service and files it under {@link Action#getName()}. The name and the
 * anonymous access flag used to come from Spring property injection and are now set in the
 * constructor, because nothing configures a DS component's fields from outside.
 *
 * <p>This is the read path: it only returns what is already stored on the node, so it is open to
 * an unauthenticated caller. {@link Action} defaults requireAuthenticatedUser to true, hence the
 * explicit call below.
 */
@Component(service = Action.class, immediate = true)
public class GetTopPagesAction extends Action {

    public GetTopPagesAction() {
        setName("getTopPages");
        setRequireAuthenticatedUser(false);
    }

    @Override
    public ActionResult doExecute(HttpServletRequest httpServletRequest, RenderContext renderContext, Resource resource, JCRSessionWrapper jcrSessionWrapper, Map<String, List<String>> map, URLResolver urlResolver) throws Exception {
        TopPages topPages = new TopPages();
        //Return a json object of the top pages
        JSONObject result = topPages.getTopPages(resource.getNode());
        return new ActionResult(HttpServletResponse.SC_OK, null, result );
    }

}
