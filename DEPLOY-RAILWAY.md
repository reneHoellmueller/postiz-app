# Postiz auf Railway (ohne Temporal)

Dieser Fork startet nur noch **eine App** (Backend + Frontend hinter Nginx) plus **Postgres**. Temporal, `temporal-postgresql` und Elasticsearch werden nicht mehr gebraucht. Redis ist optional.

`TEMPORAL_ADDRESS` darf stehen bleiben, wird ignoriert.

## Services, die danach gelöscht werden können

Nach einem erfolgreichen Deploy aus diesem Repo (Health-Check und ein Test-Post):

1. **temporal**
2. **temporal-postgresql**
3. **temporal-elasticsearch** (falls vorhanden)
4. **temporal-ui** / **temporal-admin-tools** (falls vorhanden)
5. **postiz-redis** — nur wenn `REDIS_URL` in der App nicht gesetzt ist. Ohne Redis laufen Throttling und kurze OAuth-State-Keys im Prozessspeicher. Für einen einzelnen kleinen Mandanten reicht das.

**Nicht löschen:**

- **postiz-postgres** (bestehende Integrationen, Tokens, Posts, User)
- **Uploads-Volume** (Pfad `/uploads` am App-Service mounten, wie bisher)

Die bestehende Postgres-URL (`DATABASE_URL`) unverändert lassen. Die Prisma-Änderungen sind additiv (`publishLockAt` an `Post`, neue Tabelle `ReplyTemplate`).

## App-Service: Build und Start

Railway: Root-Directory = Repo-Root, Builder = Dockerfile (`Dockerfile`).

**Build:** Docker führt `pnpm install --frozen-lockfile` und `pnpm run build` aus (nur Frontend + Backend).

**Start:** `nginx` + `pnpm run pm2` (Prisma `db push`, dann Backend-Port 3000 und Frontend-Port 4200). Nginx nimmt `PORT` (Railway) oder 5000.

Next.js bakes `NEXT_PUBLIC_*` beim Build ein. In Railway dieselben Werte als **Variable und Build-Argument** setzen:

| Variable | Beispiel |
|---|---|
| `NEXT_PUBLIC_BACKEND_URL` | `https://<dein-service>.up.railway.app/api` |
| `FRONTEND_URL` / `MAIN_URL` | `https://<dein-service>.up.railway.app` |
| `NEXT_PUBLIC_UPLOAD_DIRECTORY` | `/uploads` |

## Erforderliche Env-Vars

Weiterhin wie bisher, mindestens:

- `DATABASE_URL` — bestehende `postiz-postgres`-URL
- `JWT_SECRET`
- `MAIN_URL`, `FRONTEND_URL`, `NEXT_PUBLIC_BACKEND_URL`, `BACKEND_INTERNAL_URL` (`http://localhost:3000`)
- `STORAGE_PROVIDER=local`
- `UPLOAD_DIRECTORY=/uploads`
- `IS_GENERAL=true`
- Instagram: `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`
- Facebook Page (wenn genutzt): `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`

Optional:

- `REDIS_URL` — nur wenn Redis weiterlaufen soll
- `SCHEDULER_CATCHUP_HOURS` — Standard `6`. Fällige QUEUE-Posts innerhalb dieses Fensters werden beim Start nachgeholt, ältere werden auf `ERROR` gesetzt (`Skipped: became due while the app was down`) statt still nachträglich gepostet.
- `TEMPORAL_ADDRESS` — ungenutzt
- `DISABLE_REGISTRATION`, Stripe, E-Mail usw. wie bisher

## On-Demand (start, posten, stop)

Der In-Process-Scheduler läuft nur, solange die App läuft. Railway Serverless/Sleep ist ungeeignet.

1. Queue in der UI oder per `GET /public/v1/posts` prüfen. Alte, ungewollte QUEUE-Posts löschen oder auf Draft setzen.
2. App + Postgres starten. Warten, bis `https://<app>/api/public/v1/is-connected` mit API-Key `connected: true` liefert. Die Public API hängt hinter `/api` (Nginx → Backend).
3. Posten (`type: now` oder geplanter Termin, während die App läuft).
4. Warten, bis der Post `PUBLISHED` ist und eine Release-URL hat (`GET /api/public/v1/posts/:id`). Instagram lädt Medien von der öffentlichen Upload-URL.
5. Erst dann die App stoppen. Postgres kann an bleiben, wenn der nächste Start schnell gehen soll; das Volume `/uploads` muss bleiben.

Beim nächsten Start: Posts, die höchstens `SCHEDULER_CATCHUP_HOURS` überfällig sind, werden veröffentlicht. Ältere QUEUE-Posts werden übersprungen und als Fehler markiert — kein stilles Nachholen von gestrigen Terminen.

## Meta: einmal neu autorisieren

Die App fordert jetzt Messaging-/Comment-Scopes an. Bestehende Tokens haben die nicht.

**Instagram (Instagram Login / Standalone):**

- Meta App Dashboard → Instagram → API Setup: `instagram_business_manage_comments` und `instagram_business_manage_messages` (plus die bisherigen Publish-Scopes).
- In der Instagram-App: Einstellungen → Nachrichten → **Zugriff auf Nachrichten erlauben**.
- In Postiz den Kanal **trennen und neu verbinden**.

**Facebook Page:**

- App-Scopes: `pages_manage_engagement`, `pages_read_user_content`, `pages_messaging`, `pages_manage_metadata` (plus bestehende Post-Scopes).
- Page in Postiz neu verbinden (`FACEBOOK_APP_ID` / `SECRET` müssen gesetzt sein).

Ohne App Review, solange nur eigene Accounts (Admin-Rolle in der Meta-App) genutzt werden.

**Regeln:** Keine kalten Erstnachrichten per API. Eine Private Reply pro Kommentar innerhalb von 7 Tagen. Danach nur, wenn die Person antwortet (24-Stunden-Fenster).

## Public API Inbox (für einen externen Bot)

Basis: `https://<app>/api/public/v1` mit Header `Authorization: <API-Key>`.

- `GET /inbox/comments?integrationId=`
- `POST /inbox/comments/:commentId/reply?integrationId=`
- `POST /inbox/comments/:commentId/private-reply?integrationId=`
- `GET /inbox/conversations?integrationId=`
- `GET /inbox/conversations/:id/messages?integrationId=`
- `POST /inbox/conversations/:id/messages?integrationId=` (`recipientId` + `message` oder `templateId`)
- `GET|POST /inbox/templates`, `PUT|DELETE /inbox/templates/:id`, `POST /inbox/templates/:id/send`

Dieselben Pfade gibt es authentifiziert unter `/api/inbox/...` für die UI. MCP-Tools: `inboxCommentsTool`, `inboxReplyCommentTool`, `inboxConversationsTool`, `inboxSendMessageTool`, `inboxTemplatesTool`. SDK-Methoden am Postiz-Client: `inboxComments`, `inboxReplyComment`, `inboxPrivateReply`, `inboxConversations`, `inboxMessages`, `inboxSendMessage`, `inboxTemplates`, `inboxCreateTemplate`.

## Was nicht portiert wurde

- RSS/Autopost-Cron
- Clipping-Workflows (Start liefert 503)
- AI-Video-Generierung im Hintergrund (Start liefert 503)
- Media-Normalizer-Workflow (Uploads werden direkt gespeichert)
- Digest-/Streak-Mails, Plug-Aktionen, Repeat-Interval (`intervalInDays`) nach dem Publish
- Orchestrator-Prozess (`apps/orchestrator` bleibt im Repo, wird nicht gebaut/gestartet)

`TEMPORAL_ADDRESS` darf stehen bleiben, wird ignoriert. Prisma `db push` beim Start ist additiv: `Post.publishLockAt`, Tabelle `ReplyTemplate`.
