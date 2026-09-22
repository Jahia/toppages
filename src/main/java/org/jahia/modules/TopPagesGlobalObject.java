package org.jahia.modules;

import org.jahia.services.content.rules.ModuleGlobalObject;
import org.osgi.service.component.annotations.Component;

import java.util.Collections;

/**
 * Exposes {@link TopPagesService} to the Drools engine under the global name
 * {@code topPagesService}, which is what {@code META-INF/rules.drl} declares and what
 * {@code META-INF/rules.dsl} calls in the consequence of the "update top pages" rule.
 *
 * <p>Replaces the anonymous {@code ModuleGlobalObject} Spring bean. {@link ModuleGlobalObject} is
 * a concrete Jahia class that cannot carry a DS annotation, so this subclass exists only to be
 * annotated; Jahia's extension registry tracks the service and copies every entry of
 * {@link #getGlobalRulesObject()} into each {@code RulesListener} through
 * {@code addGlobalObject()}.
 *
 * <p>The global name is load-bearing: a mismatch makes the rule package fail to compile and the
 * module start in ERROR_WITH_RULES.
 */
@Component(service = ModuleGlobalObject.class, immediate = true)
public class TopPagesGlobalObject extends ModuleGlobalObject {

    /** Must match the {@code global TopPagesService topPagesService} declaration in rules.drl. */
    private static final String GLOBAL_NAME = "topPagesService";

    public TopPagesGlobalObject() {
        setGlobalRulesObject(Collections.singletonMap(GLOBAL_NAME, (Object) new TopPagesService()));
    }
}
