package org.jahia.modules;

import org.jahia.modules.utils.ConfigurationUtil;
import org.jahia.services.content.nodetypes.ExtendedPropertyDefinition;
import org.jahia.services.content.nodetypes.initializers.ChoiceListValue;
import org.jahia.services.content.nodetypes.initializers.ModuleChoiceListInitializer;
import org.osgi.service.component.annotations.Component;
import org.osgi.service.component.annotations.Reference;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Fills the "Select report" drop-down of the {@code jahiaSite} property with the names of the
 * report configurations stored under {@code /settings/top-pages}.
 *
 * <p>Registered as an OSGi Declarative Services component providing
 * {@link ModuleChoiceListInitializer}; Jahia's extension registry tracks that service and files it
 * under {@link #getKey()}. Nothing calls {@link #setKey(String)} any more -- the Spring bean used
 * to -- so the key is initialised to the value {@code definitions.cnd} references in
 * {@code choicelist[sitesConfigInitializer]}. Changing it silently empties the drop-down.
 */
@Component(service = ModuleChoiceListInitializer.class, immediate = true)
public class ChoiceListInitializer implements ModuleChoiceListInitializer {

    /** Must match {@code choicelist[sitesConfigInitializer]} in META-INF/definitions.cnd. */
    private static final String DEFAULT_KEY = "sitesConfigInitializer";

    private String key = DEFAULT_KEY;

    private ConfigurationUtil configurationUtil;

    @Reference
    public void setConfigurationUtil(ConfigurationUtil configurationUtil) {
        this.configurationUtil = configurationUtil;
    }

    /**
     * DS unbind method. The signature is imposed by Declarative Services -- bnd derives it from
     * {@code setConfigurationUtil} by name -- and the parameter is compared rather than ignored so
     * that a service being replaced cannot clear the reference to its successor.
     */
    public void unsetConfigurationUtil(ConfigurationUtil configurationUtil) {
        if (this.configurationUtil == configurationUtil) {
            this.configurationUtil = null;
        }
    }

    @Override
    public List<ChoiceListValue> getChoiceListValues(
            ExtendedPropertyDefinition epd, String param,
            List<ChoiceListValue> values, Locale locale,
            Map<String, Object> context) {
        List<ChoiceListValue> choiceListValues = new ArrayList<>();
        List<String> sitesList = configurationUtil.getSitesConfigList();
        if (sitesList == null) {
            return choiceListValues;
        }
        for (String s : sitesList) {
            choiceListValues.add(new ChoiceListValue(s, s));
        }

        return choiceListValues;
    }

    @Override
    public void setKey(String key) {
        this.key = key;
    }

    @Override
    public String getKey() {
        return key;
    }

}
