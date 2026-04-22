# Splitzly — App Architecture

---

## High-Level Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     📱 Mobile App                           │
│              React Native + Expo (iOS / Android)            │
│                                                             │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────┐ │
│  │  Navigation │  │    Screens   │  │  State / Context   │ │
│  │  (Stack +   │  │  (14 total)  │  │  useAuth           │ │
│  │  BottomTab) │  │              │  │  CurrencyProvider  │ │
│  └─────────────┘  └──────────────┘  └────────────────────┘ │
│                          │                                  │
│              ┌───────────┴───────────┐                      │
│              │    src/lib/supabase   │                      │
│              │    (Supabase JS SDK)  │                      │
│              └───────────┬───────────┘                      │
└──────────────────────────┼──────────────────────────────────┘
                           │ HTTPS
          ┌────────────────┴─────────────────┐
          │           Supabase Cloud          │
          │                                  │
          │  ┌──────────┐  ┌──────────────┐  │
          │  │ Auth     │  │  PostgreSQL  │  │
          │  │ (email / │  │  Database    │  │
          │  │ session) │  │  (11 tables) │  │
          │  └──────────┘  └──────────────┘  │
          │  ┌──────────┐  ┌──────────────┐  │
          │  │ Storage  │  │  Realtime    │  │
          │  │ (avatars │  │  (messages,  │  │
          │  │ + groups)│  │   badges)    │  │
          │  └──────────┘  └──────────────┘  │
          └──────────────────────────────────┘

                           +

          ┌──────────────────────────────────┐
          │       AI Receipt Scanner         │
          │  (dev only — see proxy section)  │
          └──────────────────────────────────┘
```

---

## Project File Structure

```
spliteasy/
├── index.js                   # Entry point
├── App.js                     # Root: wraps CurrencyProvider + AppNavigator
├── .env                       # Supabase URL/key + Claude proxy URL/key
├── claude-proxy.js            # Local Node.js proxy for AI receipt scanner
│
└── src/
    ├── navigation/
    │   └── AppNavigator.js    # All navigation logic (stack + tabs + auth gate)
    │
    ├── screens/
    │   ├── auth/
    │   │   ├── LoginScreen.js
    │   │   └── SignUpScreen.js
    │   ├── onboarding/
    │   │   └── OnboardingScreen.js
    │   └── main/
    │       ├── HomeScreen.js
    │       ├── FriendsScreen.js
    │       ├── GroupsScreen.js
    │       ├── GroupDetailScreen.js
    │       ├── AddExpenseScreen.js
    │       ├── ExpenseDetailScreen.js
    │       ├── SettleUpScreen.js
    │       ├── MessagesScreen.js
    │       ├── ChatScreen.js
    │       └── ProfileScreen.js
    │
    ├── lib/
    │   ├── supabase.js        # Supabase client (URL + anon key from .env)
    │   └── activityLog.js     # Shared helper: insert into activity_log for all parties
    │
    ├── hooks/
    │   ├── useAuth.js         # Supabase auth state (user, loading, session)
    │   └── useCurrency.js     # Read currency from CurrencyProvider context
    │
    ├── constants/
    │   └── theme.js           # Colors, spacing, radius, shadows, typography
    │
    └── components/
        └── SplitzlyLogo.js    # SVG logo component
```

---

## Navigation Structure

```
AppNavigator (Stack)
│
├── [logged out]
│   ├── LoginScreen
│   └── SignUpScreen
│
└── [logged in]
    ├── OnboardingScreen        ← shown once on first install (AsyncStorage flag)
    │
    └── MainTabs (BottomTab)
        ├── 🏠 Home             → HomeScreen
        ├── 👥 Friends          → FriendsScreen
        ├── 🗂 Groups           → GroupsScreen
        └── 💬 Messages         → MessagesScreen  (unread badge via Realtime)
            │
            [Stack screens pushed on top of tabs]
            ├── GroupDetail     → GroupDetailScreen
            ├── AddExpense      → AddExpenseScreen
            ├── SettleUp        → SettleUpScreen
            ├── ExpenseDetail   → ExpenseDetailScreen
            ├── Profile         → ProfileScreen
            └── Chat            → ChatScreen
```

---

## Database Schema (Supabase PostgreSQL)

```
profiles
  id (uuid, FK → auth.users)
  name, avatar_url, currency
  updated_at

friendships
  id, user_id, friend_id
  status ('accepted')
  created_at

groups
  id, name, created_by (FK → profiles)
  image_url, created_at

group_members
  id, group_id (FK → groups), user_id (FK → profiles)
  joined_at

expenses
  id, description, amount, currency
  paid_by (FK → profiles)
  group_id (FK → groups)
  category, date, created_at

expense_splits
  id, expense_id (FK → expenses ON DELETE CASCADE)
  user_id (FK → profiles)
  amount, is_settled (deprecated — use payments)

expense_items                  ← receipt line items from AI scanner
  id, expense_id (FK → expenses ON DELETE CASCADE)
  name, amount

payments                       ← source of truth for settlements
  id, from_user_id, to_user_id (FK → profiles)
  expense_id (FK → expenses ON DELETE CASCADE)
  amount, note, created_at

messages
  id, from_user_id, to_user_id (FK → profiles)
  content, read, created_at

activity_log
  id, user_id (FK → profiles)
  type, title, subtitle
  amount, group_id, expense_id
  created_at
```

### Key Relationships

```
groups ──< group_members >── profiles
groups ──< expenses
expenses ──< expense_splits >── profiles
expenses ──< expense_items
expenses ──< payments
profiles ──< payments
profiles ──< messages
profiles ──< activity_log
profiles ──< friendships
```

### Settlement Model
- `payments` is the **sole source of truth** — `is_settled` on splits is deprecated
- Per-expense remaining = `split.amount − SUM(payments WHERE expense_id AND from_user_id)`
- All child records cascade-delete when an expense or group is deleted

---

## State Management

| Concern | Solution |
|---------|----------|
| Auth session | `useAuth` hook — wraps `supabase.auth.onAuthStateChange` |
| Currency preference | `CurrencyProvider` (React Context) — reads from `profiles`, updates app-wide instantly |
| Screen-local data | `useState` + `useFocusEffect` — fetch fresh on every screen visit |
| Realtime messages badge | Supabase Realtime channel in `AppNavigator` — subscribes to `messages INSERT/UPDATE` |
| First-run onboarding | `AsyncStorage` key `onboarding_done` |

---

## Data Flow — Adding an Expense

```
User fills form
     │
     ▼
AddExpenseScreen
  INSERT → expenses
  INSERT → expense_splits (one row per member)
  INSERT → expense_items  (if receipt was scanned)
  INSERT → activity_log   (one row per group member)
     │
     ▼
HomeScreen / GroupDetailScreen
  useFocusEffect → re-fetch on next visit
  displays updated balances
```

## Data Flow — Settling a Debt

```
User taps "Settle My Share"
     │
     ▼
HomeScreen / GroupDetailScreen / SettleUpScreen
  INSERT → payments  { from, to, expense_id, amount }
  INSERT → activity_log  [payer row: "You paid X"]
  INSERT → activity_log  [creditor row: "X paid you"]
     │
     ▼
Balance recalculated:
  remaining = split.amount − payments for that expense
  → updates "Pending" badge, home balance card
```

---

## AI Receipt Scanner

### Problem
The SAP HAI proxy (free Claude API via company account) only accepts connections from `localhost` on the laptop. The phone on Expo Go cannot reach `localhost` — it connects over Wi-Fi.

### Solution: Two-hop proxy

```
📱 Phone (Expo Go)
  POST base64 image to http://192.168.178.61:6656
         │
         │  Wi-Fi (local network)
         ▼
💻 Laptop — claude-proxy.js  (Node.js, port 6656, binds 0.0.0.0)
  forwards to → http://localhost:6655
         │
         │  localhost only
         ▼
💻 Laptop — SAP HAI Desktop App  (port 6655)
  adds company auth token, forwards to → Anthropic API
         │
         │  Internet (HTTPS)
         ▼
☁️  Anthropic — Claude Haiku
  analyses receipt image
  returns { amount, description, category, date, items[] }
         │
         ▼  (response travels back the same chain)
📱 Phone — auto-fills expense form
```

### Receipt scan sequence

```
1. User taps "Scan Receipt" in AddExpenseScreen
2. expo-image-picker opens gallery (base64: true)
3. base64 string + mediaType POSTed to proxy
4. Claude Haiku responds with JSON
5. App sets: amount, description, category, date, receiptItems[]
6. User reviews, edits if needed, saves
7. On save: expense_items rows inserted for each line item
8. Group members can see breakdown in expense detail modal
```

### Running the proxy
```bash
node claude-proxy.js   # must be running on the laptop during testing
```

---

## Key Libraries

| Library | Purpose |
|---------|---------|
| `expo` | Build toolchain, managed workflow |
| `react-native` | Cross-platform UI primitives |
| `@react-navigation/stack` | Screen stack with headers |
| `@react-navigation/bottom-tabs` | Main tab bar |
| `@supabase/supabase-js` | Database, auth, storage, realtime |
| `expo-image-picker` | Camera / gallery access (avatars, group photos, receipts) |
| `expo-linear-gradient` | Gradient backgrounds |
| `@expo/vector-icons` (Ionicons) | All icons throughout the app |
| `react-native-async-storage` | Persist onboarding flag |
| `react-native-gesture-handler` | Swipe gestures (friend removal) |
| `react-native-svg` | SVG logo rendering |

---

## Security

| Concern | Approach |
|---------|----------|
| Auth | Supabase email/password; JWT stored in session |
| Row-Level Security | All tables protected — users can only read/write their own data |
| `activity_log` INSERT | `WITH CHECK true` — any authenticated user can log (needed for cross-user activity) |
| `activity_log` SELECT | Own rows only |
| API keys | Supabase anon key is public by design; Claude proxy key lives in `.env` (not committed) |
| Cascade deletes | All child records (splits, payments, items) auto-delete with parent expense/group |
