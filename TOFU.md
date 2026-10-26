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

- **Preset** `vite`, **root folder** the repository root, on Tofu's server hosting, which the Free plan includes too.
  Free hosting's own Vite build takes a `vite.config.ts` with the React or Vue plugin, `server`, `resolve.alias` and
  `build.outDir` only, and this one has more (Tailwind's plugin, the service worker, the HTML plugin, the bundle
  report, `define`), so on the Free plan, as on a paid one, Tofu builds the copy on its server hosting. The pages
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
  and become its administrator**, so the owner makes theirs first, before sharing the address, in this order:
  1. **Turn on sign-in in Tofu first**: on the app's Sign-in page, press "Turn on Google sign-in". Besides Google,
     it gives the copy's auth service Tofu's sending address and the copy's own address, which every email the copy
     sends needs (Mail, below). Tofu cannot do this by itself for a new copy (below).
  2. **Then open the copy and make your account at once.** On a Supabase Cloud database, where confirming a new
     address is on by default, the account then waits for its confirmation email: open the link in it to sign in.
     On Tofu's own database backend, addresses are confirmed at once and you are signed in straight away.

  Done the other way round on a Supabase Cloud database, the sign-up is refused and makes no account, and the page
  says "This app can't send email yet, so it can't make your account. Turn on sign-in on the app's Sign-in page in
  Tofu, then try again." Two ways to be sure nobody else takes the first account: keep the copy private on Tofu (its
  sharing set to people you choose) until your account exists, or add your own address from the app's People card
  in Tofu before anyone opens it — that account becomes the administrator, and you set its password with "Forgot
  password?", which needs step 1 too.
- **If someone else makes the first account, it cannot simply be undone.** The database makes the administrator the
  moment the account exists, before any confirmation, so even a sign-up with a made-up address takes the place, and
  after it the database refuses every new sign-up (below). That person can then read and change everything in the CRM.
  Tofu's People card cannot remove them: the CRM's user record points at the account with no rule for removing it
  (`sales.user_id` in upstream's first migration), so a removal there answers "blocked". The owner can still get in by
  adding their own address from the People card, but only as an ordinary user, who cannot disable anyone; making the
  owner the administrator again and shutting the other person out takes a change to the database that a coding agent
  makes (a migration that sets `administrator` on the owner's row and disables the other). So turn on sign-in and
  make your account in a new copy before anyone else can.
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
- **Mail.** Every email the copy sends needs the app's sign-in turned on in Tofu (step 1 above), which gives the
  auth service Tofu's sending address and this app's address: password emails ("Forgot password?", the profile
  page's password change, a user added on the Users page without a first password) and, on a Supabase Cloud
  database, the confirmation of every new account, the first one included. Tofu does not turn it on by itself for a
  new copy: the copy's first deploy creates its database before any version of the copy is published, so when the
  database is ready Tofu's sign-in setup finds no address to write and skips, and after that only the owner's "Turn
  on Google sign-in" writes it. Until then, on a Supabase Cloud database, the auth service's built-in mailer refuses
  every address outside Supabase's own team (`email_address_not_authorized`), so a sign-up is refused and makes no
  account (the auth service sends the confirmation inside the sign-up itself), and a password email is refused. The
  sign-up page and the "Forgot password?" page then say that the app can't send email yet and to turn on sign-in on
  the app's Sign-in page in Tofu, in place of the auth service's own words (also for its "Error sending
  confirmation email" and "Error sending recovery email"). On Tofu's own database backend new addresses are
  confirmed at once, so the first account needs no email.
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
- `login/SignupPage.tsx`, `src/components/supabase/forgot-password-page.tsx`, `login/emailNotReady.ts` (new) and the
  English and French messages: when the auth service cannot send email yet (`email_address_not_authorized`, or
  "Error sending confirmation email" / "Error sending recovery email"), the sign-up and "Forgot password?" pages say
  that the app can't send email yet and to turn on sign-in on the app's Sign-in page in Tofu, and the message stays
  until it is closed; upstream showed the auth service's own words for a moment. `signUp` in `dataProvider.ts` keeps
  the auth service's error code and status for it.
- `settings/ProfilePage.tsx` and `settings/SettingsPageMobile.tsx`: the MCP server's address only with `VITE_MCP_SERVER`.
- `src/App.tsx`: upstream's CRM reports the address of every production copy to `atomic-crm-telemetry.marmelab.com`;
  a copy on Tofu passes the CRM's own `disableTelemetry`.
- `vite.config.ts`: the build no longer opens its bundle report in a browser.
- `supabase/functions` (removed), and their sections in `supabase/config.toml` and `config.e2e.toml`. Tofu would
  otherwise deploy them for an account its `appFunctions` switch admits, without the settings they read.
- `.env.development`, `.env.e2e` and `.npmrc` (removed). On the Free plan Tofu refuses to build an upload that holds
  an environment file or an `.npmrc`, and that refusal is not one the Free plan's server hosting takes instead, so
  with them a Free-plan copy could never go online, and its owner could not remove them. (The versions before kept
  the two `.env` files with upstream's committed values emptied: the local stack's publishable key in both, its
  service-role token in `.env.e2e`, upstream's own Postmark inbound address in `.env.development`.) Nothing a copy
  builds or runs reads them: a production build reads `.env`, `.env.local` and `.env.production` only, the app falls
  back to the `attachments` bucket and to no demo without them, and the address and public key come from the settings
  Tofu writes. `.npmrc` held only `min-release-age=1` (npm then picks no version published less than a day ago),
  which changes nothing for an install from `package-lock.json`; `AGENTS.md`'s line about it now says this fork has
  none, and to pass `--min-release-age=1` when adding or upgrading a dependency. Upstream's local development
  (`npm run dev` reads `.env.development`) and end-to-end tests (`--mode e2e` and `playwright.config.ts` read
  `.env.e2e`) need the two files back: take them from this fork's `main`, which is upstream's.
- `supabase/signing_keys.json` (removed): the local stack's private signing key. `supabase/functions/.env` went with
  `supabase/functions` (above): the functions' local Postmark webhook settings and keys. `npx supabase status` prints
  a local stack's keys; upstream's end-to-end tests (`make` targets that copy `signing_keys.json`) need them put back.
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

## Start-up when several starts run at once

There is nothing to lock: a copy has no server process of its own. Its pages are files, and its schema is made by Tofu
applying `supabase/migrations` before each build (above), never by a start, so hosting that starts several instances
at once runs no schema work. Every table those files make in `public` has row-level security on, with the policies
and grants the pages use (Migrations, above; Verification, items 3 to 5).

## Licence and caveats

- **MIT**, `LICENSE.md` (Copyright (c) 2024-present, Francois Zaninotto, Marmelab), kept as it is. A copy needs no
  source offer.
- "Atomic CRM", its name and logo (`public/logos/logo_atomic_crm.svg`, the favicon and app icons) are marmelab's.
  The Inter font comes from `@fontsource-variable/inter` (SIL Open Font License). The demo mode's sample pictures are
  loaded from marmelab's site and are not part of a copy's pages.
- `npm audit` was not run; `npm ci` installed 1,107 packages from upstream's lockfile, for which GitHub's Dependabot
  lists 8 alerts on this fork's `main` (4 high), not reviewed here.

## Verification

Run on 2026-10-25 and, for this version, 2026-10-26 (UTC) on macOS, Node.js 22.22.3, npm 10.9.8, with nothing
outward: no deployment, no Docker. Four versions were checked. Items 4 and 6 ran on the first (`pin/2026-10-25`,
`7e68426`); a review then found the confirm link stuck behind the service worker, the Users page outside the plan's
number of people and the seed's webmail list missing, and items 3, 5, 7 and 9 ran on the second
(`pin/2026-10-25.1`, the code of `d34f880`), which fixed those. A review of that one found the first account refused
on a Supabase Cloud database before the app's sign-in is turned on, with words an owner cannot act on; item 2 ran on
the third (`pin/2026-10-25.2`, the code of `f13379d`), which changed only the sign-up and "Forgot password?" pages
(with their messages and `signUp`) and this file, and nothing the other items test: no migration, no service worker,
no Users page. A review of the third found that Tofu's Free build refuses its `.env.development`, `.env.e2e` and
`.npmrc`; items 1 and 8, and items 3 and 5 again, ran on this version (the code of `40fa742`), with item 10, which is
new. This version removes those three files and changes one line of `AGENTS.md` and this file, nothing else.

1. **The tree as Tofu deploys it**, for this version: `git archive` of `40fa742` and `tar -x`, then
   `find . -type f -exec chmod a-x {} +` (729 files, none executable, with no `.npmrc` and no `.env` file). `npm ci`:
   1,107 packages (husky: ".git can't be found"). `npm run build` with only Tofu's names set (`VITE_SUPABASE_URL`,
   `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_ANON_KEY`) and `NODE_ENV=production`, the path upstream's `define`
   block takes: `tsc` passed, Vite built 61 files and the key was inlined; the Storage bucket came out as
   `attachments`, the app's own default; `dist/auth/confirm/index.html` is there, `dist/sw.js` registers its
   navigation fallback with `denylist: [/\/auth\/confirm(\/|\?|$)/]`, and `dist/index.html` carries the hand-off
   script. Then the same build in the same tree with the third version's `.env.development`, `.env.e2e` and `.npmrc`
   put back: 60 of the 61 files came out the same byte for byte (SHA-256), and the one that did not, `sw.js.map`,
   differs only in the name of the random temporary folder Workbox builds the service worker in, which changes on every
   build. So the three files changed nothing a copy serves. `npm run typecheck` (the app's own `tsc` project, which the
   build's `tsc` does not check) reports one error, there since the first version and in no file this version changed:
   the demo data provider's `mergeContacts` (`providers/fakerest/dataProvider.ts`) answers nothing, where the Supabase
   one now answers `{ success, winnerId }`. The pages never read that answer.
2. **The sign-up and "Forgot password?" pages before the app's sign-in is turned on**, third version, in headless
   Chromium (Playwright 1.64, `--use-mock-keychain --use-angle=swiftshader --enable-unsafe-swiftshader`, service
   workers off) against 127.0.0.1 only: the third version's build, made as item 1 describes, served as a folder of
   files, and a stand-in auth service answering the way GoTrue's source writes its errors (`internal/api/errors.go`,
   `mail.go`) — for a page that sends
   `X-Supabase-Api-Version: 2024-01-01`, as supabase-js does, `{ code, message }` with the version header echoed —
   and an empty CRM (`init_state` 0). 12 checks, all passed. The sign-up page, given Supabase Cloud's refusal
   (400 `email_address_not_authorized`, `Email address "…" cannot be used as it is not authorized`), showed "This app
   can't send email yet, so it can't make your account. Turn on sign-in on the app's Sign-in page in Tofu, then try
   again." as an error that was still on screen 6.5 seconds later, and stayed on the sign-up page: with the version
   header readable by the page, with it hidden from the page by CORS (supabase-js then hands the page no code, only
   the message and the status 400) and in the pre-2024 shape (`error_code`, `msg`); and for a 500 "Error sending
   confirmation email". In French (`fr-FR`), the French sentence. A weak-password refusal still showed the auth
   service's own words ("Password should be at least 12 characters.") as before, and a sign-up the auth service
   accepted with confirmation pending went on to "Please follow the link we just sent you by email to confirm your
   account." The "Forgot password?" page showed its own sentence ("… so it can't send you a password email. …") for
   the same refusals (version header readable and hidden, and a 500 "Error sending recovery email"), and in French;
   an accepted request still went on to the sign-in page with `passwordRecoveryEmailSent=1`. No page error, no
   request outside 127.0.0.1, no Edge Function call. A control build of `pin/2026-10-25.1` against the same stand-in
   reproduced the review's finding: the sign-up page showed `Email address "…" cannot be used as it is not
   authorized` (in English on a French browser too) and "Error sending confirmation email" as a passing note, gone
   within 6.5 seconds; the "Forgot password?" page did the same with its refusals.
3. **The migrations, the way Tofu applies them**, on PGlite 0.4.3 (PostgreSQL 17 in WebAssembly; this Mac's
   PostgreSQL 14 lacks the `security_invoker` views the schema uses) with a stand-in for a new Supabase project (an
   `auth` schema owned by `supabase_auth_admin` with `auth.users` and `auth.identities` in the auth service's own
   columns, `auth.uid()`; a `storage` schema; the `anon`, `authenticated` and `service_role` roles; `pgcrypto`,
   `citext` and `unaccent` in `extensions`; and a non-superuser owner of `public` standing in for `postgres`, with
   rights on the auth tables): each file in one transaction with its ledger row, as that owner. The second version
   (`d34f880`), and again this version, which changes no migration: all 32 applied and a second run applied none (the
   first version: all 30, with and without Supabase's pre-2026-10-30 default grants; these two runs with them). The
   one local change: the managed database has the `http` extension and PGlite does not, so its `create extension`
   line was replaced by a stand-in `http_get` answering 404. Tofu's own reader of these files (`scanMigration` and
   `revokesTableAccess` in `packages/api/src/app-migrations.ts`) took every one of the 32 as a single transaction
   that takes no table's access away (second version).
4. **SQL as the auth service and the Data API's roles, first version** (31 checks, all passed): every table in `public`
   has row-level security; no `pg_net`, `pgjwt` or note-attachment trigger; the first sign-up became the administrator, a
   second was refused ("Sign-up is closed: ask an administrator of this CRM to add you.") and left no account; `anon`
   reads `init_state` and no contact, and cannot call `tofu_add_sale` or `get_user_id_by_email`; an administrator
   added Frank with a first password (confirmed account, email identity, bcrypt password the check verified); a
   taken address was refused with `email_taken`; Frank could not add users, make himself an administrator, change
   Mike or take Mike's address; his new name and other addresses survived the sign-in trigger; disabling him banned his
   account and enabling him lifted it; a new address moved his account, identity and CRM user; the statement Tofu's Add
   by email sends got through the guard; a contact Mike made was read back by Frank through `contacts_summary`; a note
   was deleted; `merge_contacts` through the Data API merged two contacts and their tasks; `global_search` answered.
5. **SQL, second version, and again this version** (20 checks, all passed both times): every table in `public` has
   row-level security; `favicons_excluded_domains` holds the seed's 102 domains, once each, and on a database the
   seed was loaded into the new file adds none twice; `get_domain_favicon` answers nothing for `gmail.com` and `outlook.com` and
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
6. **The built app in headless Chromium, first version** (Playwright 1.64, `--use-mock-keychain --use-angle=swiftshader
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
7. **The confirm link with the service worker on**, second version, in the same browser against 127.0.0.1 only, with a
   stand-in auth service answering the link's one call: `dist` served three ways — a folder's `index.html` at
   `/auth/confirm`, a 301 from `/auth/confirm` to `/auth/confirm/`, and a host that answers every address with
   `index.html` — and for each, a fresh browser and one that had opened the copy first, with the service worker
   installed and in control. All six reached `#/auth-confirm` ("Confirm it's you"), and Continue led to the
   set-password form; with the service worker in control, the `/auth/confirm` document came from the network, not the
   worker. A control copy of the same build with the denylist and the hand-off script taken out reproduced the review's
   finding: the worker answered the link with its cached `index.html`, which stayed on "Loading...". No request left
   127.0.0.1; the one page error was the catch-all host's, which answers the page's `/auth/assets/…` script with HTML
   before the hand-off moves on.
8. **Tofu's own checks** on the pushed branch at `40fa742`, this version: the gallery's shelf check (Tofu's GitHub
   import, the static lane's predicates and the safety check) said `safety ok (4 findings)` and 489 of 500 published
   files (729 files), not on the static lane, its build refused as `unsupported_vite_config`: Free hosting's sentence
   for it is the build kind ("… a Vite app whose `vite.config.ts` uses settings Free hosting's build doesn't accept
   …"), which the Free plan's server hosting takes instead, and Tofu's own `freeServerRoutable` answered yes for the
   same files under the `vite` preset (run on a `git archive` of `40fa742` through Tofu's GitHub import). The static
   builder's own rule on each file and Tofu's credential rule (`credentialPathReason`) named no file. On the third
   version (its pin, `ec27bf3`: 732 files, 489 published) the build was refused as `unsafe_source_path`, with the
   sentence for an environment file ("… whose upload holds `.env.development`, an environment file, which Free
   hosting's build won't read …"), which the Free plan's server hosting does not take, and `freeServerRoutable`
   answered no.
   Before `doc/` was left out it said `SAFETY BLOCKS tripwire:credential-form-off-origin`. The four findings are
   medium and block nothing: `site_url` and a redirect address on `localhost` in upstream's local Supabase configs and
   a test, and upstream's `public/auth-callback.html` putting the sign-in token into the app's own `#/auth-callback`
   address on the same site.
9. **Pictures**, second version (the versions after it change none of their pages), for the gallery at 1200×750
   (twice the pixels), light theme, in the same browser: the deals board, Frank's contact page and the companies list,
   with the sample content of a two-person design studio — Mike, its account manager, and Frank, who owns a bakery, at
   hello@trytofu.ai, with clients named by their trade alone. They were taken with the app's own in-browser data
   provider (`createDataProvider` in `providers/fakerest`, which upstream's demo uses) holding that content, through a
   local entry that is not part of this fork: the same pages a copy shows, with no database behind them.
10. **The built app in headless Chromium, this version**, in the same browser (service workers off) against 127.0.0.1
    only: the build of item 1, made without the three files, served as a folder of files (`/` and
    `/auth/confirm/?token_hash=…&type=recovery` answered 200), with item 2's stand-in auth service and an empty CRM
    (3 checks, all passed): the address answered 200, a new copy opened on the first-user page ("Create the first
    user account to complete the setup."), and a first sign-up the stand-in accepted with confirmation pending went on
    to `#/sign-up/confirm`. No page error, no request outside 127.0.0.1.

## What only a real deploy can verify

- A Free-plan copy going online on Tofu's server hosting: here Tofu's own routing predicates on the branch's files
  (item 8), not a deploy.
- Tofu applying these files to a real managed database: the `http`, `citext` and `unaccent` extensions there, the
  `attachments` bucket and the Storage policies the first file writes as `postgres`, and Tofu's own grants pass.
- The real auth service and Data API (here a local stand-in), Storage uploads of attachments and pictures (not run),
  and the bcrypt passwords `tofu_add_sale` writes being accepted by the auth service.
- Password and confirmation emails once the app's sign-in is turned on in Tofu, and the hosting serving
  `/auth/confirm` from `auth/confirm/index.html` (checked here with three kinds of local static server, the service
  worker on and off).
- A real Supabase Cloud database refusing the first sign-up before sign-in is turned on: the refusal's shape (here a
  stand-in written from GoTrue's source and Supabase's documentation), whether the hosted auth service lets the page
  read its API version header (the page recognises the refusal either way), and that the refused sign-up leaves no
  account (GoTrue sends the confirmation inside the sign-up's own transaction; not run live). Then, after "Turn on
  Google sign-in", the first account's confirmation email arriving and its link signing the owner in.
- Tofu's people check in a real copy's database, written by Tofu, and `tofu_add_sale` running it there as `postgres`.
