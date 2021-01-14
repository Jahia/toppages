(function() {
        window.jahia.i18n.loadNamespaces('toppages');

        window.jahia.uiExtender.registry.add('adminRoute', 'top-pages-configuration', {
                targets: ['administration-server-configuration:88'],
                // requiredPermission: 'admin',
                icon: null,
                label: 'Top Pages Configuration',
                isSelectable: true,
                iframeUrl: window.contextJsParameters.contextPath + '/cms/adminframe/default/en/settings.top-pages-configuration.html?redirect=false'
        });
})();


