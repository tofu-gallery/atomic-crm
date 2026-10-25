# Atomic CRM on Tofu

**What it is.** A CRM for a small team: contacts, companies, a deals pipeline (a board with a column per stage),
tasks, notes with attachments, tags, a dashboard and a search over everything. It is marmelab's
[Atomic CRM](https://github.com/marmelab/atomic-crm): a React single-page app (react-admin's `ra-core` with
shadcn-admin-kit) built with Vite, which talks straight from the browser to the database's own services — Supabase
Auth for accounts, the Data API for the data, Storage for attachments and pictures.

**Upstream.** [marmelab/atomic-crm](https://github.com/marmelab/atomic-crm), branch `main`, at commit
`562b8b05e25f7b68b6f85e1e78f9d32c14400960` (2026-10-23). This fork's branch `main` follows upstream untouched; this
branch, `tofu`, holds Tofu's changes, each commit with its reason, and the tags `pin/<date>` mark the versions the
gallery copies.

## How Tofu runs it

- **Preset** `vite`, **root folder** the repository root, on Tofu's server hosting (it has a database). The pages
  are a finished build; nothing runs on a server per request.
- **Install** with npm from `package-lock.json` (checked here with `npm ci`; upstream's `prepare` script runs `husky`,
  which finds no `.git` and does nothing). **Build** `npm run build`, which is `tsc && vite build`. **Output** `dist`.
- **Database.** Tofu's managed database, created with the first deploy. For a Vite app Tofu writes
  `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` and `VITE_SUPABASE_ANON_KEY` (the public key); the app reads
  the URL and the publishable key (upstream's own name for the key, `VITE_SB_PUBLISHABLE_KEY`, still comes first when
  it is set). It reads none of the server-side names (`DATABASE_URL`, `SUPABASE_CA_CERT`).
- **Migrations.** Tofu applies `supabase/migrations` before each build (the build itself applies nothing): 32 files,
  upstream's 29 and three of Tofu's, in file-name order, each once, recorded in the Supabase CLI's own ledger. Every
  table they make has row-level security in the same file, and they grant the Data API's roles what the pages use
  themselves, so Supabase's change of 2026-10-30 (new tables closed to the Data API) changes nothing here.
  `supabase/schemas` is upstream's declarative copy of the same schema, which Tofu does not read.
- **Public settings.** None is needed; the gallery saves none. Optional, all upstream's but the first:
  - `VITE_MCP_SERVER` = `true` shows the address of upstream's MCP server (`<database>/functions/v1/mcp`) on the
    profile page. That server is an Edge Function, which Tofu does not deploy and this fork no longer carries, so leave
    it unset.
  - `VITE_ATTACHMENTS_BUCKET` names the Storage bucket for attachments and pictures (`attachments`, which the first
    migration makes).
  - `VITE_INBOUND_EMAIL`, `VITE_GOOGLE_WORKPLACE_DOMAIN`, `VITE_DISABLE_EMAIL_PASSWORD_AUTHENTICATION`: inbound email
    and single sign-on need an Edge Function and auth settings Tofu does not set up (below), so leave them unset.
- **Secrets.** None. Sessions are Supabase Auth's own, and the app needs no key of the owner's.

## Accounts and sign-up

- **The first account made in the app becomes its administrator.** A new copy opens on "Welcome to Atomic CRM —
  create the first user account". Until someone does, **anyone who opens the copy's address can make that account
  and become its administrator**, so the owner should open the copy and make theirs first, before sharing the
  address. Two ways to be sure nobody else takes it: keep the copy private on Tofu (its sharing set to people you
  choose) until your account exists, or add your own address from the app's People card in Tofu before anyone opens
  it — that account becomes the administrator, and you set its password with "Forgot password?" (which needs
  sign-in mail, below).
- **If someone else makes the first account, it cannot simply be undone.** The database makes the administrator the
  moment the account exists, before any confirmation, so even a sign-up with a made-up address takes the place, and
  after it the database refuses every new sign-up (below). That person can then read and change everything in the CRM.
  Tofu's People card cannot remove them: the CRM's user record points at the account with no rule for removing it
  (`sales.user_id` in upstream's first migration), so a removal there answers "blocked". The owner can still get in by
  adding their own address from the People card, but only as an ordinary user, who cannot disable anyone; making the
  owner the administrator again and shutting the other person out takes a change to the database that a coding agent
  makes (a migration that sets `administrator` on the owner's row and disables the other). So open a new copy before
  anyone else can.
- **After the first account, the database refuses every new account** except the ones an administrator adds on the
  app's Users page, the ones the owner adds from Tofu's People card, and single sign-on accounts the auth service's
  administrator set up. Upstream's pages already allowed only that, but its auth service accepted any sign-up sent to
  it directly, and every account can read and change all of the CRM's data. So there is no sign-up to close and no
  setting for it.
- **Adding a teammate.** Users → New user: a name, an address, whether they are an administrator, and an optional
  first password. With a password they sign in at once; without one the page asks the auth service to send them a
  password email, and they can always use "Forgot password?" on the sign-in page. Upstream emailed an invitation from
  an Edge Function instead.
- **The plan's number of people applies to the Users page too.** Each Tofu plan has room for a number of people in
  each app (5 on Free, 10 on Starter, 50 on Pro), and Tofu holds it wherever an account is made. The Users page makes
  its accounts in the database, where the auth service's check never sees them, so `tofu_add_sale` asks Tofu's own
  check (`tofu_hosting.before_user_created`, which Tofu writes into the database) before it makes a new account, and
  when the app is full the page shows the check's sentence ("This app is full: …") and adds nobody. Removing someone
  from the app's People card in Tofu, or a plan with more room, makes a place.
- **Disabling a user** (an administrator, on the Users page) bans their account in the auth service, so they cannot
  sign in until they are enabled again; a page they already have open keeps its sign-in for up to an hour.
- **Mail.** Password emails, and the confirmation of a new address where the database asks for one, need the app's
  sign-in set up in Tofu (the app's Sign-in page), which gives the auth service Tofu's sending address and this app's
  address. Before that, Supabase's built-in mailer sends only to its own organisation's addresses and a few messages an
  hour, so a password email is refused. On Tofu's own database backend new addresses are confirmed at once; on a
  Supabase Cloud database, where confirming a new address is on by default, the first account waits for its
  confirmation email.
- **Links in Tofu's emails** point at `<app>/auth/confirm?token_hash=…&type=…`. `public/auth/confirm/index.html`
  hands them to the app's `#/auth-confirm` page, which uses the link only when the person presses Continue (so a mail
  scanner that opens it spends nothing), then shows the set-password page for a password email, or signs the person in.
  Once a browser has opened the copy, upstream's service worker (the offline cache) answers every page address with the
  app's own page — which, served at `/auth/confirm`, looks for its scripts under `/auth/` and never gets past
  "Loading..." — so it leaves this one address to the hosting (`navigateFallbackDenylist` in `vite.config.ts`).
  `index.html` carries the same hand-off in a small script before the app's own, for a host that answers the address
  with the app's page.

## What we changed, and why

Tofu deploys no Supabase Edge Function for a copy. Upstream has six: `users`, `update_password` and `merge_contacts`,
which the pages call; `delete_note_attachments`, which database triggers call; `postmark` (inbound email) and `mcp`
(a server for AI assistants). The first four's work moved into the database and the browser, and all six were removed:

- `supabase/migrations/20261025210000_tofu_without_edge_functions.sql` (new):
  - `tofu_guard_new_account()`, a `before insert` trigger on `auth.users`: the sign-up rule above. It takes an
    advisory lock, so two first sign-ups at once cannot both become the administrator.
  - `tofu_add_sale(...)` (creating a user) and `tofu_update_sale(...)` (changing one): the rules of upstream's `users`
    function — only an administrator adds users, makes someone an administrator or disables them; anyone changes their
    own name, address, other addresses and picture; an address another user holds is refused with the code the pages
    already translate (`email_taken`, ...). An account is written the way the auth service's own admin create writes
    a confirmed one (the same columns as Tofu's own Add by email), with its email identity; names also go into the
    account's metadata, which upstream's `on_auth_user_updated` trigger copies back into `sales` on every change to the
    account, a sign-in included. Both are `SECURITY DEFINER` with an empty `search_path`, closed to `anon`.
  - `merge_contacts(...)`, which upstream's migrations already make, is granted to `authenticated` and closed to
    `anon`; the page calls it instead of the function of the same name.
  - Upstream's four note-attachment triggers and their two functions are dropped: they called
    `delete_note_attachments` through `pg_net`, and with no `pg_net` every note deletion would fail.
  - `get_user_id_by_email`, which only the `users` function used with the server key, is closed to the Data API roles.
- `supabase/migrations/20261025220000_tofu_add_sale_room_check.sql` (new): `tofu_add_sale` again, unchanged but for
  one step before it writes a new account — it takes the guard's lock and asks Tofu's check of the plan's number of
  people (`tofu_hosting.before_user_created(jsonb)`, only when Tofu has written it; Tofu writes it as `postgres`, the
  role these files run as, so the function may run it), and raises the check's own message when it answers with an
  error. A new file rather than a change to the one before, because Tofu applies each file once.
- `supabase/migrations/20261025220100_tofu_webmail_domains.sql` (new): the 102 webmail domains (gmail.com,
  outlook.com, yahoo.com, ...) of upstream's `supabase/seed.sql`, put into `favicons_excluded_domains` where they are
  not already there. Upstream's own production setup loads the seed (`supabase db push --include-seed` in
  `scripts/supabase-remote-init.mjs`); Tofu applies `supabase/migrations` only, and without the list every contact with
  such an address and no Gravatar picture would get its mail provider's logo as their picture.
- `supabase/migrations/20260128165057_sso_handling.sql`: its first line created the `pgjwt` extension, which nothing
  uses and newer Supabase databases no longer offer. `20260304104600_note_attachments_trigger.sql` and
  `20260309112831_fix_security_warnings.sql`: they no longer create `pg_net` (each file has a note at the point).
- `src/components/atomic-crm/providers/supabase/supabase.ts`, `dataProvider.ts` and `vite.config.ts`: the public key
  under Tofu's names; creating and changing users, password emails and merges call the database and the auth service
  directly; a note's files are removed from Storage by the page once the note is deleted or saved without them.
- `src/components/atomic-crm/sales/SalesCreate.tsx` and the English and French messages: the optional first password,
  and a success message that says how the new user signs in.
- `src/components/atomic-crm/login/AuthConfirmPage.tsx`, `public/auth/confirm/index.html`, `vite.config.ts` (the
  service worker leaves `/auth/confirm` to the hosting), `index.html` (the same hand-off, before the app's script),
  `root/CRM.tsx` (the route) and `authProvider.ts` (no sign-in check on it): the links in Tofu's emails.
- `settings/ProfilePage.tsx` and `settings/SettingsPageMobile.tsx`: the MCP server's address only with `VITE_MCP_SERVER`.
- `src/App.tsx`: upstream's CRM reports the address of every production copy to `atomic-crm-telemetry.marmelab.com`;
  a copy on Tofu passes the CRM's own `disableTelemetry`.
- `vite.config.ts`: the build no longer opens its bundle report in a browser.
- `supabase/functions` (removed), and their sections in `supabase/config.toml` and `config.e2e.toml`. Tofu would
  otherwise deploy them for an account its `appFunctions` switch admits, without the settings they read.
- `.env.development`, `.env.e2e`, `supabase/signing_keys.json` (removed): the local stack's publishable key,
  service-role token and private signing key, and upstream's own Postmark inbound address. `npx supabase status`
  prints a local stack's keys; upstream's end-to-end tests (`make` targets that copy `signing_keys.json`) need them
  put back.
- `.github/workflows` (removed): upstream's CI and deployment workflows.
- `doc/` (removed): upstream's documentation website, a separate Astro project a copy neither builds nor serves. One
  of its code samples (a widget that signs in with a password at `https://<instance_url>/auth/v1/token`) reads to
  Tofu's safety check as a page sending a password to another site, which stops a deploy. The documentation is at
  [marmelab.com/atomic-crm/doc](https://marmelab.com/atomic-crm/doc/).
- `README.md`: one line at the top naming this fork, and its Documentation section points at the published
  documentation instead of `doc/`.

## What works differently on Tofu

- **No MCP server and no inbound email.** Both were Edge Functions (`mcp`, `postmark`); the profile page shows
  neither.
- **No invitation email.** A new user gets a first password from the administrator, or a password email (above).
- **Note files.** Deleting a note, or saving it without an attachment, removes the file from Storage. A note deleted
  with its contact or deal (the database removes those notes itself) leaves its files in the bucket, where upstream's
  trigger removed them.
- **Merging contacts** runs the database's `merge_contacts`, which upstream's migrations ship beside its Edge
  Function. They differ in small ways: the database keeps the winner's picture whenever it has one, keeps an empty
  LinkedIn address over the other contact's, and keeps the earliest "first seen".
- Upstream behaviour kept: when a contact or company is saved without a picture, the database asks gravatar.com for
  one by a hash of the contact's address (the `http` extension) and otherwise uses the address's or website's domain
  icon from `favicon.show`, which the browser then loads — except for the webmail domains listed in
  `favicons_excluded_domains` (upstream's seed, here a migration, above), whose icon is nobody's picture. The
  `attachments` bucket is public: anyone with a file's link can open it, as upstream made it.
- `supabase/seed.sql` itself is never run on Tofu (Tofu applies `supabase/migrations` only); its one statement is the
  webmail list, which the migration above carries.

## Licence and caveats

- **MIT**, `LICENSE.md` (Copyright (c) 2024-present, Francois Zaninotto, Marmelab), kept as it is. A copy needs no
  source offer.
- "Atomic CRM", its name and logo (`public/logos/logo_atomic_crm.svg`, the favicon and app icons) are marmelab's.
  The Inter font comes from `@fontsource-variable/inter` (SIL Open Font License). The demo mode's sample pictures are
  loaded from marmelab's site and are not part of a copy's pages.
- `npm audit` was not run; `npm ci` installed 1,107 packages from upstream's lockfile, for which GitHub's Dependabot
  lists 8 alerts on this fork's `main` (4 high), not reviewed here.

## Verification

Run on 2026-10-25 on macOS, Node.js 22.22.3, npm 10.9.8, with nothing outward: no deployment, no Docker. Items 3
and 5 were run on the first version (`pin/2026-10-25`, `7e68426`). A review of it then found the confirm link stuck
behind the service worker, the Users page outside the plan's number of people and the seed's webmail list missing;
the other items were run on this version (the changes from `f66f955` on), where those fixes reach.

1. **The tree as Tofu deploys it**, for this version: `git archive` of `d34f880` and `tar -x`, then
   `find . -type f -exec chmod a-x {} +`. `npm ci`: 1,107 packages (husky: ".git can't be found"). `npm run build`
   with only Tofu's names set (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_ANON_KEY`) and
   `NODE_ENV=production`, the path upstream's `define` block takes: `tsc` passed, Vite built 61 files and the key was
   inlined; `dist/auth/confirm/index.html` is there, `dist/sw.js` registers its navigation fallback with
   `denylist: [/\/auth\/confirm(\/|\?|$)/]`, and `dist/index.html` carries the hand-off script.
2. **The migrations, the way Tofu applies them**, on PGlite 0.4.3 (PostgreSQL 17 in WebAssembly; this Mac's
   PostgreSQL 14 lacks the `security_invoker` views the schema uses) with a stand-in for a new Supabase project (an
   `auth` schema owned by `supabase_auth_admin` with `auth.users` and `auth.identities` in the auth service's own
   columns, `auth.uid()`; a `storage` schema; the `anon`, `authenticated` and `service_role` roles; `pgcrypto`,
   `citext` and `unaccent` in `extensions`; and a non-superuser owner of `public` standing in for `postgres`, with
   rights on the auth tables): each file in one transaction with its ledger row, as that owner. This version: all 32
   applied and a second run applied none (the first version: all 30, with and without Supabase's pre-2026-10-30
   default grants; this run with them). The one local change: the managed database has the `http` extension and
   PGlite does not, so its `create extension` line was replaced by a stand-in `http_get` answering 404. Tofu's own
   reader of these files (`scanMigration` and `revokesTableAccess` in `packages/api/src/app-migrations.ts`) took
   every one of the 32 as a single transaction that takes no table's access away.
3. **SQL as the auth service and the Data API's roles, first version** (31 checks, all passed): every table in `public`
   has row-level security; no `pg_net`, `pgjwt` or note-attachment trigger; the first sign-up became the administrator, a
   second was refused ("Sign-up is closed: ask an administrator of this CRM to add you.") and left no account; `anon`
   reads `init_state` and no contact, and cannot call `tofu_add_sale` or `get_user_id_by_email`; an administrator
   added Frank with a first password (confirmed account, email identity, bcrypt password the check verified); a
   taken address was refused with `email_taken`; Frank could not add users, make himself an administrator, change
   Mike or take Mike's address; his new name and other addresses survived the sign-in trigger; disabling him banned his
   account and enabling him lifted it; a new address moved his account, identity and CRM user; the statement Tofu's Add
   by email sends got through the guard; a contact Mike made was read back by Frank through `contacts_summary`; a note
   was deleted; `merge_contacts` through the Data API merged two contacts and their tasks; `global_search` answered.
4. **SQL, this version** (20 checks, all passed): every table in `public` has row-level security;
   `favicons_excluded_domains` holds the seed's 102 domains, once each, and on a database the seed was loaded into the
   new file adds none twice; `get_domain_favicon` answers nothing for `gmail.com` and `outlook.com` and
   `https://favicon.show/trytofu.ai` for `trytofu.ai`, and a contact saved with a `gmail.com` address gets no picture
   while one at `trytofu.ai` gets that icon; the first sign-up became the administrator; with no `tofu_hosting` in the
   database an administrator adds a user as before. Then Tofu's check, written by Tofu's own statement
   (`appPeopleCapInstallSql` in `packages/orchestrate/src/app-users.ts`, run as the stand-in `postgres`): the Data
   API's roles cannot run it themselves; with room for 5 the administrator added a third person; with room for 2,
   `tofu_add_sale` refused a fourth with the check's sentence ("This app is full: …", hint `app_full`) and left no
   account and no CRM user, as the auth service's own call of the check answered 403; an account already there without
   its CRM user was still added (no new account); with room for 5 again the add went through, a confirmed account with
   one email identity and a password that verifies, not an administrator; a sign-up sent straight to the auth service
   is still refused; a non-administrator still cannot add users; contacts read back through `contacts_summary`.
5. **The built app in headless Chromium, first version** (Playwright 1.64, `--use-mock-keychain --use-angle=swiftshader
   --enable-unsafe-swiftshader`, service workers off) against 127.0.0.1 only: `dist` served the way static hosting
   serves it (files and a folder's `index.html`; `/` and `/auth/confirm` answered 200), and the page's auth-service
   and Data API calls answered by a local stand-in over the same PGlite database, each query run as the role
   the real service uses with the person's claims, so the database's grants, policies and triggers decided every
   answer (13 checks, all passed): a new copy opened on the first-user page; Mike made the first account and was signed
   in as the administrator; a contact made in the page was stored and listed again; a sign-up sent straight to the auth
   service was refused; the Users page added Frank with a first password; Frank signed in with it, saw the contacts and
   was sent to access-denied from the user form; a password-email link in Tofu's shape (`/auth/confirm?token_hash=…&type=recovery`)
   reached `#/auth-confirm`, and Continue led to the set-password page, which set his new password. No page error, no
   request outside 127.0.0.1, no Edge Function call.
6. **The confirm link with the service worker on**, this version, in the same browser against 127.0.0.1 only, with a
   stand-in auth service answering the link's one call: `dist` served three ways — a folder's `index.html` at
   `/auth/confirm`, a 301 from `/auth/confirm` to `/auth/confirm/`, and a host that answers every address with
   `index.html` — and for each, a fresh browser and one that had opened the copy first, with the service worker
   installed and in control. All six reached `#/auth-confirm` ("Confirm it's you"), and Continue led to the
   set-password form; with the service worker in control, the `/auth/confirm` document came from the network, not the
   worker. A control copy of the same build with the denylist and the hand-off script taken out reproduced the review's
   finding: the worker answered the link with its cached `index.html`, which stayed on "Loading...". No request left
   127.0.0.1; the one page error was the catch-all host's, which answers the page's `/auth/assets/…` script with HTML
   before the hand-off moves on.
7. **Tofu's own checks** on the pushed branch at `d34f880`: the gallery's shelf check (Tofu's GitHub import, the
   static lane's predicates and the safety check) said `safety ok (4 findings)` and 488 of 500 published files (731
   files), not on the static lane (a Vite app with an environment file, on server hosting anyway for its database).
   Before `doc/` was left out it said `SAFETY BLOCKS tripwire:credential-form-off-origin`. The four findings are
   medium and block nothing: `site_url` and a redirect address on `localhost` in upstream's local Supabase configs and
   a test, and upstream's `public/auth-callback.html` putting the sign-in token into the app's own `#/auth-callback`
   address on the same site.
8. **Pictures** for the gallery at 1200×750 (twice the pixels), light theme, in the same browser: the deals board,
   Frank's contact page and the companies list, with the sample content of a two-person design studio — Mike, its
   account manager, and Frank, who owns a bakery, at hello@trytofu.ai, with clients named by their trade alone. They
   were taken with the app's own in-browser data provider (`createDataProvider` in `providers/fakerest`, which
   upstream's demo uses) holding that content, through a local entry that is not part of this fork: the same pages a
   copy shows, with no database behind them.

## What only a real deploy can verify

- Tofu applying these files to a real managed database: the `http`, `citext` and `unaccent` extensions there, the
  `attachments` bucket and the Storage policies the first file writes as `postgres`, and Tofu's own grants pass.
- The real auth service and Data API (here a local stand-in), Storage uploads of attachments and pictures (not run),
  and the bcrypt passwords `tofu_add_sale` writes being accepted by the auth service.
- Password and confirmation emails once the app's sign-in is set up in Tofu, and the hosting serving
  `/auth/confirm` from `auth/confirm/index.html` (checked here with three kinds of local static server, the service
  worker on and off).
- Tofu's people check in a real copy's database, written by Tofu, and `tofu_add_sale` running it there as `postgres`.
