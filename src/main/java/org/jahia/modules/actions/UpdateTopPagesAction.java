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
 * required permission used to come from Spring property injection and are now set in the
 * constructor, because nothing configures a DS component's fields from outside.
 *
 * <p>updateTopPages rewrites the node (jsonResult, lastErrorReceived and, when overrideConfig
 * is false, the five configuration properties) and makes the server fetch a remote report,
 * so read access to the node is not enough: the caller must be allowed to write it.
 *
 * <p>jcr:write is deliberate. hasPermission() resolves the name through privilegeFromName(),
 * which answers an unknown name with an AccessControlException that JCRNodeWrapperImpl maps
 * to false, so a typo here locks out every caller, root included. jcr:write is a core
 * privilege registered on this platform and is workspace-resolved, so an editor keeps the
 * button in edit mode while the live workspace stays closed to a reader.
 */
@Component(service = Action.class, immediate = true)
public class UpdateTopPagesAction extends Action {

    public UpdateTopPagesAction() {
        setName("updateTopPages");
        setRequiredPermission("jcr:write");
    }

    @Override
    public ActionResult doExecute(HttpServletRequest httpServletRequest, RenderContext renderContext, Resource resource, JCRSessionWrapper jcrSessionWrapper, Map<String, List<String>> map, URLResolver urlResolver) throws Exception {
        TopPages topPages = new TopPages();
        topPages.updateTopPages(resource.getNode());
        JSONObject result =topPages.getTopPages(resource.getNode());
        return new ActionResult(HttpServletResponse.SC_OK, null, result );
    }

}
