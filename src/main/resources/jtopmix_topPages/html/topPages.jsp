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
<%--@elvariable id="currentNode" type="org.jahia.services.content.JCRNodeWrapper"--%>
<%--@elvariable id="out" type="java.io.PrintWriter"--%>
<%--@elvariable id="script" type="org.jahia.services.render.scripting.Script"--%>
<%--@elvariable id="scriptInfo" type="java.lang.String"--%>
<%--@elvariable id="workspace" type="java.lang.String"--%>
<%--@elvariable id="renderContext" type="org.jahia.services.render.RenderContext"--%>
<%--@elvariable id="currentResource" type="org.jahia.services.render.Resource"--%>
<%--@elvariable id="url" type="org.jahia.services.render.URLGenerator"--%>

<template:addResources insert="false" type="css" resources="loader.css"/>

<c:set var="getActionUrl" value="${url.base}${currentNode.path}.getTopPages.do"/>
<c:set var="updateActionUrl" value="${url.base}${currentNode.path}.updateTopPages.do"/>
<c:set var="parentName" value="${currentNode.parent.name}"/>
<c:set var="resultDivID" value="result-${currentNode.name}-${parentName}"/>
<c:set var="messagesDivID" value="messages-${currentNode.name}-${parentName}"/>
<c:set var="loaderDivID" value="loader-${currentNode.name}-${parentName}"/>
<c:set var="updateButtonID" value="updateBtn-${currentNode.name}-${parentName}"/>
<c:set var="title" value="${currentNode.properties['jcr:title'].string}"/>
<%-- The CND property is customCSS; ${...properties.customCss...} silently resolved to
     nothing, so a configured class was always ignored in favour of the fallback. --%>
<c:set var="customCSS" value="${currentNode.properties.customCSS.string}"/>
<c:set var="jsonResult" value="${currentNode.properties.jsonResult.string}"/>
<c:set var="listCssClass" value="${empty customCSS ? 'topPages' : customCSS}"/>

<c:if test="${renderContext.editMode}">
    <c:set var="updateError" value="${currentNode.properties.lastErrorReceived.string}"/>
    <c:if test="${not empty updateError}">
        <div class="alert alert-danger">
            <p><b> <fmt:message key="toppages.result.error"/> </b> <br> ${fn:escapeXml(updateError)} </p>
        </div>
    </c:if>
    <div id="${messagesDivID}" style="display: none;">
        <button type="button" class="close" data-dismiss="alert">&times;</button>
        <div id="message">
        </div>
    </div>
    <div id="${loaderDivID}" style="display: none;">
        <span> Please wait, this may take sometime..</span>
        <div class="loader" > <span> Please wait... </span></div>
    </div>
    <button type="submit" id="${updateButtonID}" type="button" class="btn btn-primary"> Update Top Pages</button>
</c:if>

<%--
  Everything the script needs travels as an escaped data attribute rather than as literal
  JavaScript: jsonResult and jcr:title are stored content, so interpolating them into a
  <script> block is a stored XSS and, for an absent jsonResult, invalid JavaScript.

  The script below uses jQuery, which this module deliberately does not declare. jQuery is
  supplied by the site's template set: Digitall's page template asks for `jquery.min.js`,
  which Jahia's static asset mapping resolves to the `jquery` system module
  (/modules/jquery/javascript/jquery-3.7.1.min.js). It never came from bootstrap3-core --
  that bundle ships only bootstrap.min.js, its CSS and the glyphicon fonts. The bootstrap
  class names used above (btn, alert, close, data-dismiss) are likewise styled by whatever
  bootstrap the surrounding template set already loads.
--%>
<div id="${resultDivID}"
     data-title="${fn:escapeXml(title)}"
     data-list-class="${fn:escapeXml(listCssClass)}"
     data-update-url="${fn:escapeXml(updateActionUrl)}"
     data-json-result="${fn:escapeXml(jsonResult)}">

</div>
<template:addResources>
    <script language="JavaScript">
        $(document).ready(function () {
            var resultDiv = $("#${resultDivID}");
            var messagesDiv = $("#${messagesDivID}");
            var loaderDiv = $("#${loaderDivID}");
            var title = resultDiv.attr("data-title") || "";
            var listClass = resultDiv.attr("data-list-class") || "topPages";
            var updateActionUrl = resultDiv.attr("data-update-url");
            var jsonResult = parseResult(resultDiv.attr("data-json-result"));

            if (jsonResult) {
                displayResult(jsonResult, resultDiv, messagesDiv, title, false);
            }

            $("#${updateButtonID}").click(function () {
                updateTopPages(updateActionUrl, resultDiv, messagesDiv, title);
            });

        function parseResult(raw) {
            if (!raw) {
                return null;
            }
            try {
                return JSON.parse(raw);
            } catch (e) {
                return null;
            }
        }

        function updateTopPages(actionUrl, resultDiv, messagesDiv, title) {
            loaderDiv.show();
            // POST, because org.jahia.bin.Action defaults requiredMethods to ["POST"] -- and
            // because a state-changing call must not be reachable through a GET.
            $.ajax({
                url: actionUrl,
                method: "POST",
                dataType: "json",
                headers: {Accept: "application/json"}
            }).done(function (result) {
                if (result) {
                    displayResult(result, resultDiv, messagesDiv, title, true);
                }
            }).fail(function () {
                loaderDiv.hide();
                displayMessage("Unable to update the top pages", messagesDiv, "error");
            });
        }

        // Titles and hrefs come from a remote report: they are built as text nodes, never
        // concatenated into an html string, and a link is only rendered for an absolute
        // http(s) target.
        function displayResult(text, resultDiv, messagesDiv, title, update) {
            resultDiv.empty();
            if (title) {
                resultDiv.append($("<h3></h3>").text(title));
            }

            if (text && text.topPages) {
                var list = $("<ul></ul>").addClass(listClass);
                $.each(text.topPages, function (i, page) {
                    list.append(buildPageItem(page));
                });
                resultDiv.append(list);
            }
            loaderDiv.hide();

            if (text && text.errorMessages) {
                var msgs = "";
                text.errorMessages.forEach(function (msg) {
                    msgs += msg + "\n";
                });
                displayMessage(msgs, messagesDiv, "error");
                return;
            }

            if (update) {
                displayMessage("Top Pages Updated", messagesDiv, "success");
            }
        }

        function buildPageItem(page) {
            var item = $("<li></li>");
            var label = page.title || page.href || "";
            if (/^https?:\/\//i.test(page.href)) {
                item.append($("<a></a>").attr("href", page.href).text(label));
            } else {
                item.text(label);
            }
            return item;
        }

        function displayMessage(message, messagesDiv, alertType) {
            if (message) {
                messagesDiv.find('#message').text(message);
                messagesDiv.removeClass();
                if (alertType == "success")
                    messagesDiv.addClass("alert alert-success");
                else if (alertType == "error")
                    messagesDiv.addClass("alert alert-danger");
                messagesDiv.show();
            }
            messagesDiv.on("close.bs.alert", function () {
                messagesDiv.hide();
                return false;
            });
        }
        });
    </script>
</template:addResources>
