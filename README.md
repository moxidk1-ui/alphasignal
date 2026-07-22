# AlphaSignal

AlphaSignal is a production-grade, multi-market trading signal platform for autonomous algorithmic signals, AI-assisted provider workflows, and manual signal publishing.

This repository is organized as a pnpm monorepo:

```text
/
|-- apps/
|   |-- api/        Fastify API, auth, service layers, health probes, OpenAPI docs
|   `-- web/        Next.js workspace, charts, live feed, provider tools, NextAuth
|-- packages/
|   |-- config/     Shared TypeScript, ESLint, and Tailwind configuration
|   |-- db/         Prisma schema, migration, seed, and Prisma client export
|   |-- indicators/ Pure technical indicator math
|   |-- algo-engine/ Pure pattern detection engine
|   |-- queue/      BullMQ queue contracts and scan schedules
|   `-- shared/     Cross-service enums, domain types, and Zod schemas
|-- docker-compose.yml
|-- .env.example
`-- pnpm-workspace.yaml
```

## Architecture

```text
                   +----------------------------+
                   |          apps/web          |
                   | Next.js, NextAuth, charts  |
                   | dashboard/billing/admin UI |
                   +-------------+--------------+
                                 | REST + WS
                                 v
+------------------+   +--------+---------+   +------------------+
|   PostgreSQL 16  |<->|    apps/api      |<->|     Redis 7      |
| Prisma records   |   | Fastify + Pino   |   | cache/pubsub/jobs|
+------------------+   | auth/plan gates  |   +--------+---------+
                       +---+-----+----+---+            |
                           |     |    |            BullMQ workers
                 +---------+     |    +---------+
                 v               v              v
          +-------------+  +-----------+  +----------------+
          | Market data |  | Anthropic |  | Stripe/Resend/ |
          | integrations|  | analysis  |  | Telegram       |
          +-------------+  +-----------+  +----------------+
```

The API follows the requested layer boundaries:

```text
routes -> controllers -> services -> repositories -> Prisma
```

Route files register Fastify endpoints and schemas only. Controllers shape HTTP responses. Services own behavior. Repositories own Prisma access.

Authentication uses RS256 JWT access tokens with 15 minute expiry and rotating 7 day refresh tokens. Refresh tokens are stored only as bcrypt hashes in PostgreSQL and delivered to browser clients as httpOnly cookies. The Next.js app uses NextAuth with credentials and Google providers, backed by the API auth endpoints.

Market reads use a unified service interface with provider-specific integrations:

```text
STOCKS   Alpaca REST OHLCV/quotes and quote WebSocket stream
CRYPTO   Binance public REST OHLCV/quotes and quote WebSocket stream
FOREX    Alpha Vantage REST with cache-first access
FUTURES  Polygon REST with Yahoo Finance fallback
```

Each REST provider is guarded by an `opossum` circuit breaker. Three provider failures in a 60 second period open the circuit for 120 seconds. Redis caches live quotes for 10 seconds, intraday candles up to `M15` for 60 seconds, higher timeframe candles for 300 seconds, and search results for 3600 seconds; a stale cache is retained for controlled provider-failure fallback.

BullMQ runs the autonomous scanning and AI-hybrid processing workflows. `algo-scan` uses timeframe-specific job schedulers, retrieves market candles, computes the pure indicator library, runs the algo engine, deduplicates detections for four hours, and creates either published or provider-approval signals. `ai-analysis` sends the validated 200-bar analysis prompt to Claude and retains the structured recommendation in Redis for 30 minutes.

`notify-subs` processes the persisted notification pipeline with concurrency 10. Delivery is deduplicated per event, signal, user, and channel; Resend emails additionally use provider idempotency keys. Free recipients receive enabled email alerts only. Pro and Provider recipients can receive in-app notifications and Telegram messages once a private chat is linked.

The Next.js workspace uses TanStack React Query for authenticated API caching, Zustand for active chart/live-quote state, a paid-plan WebSocket client for signal and notification updates, and TradingView Lightweight Charts for candlesticks with entry, stop, target, order-block, and fair-value-gap overlays. Provider accounts can review scanner detections, configure scans, submit manual signals, or request an AI-assisted recommendation from the workspace.

Stripe Checkout creates `PRO` and `PROVIDER` monthly subscriptions and Stripe Customer Portal manages existing subscriptions. Signed webhook events update `User.plan` and the derived platform role; this user record is the entitlement authority. `PlanEnforcementService` enforces publishing, AI analysis, algo access, paid notification channels, exclusion of algorithmic signals for Free users, and the five-signal-per-day Free allowance in API controllers. Admin users can inspect platform metrics and adjust account roles from the administration workspace.

## Requirements

- Node.js 20.11 or newer
- pnpm 9 or newer
- Docker and Docker Compose for local Postgres and Redis

## Environment

Create `.env` from `.env.example` and provide real secrets before starting services.

Generate JWT keys:

```bash
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:4096 -out jwt_private.pem
openssl rsa -pubout -in jwt_private.pem -out jwt_public.pem
```

For single-line environment values, replace newlines with `\n`.

### Production Secrets Checklist

Provision these values before a production deployment:

```text
JWT_PRIVATE_KEY / JWT_PUBLIC_KEY       locally generated RSA keypair
JWT_REFRESH_SECRET / NEXTAUTH_SECRET   independent cryptographically random secrets
DATABASE_URL / REDIS_URL               managed database and cache credentials
ANTHROPIC_API_KEY                       Anthropic Console API key
ALPACA_API_KEY / ALPACA_API_SECRET      Alpaca market data credentials
BINANCE_API_KEY / BINANCE_API_SECRET    Binance credentials where required
ALPHA_VANTAGE_API_KEY / POLYGON_API_KEY market data credentials
STRIPE_SECRET_KEY                       Stripe API key
STRIPE_WEBHOOK_SECRET                   Stripe signed webhook endpoint secret
STRIPE_PRO_PRICE_ID                     $29/month recurring Stripe Price ID
STRIPE_PROVIDER_PRICE_ID                $79/month recurring Stripe Price ID
RESEND_API_KEY / EMAIL_FROM             verified Resend sending domain and key
TELEGRAM_BOT_TOKEN                      BotFather-issued bot token
TELEGRAM_WEBHOOK_SECRET                 random webhook verification token
GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET Google OAuth application credentials
```

Keep secrets out of source control and replace the local values in `.env` only after the vendor resources and callback/webhook URLs exist.

## Local Development

Install dependencies:

```bash
pnpm install
```

Start local infrastructure:

```bash
docker compose up -d postgres redis
```

If a local PostgreSQL installation already uses port `5432`, set `POSTGRES_PORT=5433` and use `localhost:5433` in `DATABASE_URL` before starting the containers.

Generate Prisma Client:

```bash
pnpm db:generate
```

Run migrations:

```bash
pnpm db:migrate
```

Seed development data:

```bash
pnpm db:seed
```

The seed creates `provider@alphasignal.local`, `subscriber@alphasignal.local`, and `admin@alphasignal.local`. Their password is `SEED_USER_PASSWORD`, or `AlphaSignalSeed!2026` when that variable is not set.

Run API and web together:

```bash
pnpm dev
```

Both local services resolve the repository-root `.env`; no package-specific environment file is required.

API health:

```bash
curl http://localhost:4000/health/live
curl http://localhost:4000/health/ready
```

Web health:

```bash
curl http://localhost:3000/api/health
```

OpenAPI docs are served from:

```text
http://localhost:4000/docs
```

Auth endpoints:

```text
POST /auth/register
POST /auth/login
POST /auth/refresh
POST /auth/logout
GET  /auth/verify-email?token=
GET  /auth/me
GET  /users/me
PATCH /users/me
POST /users/me/telegram-link
DELETE /users/me/telegram-link
```

Market endpoints require an authenticated access token:

```text
GET /market/quote?ticker=AAPL&market=STOCKS
GET /market/ohlcv?ticker=BTCUSDT&market=CRYPTO&timeframe=M15&limit=200
GET /market/search?q=EUR&market=FOREX
```

Redis sliding-window request limiting is enforced on auth and market traffic. Login is limited to 10 requests per IP per 15 minutes, registration to 5 per IP per hour, refresh to 30 per user per 15 minutes, and market reads to 60 per user per minute. Limited responses include `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`, and `Retry-After` headers.

Signal and autonomous-engine endpoints:

```text
GET    /signals
POST   /signals
POST   /signals/analyze
GET    /signals/analyze/:jobId
GET    /signals/:id
PATCH  /signals/:id
POST   /signals/:id/close
DELETE /signals/:id

GET    /algo/detections
POST   /algo/detections/:id/approve
POST   /algo/detections/:id/reject
GET    /algo/config
PUT    /algo/config
```

Signal publishing and algo routes require the `PROVIDER` entitlement or administrator access. AI analysis is available to `PRO` and `PROVIDER` accounts at their plan-specific rate limit. Provider drafts and pending algorithmic detections can be edited through `PATCH /signals/:id`; publishing an edited pending detection preserves its `ALGO` source and resolves the approval item without creating a duplicate signal. Published and closed signals enqueue the notification workflow. Free users cannot view algorithmic signals and are limited to five distinct visible signals per UTC day.

Provider and watchlist endpoints:

```text
GET    /providers
GET    /providers/:id
GET    /providers/:id/signals
GET    /providers/:id/analytics
POST   /providers/:id/subscribe
DELETE /providers/:id/subscribe

GET    /watchlist
POST   /watchlist
DELETE /watchlist/:id
```

Provider subscriptions enforce plan limits: `FREE` supports two active followed providers, `PRO` supports ten, and `PROVIDER` is unlimited. Watchlists are capped at 100 unique market instruments per user.

In-app notification endpoints:

```text
GET   /notifications
PATCH /notifications/:id/read
PATCH /notifications/read-all
```

Use `PATCH /users/me` with `{"emailAlertsEnabled":false}` to disable transactional signal-alert emails. Telegram cannot be linked by setting a chat identifier directly: request a short-lived command from `POST /users/me/telegram-link`, send that command to the bot in a private chat, and the secret-validated webhook completes the link.

Billing endpoints:

```text
GET  /billing/plans
POST /billing/checkout
POST /billing/portal
POST /webhooks/stripe
```

Create two recurring Stripe prices for the stated monthly amounts and set `STRIPE_PRO_PRICE_ID` and `STRIPE_PROVIDER_PRICE_ID`. In local development, forward signed events:

```bash
stripe listen --forward-to localhost:4000/webhooks/stripe
```

Admin endpoints require role `ADMIN`:

```text
GET   /admin/users
PATCH /admin/users/:id/role
GET   /admin/stats
GET   /admin/algo/detections
```

Configure Telegram webhook delivery after deploying the API:

```bash
curl -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
  -d "url=https://your-api.example.com/webhooks/telegram" \
  -d "secret_token=${TELEGRAM_WEBHOOK_SECRET}"
```

Authenticated WebSocket clients connect to:

```text
ws://localhost:4000/ws?token=<access-token>
```

`PRO` and `PROVIDER` clients receive `signal:new`, `signal:closed`, `algo:detection`, and `ai-analysis:ready` events through Redis-backed user channels. Clients can subscribe to live chart quotes by sending `{"action":"quote:subscribe","ticker":"AAPL","market":"STOCKS"}` and receive `quote:update` events.

Next.js auth pages:

```text
/auth/login
/auth/register
/auth/verify-email
```

Authenticated workspace pages:

```text
/dashboard              Chart, live signal feed, and selected signal details
/signals/:id            Signal chart and level analysis
/signals/create         Manual and AI-hybrid provider publishing
/algo/review            Pending algo approvals with chart thumbnails
/algo/config            Provider scanner configuration
/providers              Provider discovery and follow controls
/providers/:id          Provider track record and analytics
/watchlist              Instrument search, quotes, and chart routing
/notifications          In-app alert inbox for paid plans
/analysis               Paid-plan structured AI analysis workbench
/analytics              Provider performance dashboard
/subscriptions          Stripe plan selection and billing portal
/settings               Profile, billing, email, and Telegram preferences
/admin                  Administrator account and detection operations
```

## Docker Compose

Start the local stack:

```bash
docker compose up --build
```

Services:

```text
postgres  localhost:5432
redis     localhost:6379
api       localhost:4000
web       localhost:3000
```

## Validation

Use the root scripts to validate the workspace:

```bash
pnpm typecheck
pnpm build
pnpm lint
pnpm test
```

The API Vitest suite includes Stripe entitlement transition and server-side plan enforcement tests. Indicator and algorithm engine packages retain deterministic mathematical and synthetic-pattern unit coverage.

### End-to-End Validation

The Playwright test covers the provider and subscriber critical path: save an algo configuration, surface a deterministic persisted scanner output for review, approve and publish it, receive it over the paid WebSocket feed, render the signal chart, and verify queued Telegram delivery.

It requires running PostgreSQL and Redis plus seeded local accounts:

```bash
docker compose up -d postgres redis
pnpm db:migrate
pnpm db:seed
pnpm test:e2e
```

The application servers are started automatically by Playwright unless `E2E_USE_RUNNING_SERVER=1` is supplied. Development placeholder email and Telegram credentials deliberately skip outbound vendor sends while preserving persisted delivery verification.

## CI/CD

The GitHub Actions workflow in `.github/workflows/ci-cd.yml` runs linting, type checks, unit tests, and the full workspace build for pull requests and pushes to `main`. It also verifies both production Docker images.

After those checks pass on `main` or a semantic version tag such as `v1.0.0`, the workflow publishes the API and web images to GitHub Container Registry:

```text
ghcr.io/<owner>/<repository>-api
ghcr.io/<owner>/<repository>-web
```

Before merging, protect the `main` branch in GitHub and require the `Quality checks`, `Build api image`, and `Build web image` status checks.
