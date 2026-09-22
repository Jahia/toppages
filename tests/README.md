# topPages end-to-end tests

Docker-based Cypress suite for the `toppages` module, built on the standard
[`@jahia/cypress`](https://www.npmjs.com/package/@jahia/cypress) harness.

## The stack

| Service   | What it is                                                                     |
|-----------|--------------------------------------------------------------------------------|
| `jahia`   | `ghcr.io/jahia/jahia-ee-dev:8-SNAPSHOT`, provisioned with Digitall + the module |
| `awstats` | `nginx` serving `assets/awstats/` — a **static stand-in for the AWStats CGI**   |
| `cypress` | the test image built from this directory                                        |

`awstats` is the reason these tests can assert exact numbers. `TopPages.updateTopPages()`
fetches an AWStats `output=urldetail` report over HTTP and parses it with jsoup; pointed at
a real AWStats instance the output would drift daily. The fixture returns five rows with
fixed hit counts, and nginx ignores the `?year=&month=&urlfilter=` query string the module
appends — so a three-month aggregation reads the same rows three times and the expected
counts are simply `count × nMonths`.

Only the Jahia JVM ever fetches it, which is why `AWSTATS_BASE_URL` stays a
docker-network hostname (`http://awstats`) even when Cypress runs on your host. The
fixture is also published on `http://localhost:${AWSTATS_PORT:-8087}` for inspection;
change `AWSTATS_PORT` if that clashes with something already running.

## Run everything in Docker (what CI does)

```bash
# from the module root: build the module first
mvn clean install

cd tests
bash ci.build.sh      # build the test image and stage ../target/*-SNAPSHOT.jar into ./artifacts
bash ci.startup.sh    # boot jahia + awstats + cypress, run the specs, exit with the suite status
```

`ci.build.sh` deploys **everything** it finds in `artifacts/`, so never seed that directory
by hand — a stale jar from a renamed artifactId gets deployed alongside the current one.

Re-run `ci.build.sh` after *any* change under `tests/`, or the change never reaches the
container.

## Develop or debug a single spec

```bash
cd tests
yarn                       # fetch JS deps on the host
./ci.startup.sh notests    # boot Jahia + awstats WITHOUT running the specs
./env.run.sh               # provision the environment and run the suite headless once
source set-env.sh          # REQUIRED, and again in every new terminal
yarn run e2e:debug         # interactive runner (yarn e2e:ci for headless)
```

`baseUrl` is `http://localhost:8080`; the Jahia JPDA debug port is `8000`.

## The specs

| Spec                  | Covers                                                                              |
|-----------------------|-------------------------------------------------------------------------------------|
| `01-serverSettings`   | The webflow at *Administration → Server → Configuration → Top Pages*: create, validate, list, edit, rename, reject duplicates, delete — each verified in the UI *and* under `/settings/top-pages` |
| `02-topPagesActions`  | `updateTopPages` / `getTopPages`: report parsing and ranking, `jsonResult` caching, multi-month aggregation, `titleFromHTML`, global-config inheritance, the unreachable-report error path, the admin node listing, the live/anonymous path, plus two `KNOWN DEFECT` characterization tests |
| `03-editorExperience` | The component's visibility and type label in jContent, asserted as `root` **and** as the editor `mathias` |
| `04-permissions`      | Who may open the server-settings page, with an administrator positive control       |

## Things that will bite you

Each of these cost real debugging time; all of them fail in a way that points somewhere else.

- **The module must be enabled on `systemsite`.** A server-settings page is a template
  applied to the `jnt:globalSettings` node `/settings`, and Jahia only resolves templates
  from modules installed on the *system* site. Without it the page is a bare HTTP 500
  (`TemplateNotFoundException`) that says nothing about modules. `ensureModuleEnabled()`
  does this, from the spec — it cannot go in `assets/provisioning.yml`, because the
  harness runs the manifest *before* it deploys the module artifact.
- **The provisioning operation is `enable:`, not `enableModule:`.** The API answers an
  unknown operation with HTTP 200 and does nothing, so a wrong name fails silently.
- **Actions need three things at once**, handled by `callAction()`:
  `POST` (`org.jahia.bin.Action` defaults `requiredMethods` to `["POST"]`), the **CSRF
  token** (CSRF Guard protects `/cms/render/**.do` for *every* method and answers a
  tokenless call with a 302 to `/error.html`, which surfaces as a misleading
  "400 Unknown locale"), and **`Accept: application/json`** (Jahia only writes an
  `ActionResult`'s JSON body when the caller asks for JSON — otherwise the action still
  runs and still writes to the JCR, but returns 200 with an empty body).
- **Every report configuration must write all five properties.**
  `ConfigurationUtil.getSiteConfig()` reads `awStatsUrl`, `includeFilter` and
  `titleFromHTML` with `getProperty()` inside a `try` that swallows
  `PathNotFoundException`: one missing property and the configuration silently reads back
  as `null`.
- **`cy.contains()` matches substrings.** The rename test deliberately renames to
  `e2e-renamed-report`, not `e2e-settings-report-renamed`, or the "old name is gone"
  assertion could never fail.
- **`root` proves nothing about permissions.** It is the JCR system user and bypasses the
  access manager, so anything an ordinary user is meant to reach is also asserted as
  `mathias` (editor, password `password`, shipped by Digitall's `users.zip`).
- **Specs clear `/settings/top-pages` in `before()`** and delete what they created in
  `after()`, so any spec can be run on its own and an interrupted run cannot poison the
  next one. This matters more than usual here — see the second known defect below.

## Known defects the suite records

Two tests are named `KNOWN DEFECT`. They assert the *current, broken* behaviour so that
fixing the module makes them fail, which is the signal to turn them into positive
assertions. They are not an endorsement of the behaviour.

1. **The edit-mode "Update Top Pages" button cannot work on Jahia 8.2.**
   `jtopmix_topPages/html/topPages.jsp` calls `$.getJSON(updateActionUrl)` — a GET —
   while `UpdateTopPagesAction` inherits `requiredMethods = ["POST"]`. Measured: 405.
2. **One Top Pages node outside a page empties the whole administration listing.**
   `SiteconfigFlowHandler.getParentPage()` recurses upwards until it finds a `jnt:page`;
   content under `/sites/<site>/contents` has none, so it walks past the repository root
   and throws. `getAllNodes()` catches the exception and never populates the model, so
   *every* row disappears, not just the offending one.

## Known gap

The `jahiaSite` "Select report" choice list — `org.jahia.modules.ChoiceListInitializer` —
is **not covered**. A `ChoiceListInitializer` is only ever invoked by the Content Editor
form engine, and the platform image under test exposes no Content Editor forms API at all:
the root GraphQL `Query` type has no `forms` field, and jContent's own
`forms.editForm` / `forms.contentTypesAsTree` queries fail schema validation, so opening
any content in the editor shows "Something wrong happened". Installing
`org.jahia.modules/content-editor/LATEST` does not resolve against this platform either
(it requires `com.google.common.base` 30.x).

To close the gap, pin `JAHIA_IMAGE` to a build whose Content Editor works, then assert the
drop-down through the editor UI — `forms.fieldConstraints` needs `context: []` or Jahia's
`EditorFormServiceImpl` throws an NPE that surfaces as a bare "Internal Server Error".

## Reports

```bash
yarn report:merge   # merge per-spec mochawesome JSON into results/reports/report.json
yarn report:html    # render results/reports/report.html
```

Videos are kept only for failing specs.
