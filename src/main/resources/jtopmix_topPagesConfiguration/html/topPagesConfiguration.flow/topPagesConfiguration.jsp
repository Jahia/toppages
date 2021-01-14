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
        function selectedRow(siteName, del) {
            document.getElementById("selectedSiteName").value = siteName;
            if (del === true) {
                if (confirm("Are you sure you want to delete the config for: " + siteName + "?")) {
                    document.getElementById("confirmDelete").value = "delete";
                }
            }
        }
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
                                        <td>${site.siteName}</td>
                                        <td>${site.reportUrl}</td>
                                        <td>${site.includeFilter}</td>
                                        <td>${site.excludeFilter}</td>
                                        <td>${site.titleFromHTML}</td>
                                        <td>${site.titleSeparator}</td>
                                        <td>
                                            <button id="editSiteConfig" class="fa fa-pencil" type="submit"
                                                    onClick="selectedRow('${site.siteName}')"
                                                    name="_eventId_editSiteConfig">
                                            </button>
                                            <button id="deleteSiteConfig" class="fa fa-trash" type="submit"
                                                    onClick="selectedRow('${site.siteName}',true)"
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
                                            <td> ${node.jahiaSite} </td>
                                            <td> ${node.name} </td>
                                            <td> ${node.path}</td>
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
                                                <c:url value="${url.server}/cms/edit/default/${node.defaultLanguage}/${node.parentPage}.html"
                                                       var="editUrl"/>
                                                <a href="${editUrl}" target="_blank"> View Page </a></td>
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
