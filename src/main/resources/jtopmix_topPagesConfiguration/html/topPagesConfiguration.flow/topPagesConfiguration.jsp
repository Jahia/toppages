<%@ page language="java" contentType="text/html;charset=UTF-8" %>
<%@ taglib prefix="template" uri="http://www.jahia.org/tags/templateLib" %>
<%@ taglib prefix="c" uri="http://java.sun.com/jsp/jstl/core" %>
<%@ taglib prefix="fn" uri="http://java.sun.com/jsp/jstl/functions" %>
<%@ taglib prefix="fmt" uri="http://java.sun.com/jsp/jstl/fmt" %>
<%@ taglib prefix="jcr" uri="http://www.jahia.org/tags/jcr" %>
<%@ taglib prefix="ui" uri="http://www.jahia.org/tags/uiComponentsLib" %>
<%@ taglib prefix="functions" uri="http://www.jahia.org/tags/functions" %>
<%@ taglib prefix="query" uri="http://www.jahia.org/tags/queryLib" %>
<%@ taglib prefix="utility" uri="http://www.jahia.org/tags/utilityLib" %>
<%@ taglib prefix="s" uri="http://www.jahia.org/tags/search" %>
<%@ taglib prefix="form" uri="http://www.springframework.org/tags/form" %>
<%--@elvariable id="currentNode" type="org.jahia.services.content.JCRNodeWrapper"--%>
<%--@elvariable id="out" type="java.io.PrintWriter"--%>
<%--@elvariable id="script" type="org.jahia.services.render.scripting.Script"--%>
<%--@elvariable id="scriptInfo" type="java.lang.String"--%>
<%--@elvariable id="workspace" type="java.lang.String"--%>
<%--@elvariable id="renderContext" type="org.jahia.services.render.RenderContext"--%>
<%--@elvariable id="currentResource" type="org.jahia.services.render.Resource"--%>
<%--@elvariable id="url" type="org.jahia.services.render.URLGenerator"--%>
<template:addResources type="javascript" resources="jquery.min.js,jquery-ui.min.js"/>
<template:addResources type="javascript" resources="admin-bootstrap.js"/>
<template:addResources type="css" resources="font-awesome.min.css"/>

<c:set var="sitesConfigList" value="${topPagesModel.siteConfigList}"/>
<template:addResources>
    <script type="text/javascript">
        // Delegated instead of an inline onClick, so no configuration name is ever
        // interpolated into a JavaScript string literal. The handler runs while the click
        // bubbles, i.e. before the form is submitted, which is what the delete flow needs.
        // Plain DOM on purpose: this script must not depend on jQuery having loaded first.
        (function () {
            function onRowButtonClick(event) {
                var button = event.target;
                while (button && button !== event.currentTarget && !button.getAttribute("data-site-name")) {
                    button = button.parentElement;
                }
                if (!button || !button.getAttribute("data-site-name")) {
                    return;
                }
                var siteName = button.getAttribute("data-site-name");
                document.getElementById("selectedSiteName").value = siteName;
                if (button.getAttribute("data-confirm-delete") === "true" &&
                    window.confirm("Are you sure you want to delete the config for: " + siteName + "?")) {
                    document.getElementById("confirmDelete").value = "delete";
                }
            }

            function bind() {
                var form = document.getElementById("topPagesForm");
                if (form) {
                    form.addEventListener("click", onRowButtonClick);
                }
            }

            if (document.readyState === "loading") {
                document.addEventListener("DOMContentLoaded", bind);
            } else {
                bind();
            }
        })();
    </script>
</template:addResources>

<jcr:node path="/sites" var="sitesVar"/>
<div class="text-center"><h2><fmt:message key="toppages.config.title"/></h2></div>
<div class="box-1">
    <div class="container-fluid">
        <div class="row-fluid">
            <div class="panel">
                <div class="mt-1"><b> <fmt:message key="toppages.config.siteList"/></b></div>
                <p class="text-justify h5"><br><fmt:message key="toppages.config.siteListDescription"/></p>

                <form:form id="topPagesForm" class="form-horizontal"
                           modelAttribute="topPagesModel" method="post" action="${flowExecutionUrl}">
                    <div class="flex-row">
                        <button id="createSiteConfig" class="btn btn-primary" type="submit"
                                name="_eventId_newSiteConfig">
                            <fmt:message key="lbl.btnAddConfig"> </fmt:message>
                        </button>
                    </div>

                    <form:hidden id="selectedSiteName" path="selectedSiteName"/>
                    <form:hidden id="confirmDelete" path="confirmDelete"/>
                    <c:choose>
                        <c:when test="${empty sitesConfigList}">
                            <h2><fmt:message key="toppages.model.empty"> </fmt:message></h2>
                        </c:when>
                        <c:otherwise>
                            <table class="table table-bordered table-striped table- table-hover">
                                <thead class="thead-ligh">
                                <th scope="col"> Site Name</th>
                                <th scope="col"> Report Url</th>
                                <th scope="col"> Include Filter</th>
                                <th scope="col"> Exclude Filter</th>
                                <th scope="col"> Title from HTML</th>
                                <th scope="col"> Separator</th>

                                <th scope="col"> Action</th>
                                </thead>
                                <c:forEach items="${sitesConfigList}" var="site" varStatus="keys">
                                    <tr>
                                        <td>${fn:escapeXml(site.siteName)}</td>
                                        <td>${fn:escapeXml(site.reportUrl)}</td>
                                        <td>${fn:escapeXml(site.includeFilter)}</td>
                                        <td>${fn:escapeXml(site.excludeFilter)}</td>
                                        <td>${site.titleFromHTML}</td>
                                        <td>${fn:escapeXml(site.titleSeparator)}</td>
                                        <td>
                                            <button id="editSiteConfig" class="fa fa-pencil" type="submit"
                                                    data-site-name="${fn:escapeXml(site.siteName)}"
                                                    name="_eventId_editSiteConfig">
                                            </button>
                                            <button id="deleteSiteConfig" class="fa fa-trash" type="submit"
                                                    data-site-name="${fn:escapeXml(site.siteName)}"
                                                    data-confirm-delete="true"
                                                    name="_eventId_deleteSiteConfig">
                                            </button>
                                        </td>
                                    </tr>
                                </c:forEach>
                            </table>
                        </c:otherwise>
                    </c:choose>
                </form:form>
            </div>
        </div>
    </div>
</div>

<div class="box-1">
    <div class="container-fluid">
        <div class="row-fluid">

            <div class="panel">
                <div><b> <fmt:message key="toppages.config.nodesListTitle"/></b></div>
                <p><br><fmt:message key="toppages.config.nodesListDescription"/></p>
                <form:form id="topPagesAll" class="form-horizontal"
                           method="post" action="${flowExecutionUrl}">
                    <div class="flex-row">
                        <button id="getAllPages" class="btn btn-primary" type="submit"
                                name="_eventId_getTopPagesNodes">
                            <fmt:message key="lbl.btnlistNodes"> </fmt:message>
                        </button>
                    </div>
                    <div id="allTopPagesNodes">
                        <c:if test="${not empty allNodes}">
                                <table class="table table-bordered table-striped table-hover">
                                    <thead class="thead-ligh">
                                    <th scope="col"> Site Configuration Name</th>
                                    <th scope="col"> Node Name</th>
                                    <th scope="col"> Path</th>
                                    <th scope="col"> Last Published</th>
                                    <th scope="col"> Action</th>
                                    </thead>
                                    <c:forEach items="${allNodes}" var="node">
                                        <tr>
                                            <td> ${fn:escapeXml(node.jahiaSite)} </td>
                                            <td> ${fn:escapeXml(node.name)} </td>
                                            <td> ${fn:escapeXml(node.path)}</td>
                                            <td>
                                                <c:choose>
                                                    <c:when test="${empty node.lastPublished}">
                                                        Not published
                                                    </c:when>
                                                    <c:otherwise>
                                                        ${node.lastPublished}
                                                    </c:otherwise>
                                                </c:choose>
                                            </td>
                                            <td>
                                                <%-- A top pages node does not have to live inside a page (content under
                                                     /sites/<site>/contents has no page ancestor). Such a node is still
                                                     listed, but there is nothing to link to, so no link is emitted
                                                     rather than one pointing at /cms/edit/default/en/.html --%>
                                                <c:choose>
                                                    <c:when test="${empty node.parentPage}">
                                                        No enclosing page
                                                    </c:when>
                                                    <c:otherwise>
                                                        <c:url value="${url.server}/cms/edit/default/${node.defaultLanguage}/${node.parentPage}.html"
                                                               var="editUrl"/>
                                                        <a href="${fn:escapeXml(editUrl)}" target="_blank"> View Page </a>
                                                    </c:otherwise>
                                                </c:choose>
                                            </td>
                                        </tr>
                                    </c:forEach>
                                </table>
                            </c:if>
                    </div>
                </form:form>
            </div>
        </div>
    </div>
</div>
