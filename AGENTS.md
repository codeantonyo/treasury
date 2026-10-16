<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# XLM TREASURY

Stellar-based rewards app (Telegram Mini App + web) around the XLMTREASURY2 token: email/password accounts, up to 3 linked Stellar wallets, live holdings, 12 tiers, the Treasury vault page, daily streak, paid referrals and an in-app XLM TREASURY Account plus up to 3 in-app cards. Same kind of product as NEWBANK; no code carried over. Estate and badges were dropped.

Design: "Stellar App Concept" canvas, https://claude.ai/artifact/Y2NiK3Ud5emcpjsciVZpUd (390×844; `[APP NAME]` = XLM TREASURY). Tokens live in `app/globals.css`. Tabs: Home, Wallet, Treasury, Cards, Profile (settings at `/profile/settings`, money at `/account`, new card journey at `/card/new`). The Wallet (`lib/portfolio.ts`) is the on-chain portfolio of every token in `lib/tokens.ts` (`WALLET_TOKENS`): amount, live USD value, 24h change, 7-day chart and, for tokens with `hasTiers`, the tier (the 12-tier ladder lives in its detail sheet). Placeholder tokens show as "coming soon" until they get an issuer.

Stack: Next.js 16 (cacheComponents on: session reads sit behind `<Suspense>`; `proxy.ts` not middleware) + TypeScript + Tailwind v4 + framer-motion on Vercel. Data layer `lib/db.ts`: Postgres (Neon) when `POSTGRES_URL` is set, else `.data/db.json`; all writes go through `db.tx()`. Horizon reads in `lib/stellar.ts`. Members sign in their own wallet (LOBSTR/Freighter); the server never holds member keys. Auth: email + password (scrypt), email codes via Brevo (printed to the console in dev), HMAC-signed httpOnly cookie (`lib/session.ts`). Telegram (`lib/telegram.ts`): bot @XLMTreasuryBot; the Mini App signs in with Telegram initData (HMAC with the bot token, 24 h max) via `telegramSignIn` and `app/ui/telegram-boot.tsx`: a linked Telegram signs straight in; otherwise the member logs in or registers once and that links it (`users.telegramId`, unique). Bot webhook `/api/telegram` (secret header derived from the token); `npm run telegram-setup -- <https url>` sets webhook, menu button, commands. Referral share link = `t.me/XLMTreasuryBot?start=<code>`. Production cookies are SameSite=None + Partitioned so sessions work inside Telegram Web. Cron routes need `Authorization: Bearer CRON_SECRET` and support `?dry=1`.

Checks: `npm run check` (tiers, db on JSON + PGlite Postgres, referrals, streak, treasury). Scripts in `lib/` used by `scripts/` import with `.ts` extensions and avoid `server-only`.

## Rules (learned on NEWBANK)

1. Every write is atomic and version-stamped (row lock, retry on conflict). Every credit/reward has an idempotency key or claim id.
2. A Horizon failure is never "holds 0". Money-like decisions read strictly and answer "try again". Unfunded wallet (404) = 0. Paginate holder lists fully; if any page fails, write nothing.
3. A wallet counts once: a verified address can belong to only one account (enforced by a unique key).
4. In-app balances (account, cards) are labelled "In-app balance" and never blended with the on-chain Wallet number. Return non-Stellar data even when Stellar is down (last known holding is shown, never a lower tier).
5. Secrets only in `.env` / Vercel env. Never print them or put them in URLs.
6. No real money moves without the owner's explicit instruction. Money scripts dry-run by default and need `--apply`. The owner runs on-chain transfer scripts.
7. Admin area and support tickets (member opens, admin replies in-app and on Telegram).
8. Test on an isolated local DB with test accounts, at 390px width. Never against production. Leave one small runnable check script for any logic that pays or ranks people.
9. Don't commit, push or deploy unless asked.

## Main token

XLMTREASURY2, issuer `GDRAO6ODFYDGPGO7DFJASEROKLTZF3C3CUHHJATBYEAKKDBFWU7TCXLM`, home domain xlmtreasuryv2.com. All tokens live in `lib/tokens.ts`.

## Environment

`SESSION_SECRET` (required in production), `BREVO_API_KEY`, `MAIL_FROM_EMAIL`, `MAIL_FROM_NAME`, `APP_URL`, `POSTGRES_URL`, `CRON_SECRET`, `TREASURY_ADDRESS` (public G… that receives wallet-proof payments), `TELEGRAM_BOT_TOKEN`. `DISTRIBUTOR_SECRET` is only for `scripts/pay-referrals.ts` run by the owner; keep it out of Vercel.

## Product decisions

- **Admin** is a role on the account, not a hardcoded list.
- **Tiers** (`lib/tiers.ts`, owner's table): 12 tiers from 100 to 400,000+ XLMTREASURY2, each with a % of Stellar assets available for swap and a 7-asset allocation (XLM Stablecoin, Native, Ultrametal, Ultra Stockpool/Bondspool/Fundpool/Rarearths). Tier N starts just above tier N-1's top; Tier 12 starts at exactly 400,000. Below 100 = "No tier". Meaning of the allocation: owner will explain.
- **Wallets:** up to 3 per account. Proof: member sends 1 XLMTREASURY2 (or 1 XLM) to `TREASURY_ADDRESS` with the shown memo; not refunded. The payment must be made within 24 h of the code (`PROOF_WINDOW`, judged by the payment's time, not when "verify" is tapped), and codes replaced by "New code" still count (`oldMemos`). Searched in the member's own payment history (`findProofPayment`, `isProof`; check `scripts/check-proof.ts`). Pending until proven. Local dev has a "Mark verified (local dev only)" button (never in production).
- **Referral** (`lib/referrals.ts`): counts once per friend when they registered with the code, verified email, proved a wallet, hold ≥ 100 XLMTREASURY2 and **bought ≥ 100 on the DEX after signing up** (tokens moved in don't count; buys come from the token/XLM market history, `tokenBuys()` in `lib/stellar.ts`). Same-device sign-ups are rejected. Rewards: 1st 100, 2nd 250, 3rd 500, then 1,000 each, paid in XLMTREASURY2 to the referrer's primary verified wallet. Qualifying queues one payout (`ref:<inviteeId>`); `npm run pay-referrals` (dry run) / `-- --apply` (refuses the local test DB).
- **Money model (owner's money brief, applies to every feature that moves an in-app balance):** three separate places: Wallet (on-chain, read live, never stored), the XLM TREASURY Account (`main`, XLM) and up to 3 Cards (own currency: XLM/USD/EUR/GBP/AUD/CAD/CHF/JPY, fixed at creation). All in `lib/treasury.ts`:
  - `creditMember()` is the ONLY way money enters (rewards, airdrops, admin credits, cron drops). It routes to the member's default destination ("Send my rewards to", Settings); a frozen/closed card falls back to main. Card-only sources (`CARD_ONLY_SOURCES`: `tier`, `airdrop`) go to a card; with no active card, automatic credits wait in `pending` until a card is created, and Collect asks the member to create one.
  - Every movement = one locked transaction; the movement row id is the idempotency key / claim id (`req:<account>:<key>`, `claim:<claimId>`), checked under the lock. The server computes every amount; balances never go below zero. Amounts are bigint units of 1e-7, stored as strings.
  - Cards: the owner chose to show a card number, expiry and CVV (overriding the money brief's "no number/expiry/CVV" line): masked last 4 on the front, full details on the back (tap to flip) and in More → Card details (hidden until Show). Numbers come from `lib/card-number.ts`: prefix 8 (no card network) and a deliberately Luhn-invalid check digit, so no checkout accepts them (`scripts/check-card-number.ts`). No network logos. Freeze = can't send or receive, unfreeze locked 30 days. Close = balance moves to main (converted) as one movement first; never deleted. Frozen cards can't be closed (unfreeze first).
  - Member-to-member sends by @username land in the recipient's main account in XLM; no cap beyond balance (owner's call).
  - FX: CoinGecko XLM prices in all 8 currencies (`lib/fx.ts`), strict (no stale fallback), rate recorded on each movement. XLMTREASURY2 price: order-book mid, or the median of recent trades if spread > 5% / one-sided.
  - Tier rewards: running accrual `accruals.tier` = holding × `TIER_RATE_PER_DAY` (placeholder 0.1%/day) × time, starting when the member first verified a wallet, advanced and saved on every read, never recomputed. Collect: the server takes everything ready (in XLMTREASURY2), pays XLM at the token price to a card.
  - Every credit notifies the member in-app (bell → `/notifications`). Telegram notifications wait for Telegram linking.
  - `GET /api/treasury` (session only). Check: `scripts/check-treasury.ts`.
  - Referral rewards are the exception: they stay ON-CHAIN XLMTREASURY2 payouts (owner's call).
- **Streak** (`lib/streak.ts`, `collectStreak` action, card on Home): the member taps Collect once per local day; a missed day resets; gaps under 40 h forgiven; the device time zone is only taken if they haven't collected in the last 24 h. Pays in-app XLM via `creditMember` (source `streak`, claim `streak:<user>:<day>`, default destination): days 1–7 = 100, 200, 600, 2,400, 12,000, 72,000, 504,000, then the week repeats. Needs XLMTREASURY2 held (strict read) and is multiplied by tier: ×1 below T1, T1 ×1.5, T2 ×2, T3 ×5, T4 ×12 (owner), T5–T12 ×30, 75, 150, 300, 600, 1,200, 2,500, 5,000 (placeholder, "go crazy").
- **Prices / Total Balance in USD:** not built yet. Plan: DEX order-book mid vs XLM (median of recent trades if spread > 5% or one-sided) × CoinGecko XLM/USD, cached ~1 min, per-token override.
- **Tokens** (`lib/tokens.ts`): XLM, XLMTREASURY2, XLMRWA, STELLARUSD, PROTOCOL26, DTCCPROTOCOL, STELLARBONDS are live; XLMAU, XLMAI, XLMESTATE are placeholders ("coming soon"). Each has a page at `/wallet/<code>`. Tier ladders per token in `LADDERS` (`lib/tiers.ts`): XLMTREASURY2, XLMRWA, STELLARUSD (touching ranges: the boundary belongs to the higher tier), PROTOCOL26 (6 tiers); DTCCPROTOCOL and STELLARBONDS have none. A token without enough recent trades shows "price unavailable" and is left out of the total.
- **Simulated tier rewards (gamification, as on NEWBANK)** (`lib/sim-rewards.ts`, `lib/sim-view.ts`): holding a token with a `REWARD_TABLES` entry (today PROTOCOL26) earns simulated XLM26, XRP26, USDC26, XDC26, GOLD26 and SILVER26 **per day** at the member's current tier, counted from the day their wallet first held the token (earlier of its trustline and first DEX buy; "approx." = fell back to the verified date). Running accruals `sim:<token>:<asset>` in the treasury, advanced on every read. Members withdraw them to a card (card-only), valued like what each tracks (1 XLM26 = 1 XLM, XRP, USDC, XDC, 1 oz gold/silver via CoinGecko), through `collect`/`creditMember` with one claim per asset. The panel's footnote says they are simulated (owner removed the badge); activity says "Withdraw from <token name>". These are NOT the unrelated on-chain assets with the same codes (issuer GD3CO7…); never read or send those. Check: `scripts/check-sim-rewards.ts`.
- **Hard rule: in-app balances (account and cards) can never be cashed out, redeemed or moved on-chain.** They include simulated game value. Any real-money feature must be a separate system with the owner's explicit sign-off.
- **Card finishes:** Silver (everyone), Violet T3, Chrome T6, Obsidian T9 (placeholder mapping, owner to confirm). Unlocked finishes are kept if the tier drops (`maxTier`).
- **Deploy:** same GitHub/Vercel accounts as NEWBANK; separate repo, project and database. App domain: **xlmtreasuryv2.org** (`APP_URL=https://xlmtreasuryv2.org`; mail from `support@xlmtreasuryv2.org` via Brevo (domain authenticated, emails confirmed working)). Not the token's home domain, which is xlmtreasuryv2.com.

Live: https://xlmtreasury.vercel.app (Vercel project from github.com/codeantonyo/treasury; xlmtreasuryv2.org not connected yet). Admin: niranoje945@gmail.com (role set in the database). TREASURY_ADDRESS is set in Vercel.

Still open: admin Telegram id, tier reward rate, streak boosts T5+, ecosystem token issuers, card tier mapping, what the tier allocation means.
