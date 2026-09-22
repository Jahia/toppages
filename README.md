# Jahia TopPages

A Jahia Community module that retrieves the most visited pages from an AWStats
(`awstats.pl`) report and renders them as a ranked list in any Jahia page.

# Requirements
- Jahia 8.1.0.0 or later (`Jahia-Required-Version` of the built bundle).
- The modules it depends on: `default`, `bootstrap3-core`, `serverSettings`.
- An AWStats CGI reachable over `http` or `https` **from the Jahia JVM** — not from the
  visitor's browser. See "Outbound requests" for what the module will and will not fetch.

# Usage
1. Install the module and enable it on the required sites **and on the system site**. The
   administration page is a template applied to the `jnt:globalSettings` node `/settings`,
   and Jahia only resolves templates from modules installed on the system site; without it
   the page answers HTTP 500 with a `TemplateNotFoundException` that mentions no module.
2. Go to Jahia Administration > Server > Configuration > Top Pages Configuration and add
   at least one AWStats configuration. The route requires the `admin` permission.
3. In jContent, add a Top Pages component to a page, choose the configuration in
   *Select report*, and set the display options.
4. Publish the node. The live rendering reads the result stored on the published node.

# Global report configuration
Each configuration is a `jtopmix:siteConfig` node under `/settings/top-pages`, one child
per AWStats report.

| Field | Meaning |
|---|---|
| Site Name | The configuration name, and the JCR node name. It must match `[A-Za-z0-9._-]{1,100}`; anything else is refused with an "Illegal Name" message. Names are unique. |
| Location of the awstats script | The report URL. The module appends `output=urldetail`, `urlfilter`, `urlfilterex`, `year` and `month` to it. |
| Regex to include / Regex to exclude | Passed through unchanged as AWStats' own `urlfilter` / `urlfilterex`. |
| Get the Title from HTML | Fetch each page listed in the report and read its `<title>` instead of deriving a title from the URL. This is one extra outbound request per row per month, and is slow. |
| Separator to be used when parsing the title | When set, a title read from HTML is truncated at the first occurrence of this string. |

The form always writes all five properties, and it has to: `ConfigurationUtil` reads them
back inside a `try` that swallows `PathNotFoundException`, so a configuration node built by
any other means with a property missing reads back as `null` and every update against it is
silently skipped.

# The Top Pages component (`jtopmix:topPages`)

| Property | Default | Meaning |
|---|---|---|
| `jcr:title` | | Rendered as a heading above the list. |
| `jahiaSite` (*Select report*) | | Which `/settings/top-pages` configuration to use. |
| `numberOfResults` | 5 | Rows kept — both per month read and in the final list. |
| `nMonths` | 3 | Number of past months aggregated, counting back from the current one. |
| `overrideConfig` | false | When true, the node's own `awStatsUrl`, include/exclude filters, `titleFromHTML` and `titleSeparator` are used. When false, those five properties are overwritten from the global configuration on every update. |
| `customCSS` | | CSS class set on the generated `<ul>`. Defaults to `topPages`. |
| `jsonResult` (hidden) | | The stored result. |
| `lastErrorReceived` (hidden) | | The last failure, shown to editors in edit mode. |

# How the result is produced
There are two distinct paths, and only one of them talks to AWStats.

- **Update** — fetches the report and rewrites the node. It runs from the editor's
  "Update Top Pages" button (`updateTopPages.do`, POST), from the scheduled job, and from
  a Drools rule that fires when `numberOfResults`, `nMonths`, `customCSS`,
  `overrideConfig`, `jahiaSite`, `includeFilter`, `excludeFilter`, `titleFromHTML` or
  `titleSeparator` is set on a `jtopmix:topPages` node. Saving a newly created component
  therefore already fills in its list.
- **Read** — `getTopPages.do` returns the `jsonResult` stored on the node, or an empty
  list when there is none. It is public, never writes, and never issues an outbound
  request. A node that has never been updated renders nothing until one of the update
  triggers runs.

When a fetch fails, the previous `jsonResult` is kept and the reason is written to
`lastErrorReceived`. A broken AWStats host degrades the component to a stale list rather
than an empty one.

## Scheduled update
A Quartz job re-reads every `jtopmix:topPages` node in the `live` and `default`
workspaces. Its cron trigger is `0 0 0 ? * 1 *` — midnight on Sunday — and is overridden
through the `topPagesCronExp` key of the OSGi configuration `org.jahia.modules.toppages`.
The module ships a documented default at
`src/main/resources/META-INF/configurations/org.jahia.modules.toppages.cfg`, deployed to
`karaf/etc/org.jahia.modules.toppages.cfg`; editing that file reschedules the job without a
restart. An invalid expression is logged and leaves the job unscheduled, it does not stop
the module.

# Permissions

| Entry point | Requires |
|---|---|
| `getTopPages.do` | nothing; it is served to anonymous visitors |
| `updateTopPages.do` | `jcr:write` on the node, and POST: `org.jahia.bin.Action` defaults `requiredMethods` to `["POST"]`, so a GET is answered with 405 |
| Administration page | the `admin` permission |

# Outbound requests
Every request the module makes — the report itself, and with `titleFromHTML` each page
linked from it — goes through a single choke point that checks the target first:

- only `http` and `https` are accepted;
- loopback, link-local (`169.254.0.0/16`, i.e. cloud metadata), any-local and multicast
  addresses are refused;
- **site-local / RFC 1918 addresses are deliberately allowed**, because an AWStats host is
  normally an internal one. This module is not a defence against reaching your own private
  network, and does not pretend to be;
- redirects are not followed — a redirect is how an allowed host hands the fetch to a
  blocked one;
- timeouts are 5s connect, 10s socket and 5s connection-request, and the response body is
  read up to 4 MB and truncated beyond that.

A refused URL is never fetched: the reason is recorded in `lastErrorReceived` and shown to
the editor. In particular, if AWStats runs on the same machine as Jahia, a URL pointing at
`localhost` or `127.0.0.1` is refused — configure a routable host name or address instead.

# Build and test
```bash
mvn clean install
```
End-to-end coverage is a Cypress suite running against a Docker stack (Jahia plus an nginx
standing in for the AWStats CGI). See [`tests/README.md`](tests/README.md) for how to build
and run it.

# Current limitations
- **A Top Pages node outside any page has no "View Page" link.** "Show all Top Pages nodes"
  resolves each node's enclosing `jnt:page`; content that lives outside one — under
  `/sites/<site>/contents`, for instance — is listed with the rest, but with nothing to link
  to. (Until 2.0.3 such a node emptied the *whole* table: the upward walk recursed past the
  repository root and the exception was swallowed without populating the model.)
- **The update rule does not fire on `awStatsUrl`.** Changing only that property on a node
  with `overrideConfig` set will not refresh the result; change another property, press
  "Update Top Pages", or wait for the scheduled job.
- **The *Select report* choice list is untested.** A `ChoiceListInitializer` is only invoked
  by the Content Editor form engine, and the platform image the suite runs on exposes no
  forms API. See "Known gap" in [`tests/README.md`](tests/README.md).
