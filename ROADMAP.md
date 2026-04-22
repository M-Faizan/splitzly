# Splitzly — Feature Roadmap

## Done

### Auth & Onboarding
- Login & Sign Up with Supabase Auth
- First-time onboarding tour — animated swipeable slides, skip option, AsyncStorage flag
- Replay Onboarding button in Profile

### Home
- Balance card — You are owed / You owe / net
- You Owe & Owed to You sections with per-expense remaining amounts
- Your Groups horizontal scroll
- FAB with smart group picker (0 → alert, 1 → direct, 2+ → modal)
- Recent Expenses (capped at 3)
- Activity feed from shared `activity_log`
- Expense detail modal — settle, nudge, delete

### Groups
- Create group with live avatar preview and name suggestions
- Group detail with filter (All / Pending / Settled)
- Tappable group photo with camera badge overlay
- Add members from friends list
- Group settings — rename, change photo, delete group (creator only)
- Per-expense settled status computed from payments

### Expenses
- Add expense — description, amount, date, category, equal & custom split
- Delete expense — payer or group creator only
- Settle My Share button in expense detail
- Nudge — single debtor opens chat; multiple debtors sends message to all at once (Nudge All)
- Receipt Items shown in expense detail on Home and Group screens

### Friends
- Add friends by email
- Friend detail — net balance, breakdown, shared groups
- Settle Up flow — partial payment with proportional distribution

### Activity Log
- Settlement logged for both payer and creditor with personalised messages
- Logs: expense added/deleted, settled, group deleted, member added

### Messages
- 1-on-1 chat between friends
- Unread badge with Realtime subscription, clears on navigation

### Profile
- Avatar upload and remove (Supabase Storage)
- Edit display name
- Default currency picker (12 currencies, app-wide instant update)
- Stats card: Groups, Friends, Expenses

### AI Features
- [x] Receipt scanner — photo → Claude Vision → auto-fills amount, description, category, date, line items
- [x] Category auto-detection — type a description, AI picks category after 0.8s debounce; manual pick disables auto-detect

---

## Up Next

### High Priority
- [ ] Push notifications — expense added, settled, nudged
- [ ] Expense search / filter — by category, date range, amount

### Medium Priority
- [ ] Export — CSV or PDF download of group expenses
- [ ] Recurring expenses — auto-add monthly rent, subscriptions

### AI Features
- [ ] Natural language entry — "Ali and I split dinner €60" creates an expense
- [ ] Spending insights — monthly summaries and trends per category
- [ ] Debt simplification — minimise transactions needed to settle a group
- [ ] Smart nudge timing — AI picks best time to remind based on payment history

### Nice to Have
- [ ] Multiple payers per expense
- [ ] Pay via link — generate Revolut / PayPal payment link from a split
- [ ] App Store / Play Store release via EAS Build
- [ ] Multi-language support
