# Casino Night - Current Status

**Last verified:** 2026-10-12
**Commit:** `149806a` (branch `main`)
**Verified by:** live server boot + HTTP API tests + Socket.IO integration tests

Everything marked OK below was exercised against a running server, not just read
from source. See "How this was verified" at the end.

---

## TL;DR

This is a **working casino night system**: a Node/Express + Socket.IO server that
bridges a set of **Python/pygame "big screen" games** to **mobile web clients**, with
a shared credit balance persisted in a JSON file.

**All five games are functional.** The core loop -- bet, balance deducted, big screen
resolves, payout, transaction logged -- is proven end to end for every game.

Three issues block a real event and should be fixed first:

| # | Issue | Severity | Impact |
|---|-------|----------|--------|
| 1 | Python scripts target port 3000, server listens on 3001 | **Blocker** | Big screens cannot talk to the server at all |
| 2 | `/api/blackjack/state` leaks the full deck | **High** | Any player can read every remaining card |
| 3 | Keno phone draw is unrelated to the big-screen draw | **Medium** | Phone and big screen disagree on winning numbers |

---

## Architecture

```
 Python big screens                    Express server
 (pygame, 1920x1080)  ------------>     port 3001
   keno.py                HTTP POST      |
   chicken_race.py        /state-update  |-- db.json (balances, txs)
   big_wheel_6.py    <------------       |
 (source of truth                         |
  for the result)          (result echoed |
                          back for state) |
                                        |
 Mobile web clients   <---------------> 
 (PWA, phone-first)       REST + Socket.IO
```

**The key design pattern:** for the three Python-driven games, the server *never*
invents the result. Bets are queued as "pending"; when the Python script posts its
`RESULT` phase, the server settles every pending bet against that single number. This
guarantees the number the player sees on the big screen is the same number used to pay
them out. Keno is the one exception -- see issue #3.

---

## What's working

### Server core -- OK

| Item | Status | Detail |
|------|--------|--------|
| Boots cleanly | OK | `node server/index.js` -> `Casino server running at http://localhost:3001` |
| Dependencies installed | OK | express 5.2.1, socket.io 4.8.3, js-yaml 5.2.2, socket.io-client |
| Static file serving | OK | All 7 HTML pages, CSS, JS, card SVGs, icons return 200 |
| SPA fallback | OK | Unknown paths fall back to `index.html` |
| JSON body parsing | OK | Working |
| `--clear-db` flag | OK | Wired at `server/index.js:12`, exposed as `npm run start:clear` |

### User identity, registration and balance -- OK

- Users are auto-created per **IP address**, or per `X-Test-User` header /
  `?test_user=` query param for bot testing (`server/index.js:32-44`).
- Registration gate on the menu: unregistered users see a Welcome overlay; name and
  unit number are required and stored.
- Starting balance comes from `config.yaml` -> `starting_credits: 1000`.
- `GET /api/user` and `POST /api/user/register` both verified working.
- Every balance change writes a transaction row with full game detail.

**Verified:** registered a fresh user; they received exactly 1000 credits and
`isRegistered` flipped to `true`.

### Game 1 - Scratch & Win -- OK (pure server-side)

Self-contained; needs no Python. The simplest fully-working game.

- Weighted probability payout across 5 rows (`[0.40, 0.30, 0.15, 0.10, 0.05]`).
- Cost 5, prizes `[0, 1, 2, 5, 10]`, from `config.yaml`.
- **Verified:** played a card, got `prizes [0,1,0,5,1]` -> win 7, net +2, and both the
  balance and the transaction row were correct.

### Game 2 - Keno -- OK (server-side draw plus big-screen display)

- Pick up to 15 of 40 numbers; house draws 20; paytable 3->1 up to 15->10000.
- Validation confirmed to return 400 with clear messages:
  - duplicate numbers rejected
  - more than 15 picks rejected
  - non-integer / out-of-range / zero bet rejected
- Phone-side draw, score and payout all verified correct.
- `betsLocked` correctly derived from phase: auto-locks on `CLOSING`, `DRAWING` and
  `FINALIZED`, releases on `BETTING`.
- The phone draw does **not** match the big screen -- see issue #3.

### Game 3 - Big Wheel 6 -- OK (Python-driven)

56-segment wheel, bets on 1/2/5/10/20/40, house wins on 0.

- Bet validation confirmed: invalid values (e.g. `7`) and over-balance bets return 400.
- Pending-bet settlement verified: bet 10 on `5`, Python posted `RESULT 5` -> paid 50,
  transaction recorded as `player_wins`.
- House-win path (`RESULT 0`) verified to accept and process correctly.
- Payout maths in `games/big_wheel_6.js` matches `big_wheel_6-state.js`.

### Game 4 - Chicken Race -- OK (Python-driven)

5 chickens, 5:1 payout, the Python race is the source of truth.

- `CHICKEN_NAMES` served to the client: Cluck Norris, Beakonce, Chick Jagger, Yolko
  Ono, Egg Sheeran.
- Pending bet on chicken 3 plus Python `RESULT 3` -> paid 50 (10 x 5).

### Game 5 - Blackjack -- OK (fully Socket.IO, dealer plus players)

The most complete game: a real two-screen, multi-player table.

Verified a **full round with 2 players and a dealer**:

- Player join request -> dealer sees it in a queue -> dealer approves -> player seated.
- Players place bets; balances are deducted up front to secure them.
- Dealer deals; hands and scores compute correctly (aces handled soft and hard).
- **Hole-card hiding confirmed working** -- the dealer view showed `["8H","AD"]`
  (score 19) while the player view simultaneously showed `["8H","1B"]` (score 8).
- HIT/STAND turn order advances correctly; natural blackjack auto-stands.
- Dealer draws until 17+, then reveals and resolves.
- **Standard rules confirmed:** 19 vs dealer 19 -> `PUSH` (bet returned, balance
  unchanged); 11 vs dealer 19 -> `LOSE` (bet lost).
- Disconnect handling keeps a player's seat mid-game so they can reconnect.
- Notifications (`blackjack-notification`, `blackjack-error`,
  `blackjack-join-rejected`) all wired.

### The Python -> server -> browser bridge -- OK (8/8 integration checks passed)

This is the heart of the system, and it all works:

| Check | Result |
|-------|--------|
| Client receives state on `join-game` | OK |
| Python push accepted (HTTP 200) | OK |
| Broadcast reaches the browser | OK (`drawNumber=42 drawn=[3,17,28]`) |
| `betsLocked` auto-set on `DRAWING` | OK |
| `betsLocked` released on `BETTING` | OK |
| Big Wheel `RESULT` broadcast with winning number | OK |
| Chicken Race `RACING` broadcast | OK |
| Socket rooms isolated (no cross-game leak) | OK |

### Config and data layer -- OK

- **Single source of tuning:** `server/config.yaml` (starting credits, Keno payouts,
  Scratch prizes/probabilities, wheel bet values), loaded via `js-yaml`.
- Python games have their own timing configs (`keno_config.yaml`,
  `chicken_race_config.yaml`, `big_wheel_6_config.yaml`) loaded through
  `scripts/server_config.py`, so timings are editable without touching code.
- `db.json` persistence with auto-increment IDs, sorted writes and transaction history.

### Client / PWA -- OK

- Mobile-first design, registration overlay, game menu with live balance.
- **PWA installable** -- `manifest.json` with a full icon set (16 to 512, maskable),
  fullscreen display and `apple-touch-icon`.
- `fullscreen.js` enters fullscreen on first gesture and re-asserts it, which matters
  for unattended kiosk-style screens.
- All 7 client pages load with 200.
- A documented design system for Keno lives in `client/keno_design.md`.

### Python scripts -- OK

- All 9 scripts parse with **no syntax errors** (Python 3.12).
- Each game's state-push helper is thread-based and non-blocking, and deliberately
  swallows connection errors so a big screen still runs if the server is down.


---

## Issues to fix

### 1. Port mismatch (blocks all Python games) -- Blocker

The server listens on **3001**, but every Python script is configured to POST to
**3000**.

```
server/index.js:19          const PORT = process.env.PORT || 3001;
scripts/server_config.yaml  server_url: "http://localhost:3000"
```

Confirmed live: port 3001 reachable = `True`, port 3000 reachable = `False`, and
`server_config.get_endpoint('/api/keno/state-update')` resolves to
`http://localhost:3000/...`.

**Impact:** no big screen can ever reach the server. Nothing fails loudly because the
push helper swallows the error -- the screens just look frozen and no payouts settle.

**Fix (pick one):**

- Set `scripts/server_config.yaml` -> `server_url: "http://localhost:3001"`, **or**
- Run with `PORT=3000 npm start`.

### 2. Blackjack state endpoint leaks the deck -- High

`server/routes/blackjack.js:15` returns the **raw internal state**:

```js
router.get('/state', (req, res) => {
  res.json({ success: true, state: { balance, gameState: blackjackState.getState() } });
});
```

The module already has the correct sanitizers -- `getPlayerState()` hides the hole card
and strips socket IDs -- but this route bypasses them by calling `getState()`.

**Proven:** a player calling this mid-game received:

```
deck array exposed        : true (length 48)
full remaining deck order : ["KD","JC","9C","KC","7S", ... all 48 in order]
dealer hole card visible  : ["JS","6C"]
player socketIds visible  : ["z5FgM7-o4341qPQcAAAD"]
```

Any player can read the entire remaining shoe in order and play perfectly.

**Fix:** return `getPlayerState()` for ordinary users (and `getDealerState()` only for

### 3. Keno draws are not shared -- Medium

Keno breaks the project's own "Python is the source of truth" pattern.

- `keno.py` draws 20 numbers and broadcasts them for the **big screen**.
- `POST /api/keno/play` calls `drawNumbers()` in `games/keno.js` and invents a
  **completely separate draw** for the player's phone.

**Proven:** with the big screen showing `1..20`, the phone draw was
`[1,4,6,7,9,10,11,12,14,18,20,22,23,25,27,31,32,36,39]` -- only 12/20 in common.

**Impact:** at a live event, guests see the big screen draw 20 numbers and get paid
according to different numbers. This is the most visible correctness bug. Keno is also
the only game that pays instantly, so a guest could currently bet after the numbers are
already visible.

---

## Smaller observations

- **Duplicate route.** `/api/chicken-race/state-update` is registered twice -- in
  `server/routes/chicken_race.js:8` and again in `server/index.js:94`. Both bodies are
  identical, so Express just uses the first. Harmless, but delete one.
- **`.gitignore` only ignores virtualenvs.** `server/db.json` (live user data and
  balances) is committed to git, as are compiled `.pyc` files and the 3 KB
  `scripts/assets/desktop.ini`. Consider ignoring `db.json` and `__pycache__`.
- **`pygame` is not installed** in the active Python 3.12 environment and no `.venv`
  exists (only `pyyaml` is present). Big screens need
  `pip install -r requirements.txt`. Node dependencies are all installed.
- **`chicken_race _orig_i5.py`** is a leftover older copy with a space in the filename;
  `chicken_race.py` is the live one.
- **`client/_old_ignore/keno.{html,css,js}`** is a superseded self-contained Keno. It is
  still served publicly (`/_old_ignore/keno.html` -> 200) but nothing links to it.
- **`list.txt`** is a 3,000-line directory dump of a virtualenv -- safe to delete.
- **No tests or test framework.** `npm test` is still the placeholder that exits 1.
- **`server_test.log` is stale.** It shows the server "running at
  http://localhost:3000" from an earlier run -- likely where the 3000 expectation came
  from.

---

## How to run

```bash
# 1. Server (from repo root)
npm start                 # http://localhost:3001
npm run start:clear       # same, but wipes db.json first

# 2. Big screens (need pygame)
pip install -r requirements.txt
python scripts/keno.py            # fullscreen 1920x1080
python scripts/chicken_race.py
python scripts/big_wheel_6.py

# 3. Clients
#    Guests:  http://<host-ip>:3001/
#    Dealer:  http://<host-ip>:3001/blackjack_dealer.html
```

`start.bat` and `start-clear.bat` wrap the two npm commands for Windows.

**Before an event:** fix issue #1 or the big screens will silently never connect.

---

## File map

| Path | Role |
|------|------|
| `server/index.js` | Express + Socket.IO bootstrap, Python bridge endpoints, user identity |
| `server/config.js` / `config.yaml` | YAML-driven game tuning (balances, payouts, odds) |
| `server/db.js` / `db.json` | JSON persistence: users, balances, transactions |
| `server/keno-state.js` | Keno phase state and broadcast |
| `server/big_wheel_6-state.js` | Wheel state, pending-bet settlement |
| `server/chicken_race-state.js` | Race state, pending-bet settlement |
| `server/blackjack-state.js` | Full table engine; dealer/player state sanitizers |
| `server/games/*.js` | Pure game logic and payout maths (unit-testable) |
| `server/routes/*.js` | REST endpoints per game |
| `scripts/keno.py` | Keno big screen (fullscreen, ball animation) |
| `scripts/chicken_race.py` | Chicken race big screen (animated, voiced) |
| `scripts/big_wheel_6.py` | Big wheel big screen (spin and anticipation) |
| `scripts/server_config.py` | Shared server URL and per-game YAML config loader |
| `scripts/generate_icons.py` | Renders PWA icons from `assets/icon.svg` |
| `client/index.html` | Registration gate and game menu |
| `client/keno.html` | Keno client (40-number grid) |
| `client/scratch.html` / `scratch.js` | Scratch & Win client |
| `client/big_wheel_6.html` | Big Wheel client |
| `client/chicken_race.html` | Chicken Race client |
| `client/blackjack.html` | Player blackjack screen |
| `client/blackjack_dealer.html` | Dealer control screen |
| `client/fullscreen.js` | Kiosk fullscreen helper |
| `client/keno_design.md` | Keno design system and tokens |
| `client/assets/cards/*.svg` | Full 52-card deck artwork |

---

## Suggested next steps

1. **Fix the port mismatch** (one line) -- without it, three of five games are dead.
2. **Return `getPlayerState()`** from `/api/blackjack/state` -- a real exploit.
3. **Make Keno share the Python draw** via the pending-bet pattern -- the only remaining
   correctness gap, and the most visible to guests.
4. **Add tests.** `server/games/*.js` are pure functions with no I/O; they are the easy
   win. `npm test` is currently a stub.
5. **Untrack `db.json`** and add `__pycache__/` to `.gitignore`.
6. **Add a dealer/admin surface** for balances and the transaction log -- the data is all
   being recorded, but there is no way to view it except reading the JSON.

---

## How this was verified

- Booted the server and confirmed the startup log and listening port.
- Called every REST endpoint with valid **and** invalid input, asserting status codes
  and error messages.
- Played real rounds of all five games, then read back `db.json` to confirm balances and
  transaction rows matched the expected payouts.
- Ran a Socket.IO integration test (3 scripted clients) driving a complete blackjack
  round -- join, approve, bet, deal, stand, dealer turn, resolve -- and compared the
  dealer's and players' views of the same hand.
- Ran an 8-check test of the Python HTTP push -> server -> browser broadcast pipeline,
  including socket room isolation.
- Reproduced the blackjack deck leak and the Keno draw mismatch with targeted scripts,
  capturing the actual leaked payload.
- Syntax-checked all 9 Python scripts.
- Cleaned up all test scripts and restored `server/db.json` to its committed state; the
  working tree is clean.


**Fix:** adopt the pending-bet pattern already used by Chicken Race and Big Wheel --
queue Keno bets during `BETTING`/`CLOSING`, then settle them when `keno.py` posts
`FINALIZED` with its `drawnNumbers`.

an authenticated dealer), reusing the sanitizer the socket path already uses:

```js
router.get('/state', (req, res) => {
  const db = require('../db');
  const blackjackState = require('../blackjack-state');
  res.json({
    success: true,
    state: { balance: db.getUserBalance(req.userId), gameState: blackjackState.getPlayerState() }
  });
});
```


For a real event across separate machines, set `server_url` to the host's LAN IP (e.g.
`http://192.168.1.50:3001`) so phones and big screens can all reach it.

- Over-balance bet -> 400 `Insufficient balance`.
