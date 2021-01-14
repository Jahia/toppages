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
<template:addResources type="javascript" resources="popper.js"/>
<template:addResources type="javascript" resources="jquery.min.js,jquery-ui.min.js"/>
<template:addResources type="javascript" resources="admin-bootstrap.js"/>
<template:addResources type="css" resources="bootstrap3.min.css"/>
<template:addResources type="css" resources="font-awesome.min.css"/>

<jcr:node path="/sites" var="sitesVar"/>

<div class="container">
    <div class="row-fluid">
        <div class="col-lg-8">
            <div class="text-center h5"><b> <fmt:message key="toppages.config.title"/></b></div>
            <div class="panel">
                <div class="panel-heading">
                    <c:choose>
                        <c:when test="${siteConfiguration.toBeUpdated}">
                            <strong> <fmt:message key="toppages.form.titleUpdate"/></strong>
                        </c:when>
                        <c:otherwise>
                            <strong> <fmt:message key="toppages.form.titleNew"/></strong>

                        </c:otherwise>
                    </c:choose>
                </div>
                <div class="panel-body">
                    <form:form name="createSiteConfig" action="${flowExecutionUrl}" method="post"
                               modelAttribute="siteConfiguration">
                        <%@ include file="validation.jspf" %>

                        <div class="form-group-sm">
                            <label for="siteName"><fmt:message key="lbl.siteName"/></label>
                            <form:input class="form-control" id="siteName" path="siteName"/>
                        </div>

                        <div class="form-group-sm">
                            <label for="reportUrl"><fmt:message key="lbl.awStatsUrl"/></label>
                            <form:input class="form-control" id="reportUrl" path="reportUrl"/>
                        </div>

                        <div class="form-group-sm">
                            <label for="includeFilter"><fmt:message key="lbl.includeFilter"/></label>
                            <form:input class="form-control" id="includeFilter" path="includeFilter"/>
                            <div class="text-error">
                                <strong><form:errors path="includeFilter"/></strong>
                            </div>
                        </div>
                        <div class="form-group-sm">
                            <label for="excludeFilter"><fmt:message key="lbl.excludeFilter"/></label>
                            <form:input class="form-control" id="excludeFilter" path="excludeFilter"/>
                            <div class="text-error">
                                <strong><form:errors path="excludeFilter"/></strong>
                            </div>
                        </div>
                        <div class="form-group-lg">
                            <label>
                                <form:checkbox value="${siteConfiguration.titleFromHTML}" class="checkbox-inline"
                                               id="titleFromHTML" path="titleFromHTML"/>
                                <span><fmt:message key="lbl.titleFromHTML"/></span>
                                <fmt:message key="lbl.titleFromHTMLDetails" var="titleFromHTMLDetails"/>
                                <a class="fa fa-exclamation-circle"  data-toggle="tooltip" data-placement="right" data-html="true" title="${titleFromHTMLDetails}">
                                    Hover for details
                                </a>
                            </label>
                        </div>

                        <div class="form-group-sm">
                            <label for="titleSeparator"><fmt:message key="lbl.titleSeparator"/></label>
                            <form:input class="form-control" id="titleSeparator" path="titleSeparator"/>
                            <div class="text-error">
                                <strong><form:errors path="titleSeparator"/></strong>
                            </div>
                        </div>
                    <br>
                        <div class="form-group">
                            <c:choose>
                                <c:when test="${siteConfiguration.toBeUpdated}">
                                    <button id="createConfig" class="btn btn-primary" type="submit"
                                            name="_eventId_updateSiteConfig">
                                        <fmt:message key="lbl.btnUpdateConfig"> </fmt:message>

                                    </button>
                                </c:when>
                                <c:otherwise>
                                    <button id="createConfig" class="btn btn-primary" type="submit"
                                            name="_eventId_saveSiteConfig">
                                        <fmt:message key="lbl.btnSaveConfig"> </fmt:message>
                                    </button>
                                </c:otherwise>
                            </c:choose>
                            <button id="createConfig" class="btn btn-secondary" onclick="javascript:history.back();">
                                <fmt:message key="lbl.btnBack"> </fmt:message>
                            </button>
                        </div>
                    </form:form>
                </div>
            </div>
        </div>
    </div>
</div>
