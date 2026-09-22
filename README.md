# Jahia TopPages

A Jahia Community module that retrieves the most visited pages from an AWStats
(`awstats.pl`) report and renders them as a ranked list in any Jahia page.

# Requirements
- Jahia 8.1.0.0 or later (`Jahia-Required-Version` of the built bundle).
- The modules it depends on: `default`, `serverSettings`.
- An AWStats CGI reachable over `http` or `https` **from the Jahia JVM** — not from the
  visitor's browser. See "Outbound requests" for what the module will and will not fetch.

# Usage
1. Install the module and enable it on the required sites, and on the system site. The
   administration screen itself no longer needs the latter — it is a React route in the app
   shell, not a template on `/settings` — but the configuration nodes it writes live outside
   any site, and the end-to-end suite enables both.
2. Go to Jahia Administration > Server > Configuration > Top Pages and add at least one
   AWStats configuration. The route requires the `admin` permission, on top of the
   `administrationAccess` the administration itself requires.
3. In jContent, add a Top Pages component to a page, choose the configuration in
   *Select report*, and set the display options.
4. Publish the node. The live rendering reads the result stored on the published node.

# Global report configuration
Each configuration is a `jtopmix:siteConfig` node under `/settings/top-pages`, one child
per AWStats report.

| Field | Meaning |
|---|---|
| Name | The configuration name, and the JCR node name. It must match `[A-Za-z0-9._-]{1,100}`; anything else is refused with an "Illegal Name" message. Names are unique. |
| AWStats report URL | The report URL. The module appends `output=urldetail`, `urlfilter`, `urlfilterex`, `year` and `month` to it. |
| Include filter / Exclude filter | Passed through unchanged as AWStats' own `urlfilter` / `urlfilterex`. |
| Read titles from the page HTML | Fetch each page listed in the report and read its `<title>` instead of deriving a title from the URL. This is one extra outbound request per row per month, and is slow. |
| Title separator | When set, a title read from HTML is truncated at the first occurrence of this string. |

Every write goes through `ConfigurationUtil` and always sets all five properties, and it has
to: they are read back inside a `try` that swallows `PathNotFoundException`, so a
configuration node built by any other means with a property missing reads back as `null` and
every update against it is silently skipped.

`/settings/top-pages` is created by the first configuration that is saved. Reading the list
never creates it, so an unconfigured repository simply shows the empty state.

## The administration screen
The screen is a React route registered into the Jahia app shell, and it drives nothing but
the module's own GraphQL API — there is no server-side page behind it and the module carries
no Spring context. Its sources are under `src/javascript`; webpack bundles them as a Module
Federation *remote* (`src/main/resources/javascript/apps/remoteEntry.js`), declared to the
app shell by `src/main/resources/javascript/apps/jahia.json`. React, Apollo,
`@jahia/ui-extender` and `@jahia/moonstone` are taken from the shell's shared scope rather
than bundled. `mvn clean install` runs that build: `frontend-maven-plugin` downloads node
into `./node`, runs `npm ci` and then `npm run build` at `generate-resources`, before the
resources are packaged.

It also carries the diagnostic listing, *Show all Top Pages nodes*: every
`jtopmix:topPages` node in the repository with the configuration it reads and the page it
sits on, which is the screen to open when a component renders nothing.

# GraphQL API

The same configurations can be maintained over `POST /modules/graphql`, under a single
namespaced field on each root type — `Query.topPages` and `Mutation.topPages`. Nothing is
added flat to the root: two modules declaring the same root field make `DXGraphQLProvider`
fail with a duplicate-field error that takes down the whole schema, not just this module's
part of it.

```graphql
query {
  topPages {
    reportConfigurations { name awStatsUrl includeFilter excludeFilter titleFromHTML titleSeparator }
    reportConfiguration(name: "my-report") { name awStatsUrl }
    contentNodes { name path reportConfiguration lastPublished parentPage defaultLanguage }
  }
}

mutation {
  topPages {
    createReportConfiguration(name: "my-report", awStatsUrl: "https://stats.example.com/awstats.pl") { name }
    updateReportConfiguration(name: "my-report", newName: "renamed", includeFilter: "/en/") { name }
    deleteReportConfiguration(name: "renamed")
  }
}
```

`createReportConfiguration` takes `name` and `awStatsUrl`; the other four are optional and
default to empty / false, and all five properties are written either way.
`updateReportConfiguration` leaves out arguments alone rather than clearing them, so a caller
changing one field does not erase the rest. A refused write — an unsafe name, a duplicate, a
configuration that is not there — comes back as a GraphQL error classified
`TopPagesConfigurationException`, never as a quiet no-op.

`contentNodes` is the diagnostic listing the administration screen renders under *Show all
Top Pages nodes*: every `jtopmix:topPages` node in the edit workspace, read with the
**caller's** session, with `parentPage` null for a node that sits outside any page.

Every field requires the `administrationAccess` permission, the same server-scope permission
that gates the administration screen. It has to: these writes run under a system session,
which bypasses the access manager, so without the check the API would be a way around that
screen.

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
| Administration screen | the `admin` permission, and `administrationAccess` on `/` for the administration itself |
| `Query.topPages` / `Mutation.topPages` | the `administrationAccess` permission on `/`, checked against the *caller's* session |

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
This builds the administration UI as well: `frontend-maven-plugin` installs node into
`./node`, runs `npm ci` and `npm run build`, and webpack writes the remote into
`src/main/resources/javascript/apps/` (git-ignored — only `jahia.json` in that directory is
a source file). To iterate on the UI alone, `npx webpack --mode=development --watch` and
redeploy.
End-to-end coverage is a Cypress suite running against a Docker stack (Jahia plus an nginx
standing in for the AWStats CGI). See [`tests/README.md`](tests/README.md) for how to build
and run it.

# Current limitations
- **A Top Pages node outside any page has no link to a page.** "Show all Top Pages nodes"
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
