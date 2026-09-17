# Codebase guide

Start here when you want to understand or change the application. For installation and checks, see [Contributing](../CONTRIBUTING.md).

This is a Bun workspace monorepo coordinated by Turborepo.

| Workspace | Responsibility |
| --- | --- |
| `apps/web` (`@overprint/web`) | Nuxt editor, upload relay, browser/server/runtime tests |
| `packages/kicad` (`@overprint/kicad`) | Python exporter and sync plugin, PCM packaging, native tests |
| `scripts` | Repository-wide source-release packaging |
| `docs` | User and contributor documentation |

Run commands from the repository root. Bun installs one dependency graph using
`bun.lock`; Turbo builds the KiCad ZIP before the web app copies it into its
public downloads. `bun dev` starts the editor; `bun start` builds and launches
the standalone app. `bun run build:cloudflare` prepares the Pages artifact at
`apps/web/.output/cloudflare` (it serializes the standalone build first to avoid
concurrent Nuxt writes). Build results are cached locally in `.turbo`; browser,
server, native and runtime tests always execute.

`bun run test:kicad` uses KiCad's bundled Python on macOS. On other installations,
set `KICAD_PYTHON` to a Python executable with KiCad's `pcbnew` and `wx` modules.
`bun run prepare:plugin` builds the downloadable plugin alone. Use
`bun run --cwd apps/web <script>` for web-only commands after dependencies have
been built, or `bunx turbo run <task> --filter=@overprint/web` to include the task
prerequisites.

### Pages and layouts

`app.vue` installs the global theme/language behavior and renders
`<NuxtLayout><NuxtPage /></NuxtLayout>`. Ordinary pages use `layouts/default.vue`
for content width, back navigation, theme control and footer. They supply their
own page content; the layout owns the `<main>` landmark.

The editor page explicitly renders `layouts/editor.vue` with `layout: false`
in its page metadata to avoid a second outer layout. This keeps drag/drop handlers
on the editor shell connected directly to the page's import dialog. The layout
owns canvas background, viewport sizing and footer; the page supplies its header,
main editor/welcome view and dialogs. It also remains the single owner of project
storage lifecycle effects.

`ProjectMenu`, `ProjectFilePicker` and `ProjectStatusNotice` encapsulate their own
controls and emit actions to the page. Layouts do not import boards, save projects
or start sync. Theme and language setup run once in `app.vue` across navigation.

### Web components

`apps/web/app/components/` is grouped by responsibility:

- `editor/`: editor composition, inspector shell, toolbar, header/footer and welcome actions.
- `board/`: board rendering, native silkscreen, assembled preview, view/zoom controls
  and board properties.
- `artwork/`: placed graphics, layers, transform handles and alignment.
- `paint/`: Live Paint interaction and controls.
- `color/`: reusable palette and spectrum pickers.
- `kicad/`: board import, sync and KiCad layer controls.
- `export/`: JLCPCB export dialog and illustrated instructions.
- `shared/`: branding and theme controls.

Nuxt scans these folders recursively with `pathPrefix: false`. Use components
by filename (`<ArtworkLayers />`), without manual imports or folder prefixes.
Keep component filenames unique across these folders.

Vue files use Prettier with one attribute per line, a 100-column print width,
single quotes and no semicolons. Run `bun run format` to format the web app's
components, pages and layouts; `bun run format:check` verifies them without
editing. Formatting intentionally covers Vue files only for now.

Keep repeated controls and substantial panel sections in focused components,
give event handlers meaningful names, and keep templates focused on rendering.
Long SVG path data and Tailwind class values may remain on one line; their
attributes and surrounding elements are expanded for readability.

### Web composables

`apps/web/app/composables/` groups reactive state and behavior by responsibility:

- `project/`: composition state, project saving/restoring and KiCad sync.
- `artwork/`: artwork state, layer dragging, Live Paint and native silkscreen edits.
- `canvas/`: canvas tools and assembled 3D preview controls.
- `theme/`: theme preference and application-level theme listeners.

The top-level `index.ts` explicitly re-exports the public composables for Nuxt's
auto-import scanner. Add new public composables there; callers keep using names
such as `useArtwork()` without manual imports. Install `useProjectStorage()` and
`useThemeRuntime()` once at their existing page/application roots because they
register lifecycle listeners; consumers use the shared state composables.

### UI text and translations

The web app uses `@nuxtjs/i18n`, with English as its only shipping locale and
unprefixed URLs. Feature catalogs live in `apps/web/i18n/locales/en/`:
`common.json`, `editor.json`, `kicad.json` and `export.json`. Each file owns its
matching top-level namespace. Use meaningful keys such as
`$t('common.importPcb')` in templates or `useI18n().t` inside setup/composables.
Keep translated expressions reactive when they depend on a changing locale.

`apps/web/i18n/schema.ts` derives the message shape and leaf keys from English;
`app/types/i18n.d.ts` supplies that schema to Vue I18n for editor completion.
Typed UI data uses `MessageKey`, and `tests/nuxt/i18n.types.ts` checks that unknown
keys and incomplete catalogs are rejected. Run `bun run typecheck` after edits.
Vue I18n also permits dynamic string keys, so completion alone does not validate
every translation call. Our typecheck command also validates literal `$t()`/`t()`
and `<i18n-t>` references against the English catalogs. Use the `MessageKey` type
for dynamic keys in application data.

Keep step order, action identifiers and links in application code. For example,
`app/utils/kicadSetup.ts` holds typed step definitions while the catalog holds
only their wording. Use named placeholders for variable text and `<i18n-t>` slots
for links, rather than HTML in messages or concatenating translated fragments.

To add a language, create its feature catalogs and a locale loader that assembles
those namespaces with `satisfies MessageSchema`; then register the locale's file
in `nuxt.config.ts`. That makes missing messages a compile error. Include any new
English namespace in both the schema and locale configuration. A language
selector and detection policy should be introduced alongside the first additional
language, rather than showing an English-only selector now.

Migration is incremental: welcome, menus/header/footer, canvas tool labels, theme
controls and KiCad setup/import text are migrated. Inspector, artwork/Live Paint,
JLCPCB dialog, sync messages, autosave and parser/transport diagnostics still need
migration. User-authored layer names, artwork and protocol values are not UI
translations.
