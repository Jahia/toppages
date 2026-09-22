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
source set-env.sh          # REQUIRED, and again in every new terminal
./ci.startup.sh notests    # boot jahia + awstats WITHOUT running the specs
./env.run.sh               # provision the environment and run the suite headless once
yarn run e2e:debug         # interactive runner (yarn e2e:ci for headless)
```

`baseUrl` is `http://localhost:8080`; the Jahia JPDA debug port is `8000`.

`ci.startup.sh` forwards `"$@"` to the upstream CLI, which is what makes `notests` work:
the CLI branches on `if [[ "$1" != "notests" ]]`, so a wrapper that swallows its arguments
boots the stack *and* runs the suite anyway, with no warning. The sibling harnesses this
one was copied from still have that bug.

## The specs

| Spec                  | Covers                                                                              |
|-----------------------|-------------------------------------------------------------------------------------|
| `01-serverSettings`   | The webflow at *Administration → Server → Configuration → Top Pages*: create, validate, list, edit, rename, reject duplicates, delete — each verified in the UI *and* under `/settings/top-pages` |
| `02-topPagesActions`  | `updateTopPages` / `getTopPages`: report parsing and ranking, `jsonResult` caching, multi-month aggregation, `titleFromHTML`, global-config inheritance, the unreachable-report error path, the admin node listing *including a node that lives outside any page*, the live/anonymous path, the POST-only guard on `updateTopPages` and its refusal of an anonymous caller |
| `03-editorExperience` | The component's visibility and type label in jContent, asserted as `root` **and** as the editor `mathias` |
| `04-permissions`      | Who may open the server-settings page, with an administrator positive control       |
| `05-componentView`    | The component's own view (`jtopmix_topPages/html/topPages.jsp`) rendered in a page: the edit-mode button, the POST it fires and the list the script builds, the `customCSS` class actually being applied, the escaping of a stored title in edit mode **and for an anonymous live visitor**, and the live/anonymous rendering |

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
- **Edit mode does not stay on the url you asked for.** Visiting `/cms/edit/default/<lang>/<page>.html`
  sends the browser on to `/jahia/jcontent/<site>/<lang>/pages/...`, which renders the page in an
  iframe. Anything asserted about a view in edit mode has to reach into
  `iframe[data-sel-role="page-builder-frame-active"]` -- at the top level the selectors simply never
  resolve, and the failure reads as "element not found", not as "you are on another page".
- **Saving a `jtopmix:topPages` node already fills `jsonResult`.** The module's Drools rule fires on
  save, so a freshly created node renders its list before anyone presses "Update Top Pages". A test
  of the button has to overwrite `jsonResult` with a sentinel first, or it asserts nothing.
- **`cy.contains()` matches substrings.** The rename test deliberately renames to
  `e2e-renamed-report`, not `e2e-settings-report-renamed`, or the "old name is gone"
  assertion could never fail.
- **`root` proves nothing about permissions.** It is the JCR system user and bypasses the
  access manager, so anything an ordinary user is meant to reach is also asserted as
  `mathias` (editor, password `password`, shipped by Digitall's `users.zip`).
- **Specs clear `/settings/top-pages` in `before()`** and delete what they created in
  `after()`, so any spec can be run on its own and an interrupted run cannot poison the
  next one.
- **A `"><img …>` payload cannot prove the escaping of this view.** Every stored value the
  view carries — `jcr:title`, `jsonResult`, `lastErrorReceived` — used to be interpolated
  *inside* a `<script>` block, where that payload is inert text and a probe using it
  reports the sink as safe. An HTML parser ends a `<script>` element at the first
  `</script>` whatever the JavaScript quoting around it, so the XSS regression tests use a
  script-breaking payload (`</script><img src=x onerror=…>`) and assert on the raw
  response as well as on the parsed DOM. The `jcr:title` carrier reaches **any anonymous
  visitor** on an ordinary live page; only `lastErrorReceived` is administrator-only,
  because the JSP keeps it inside `<c:if test="${renderContext.editMode}">`.

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
