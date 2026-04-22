// Pure functions — no Supabase calls, just math.

/**
 * Build a raw debt map from expenses + their splits.
 * Returns { [debtorId]: { [creditorId]: totalOwed } }
 */
export function computeRawOwed(expenses) {
  const rawOwed = {}
  for (const e of expenses) {
    for (const s of (e.expense_splits || [])) {
      if (s.user_id === e.paid_by) continue
      const debtor = s.user_id
      const creditor = e.paid_by
      if (!rawOwed[debtor]) rawOwed[debtor] = {}
      rawOwed[debtor][creditor] = (rawOwed[debtor][creditor] || 0) + parseFloat(s.amount)
    }
  }
  return rawOwed
}

/**
 * Subtract payments from rawOwed to get net amounts still owed.
 * payments: [{ from_user_id, to_user_id, amount }]
 */
export function applyPayments(rawOwed, payments) {
  const net = JSON.parse(JSON.stringify(rawOwed)) // deep clone
  for (const p of (payments || [])) {
    const debtor = p.from_user_id
    const creditor = p.to_user_id
    if (net[debtor]?.[creditor] !== undefined) {
      net[debtor][creditor] = Math.max(0, net[debtor][creditor] - parseFloat(p.amount))
    }
  }
  return net
}

/**
 * Get net amount between two users.
 * Positive = b owes a. Negative = a owes b.
 */
export function getNetBetween(netOwed, a, b) {
  const bOwesA = netOwed[b]?.[a] || 0
  const aOwesB = netOwed[a]?.[b] || 0
  return bOwesA - aOwesB
}

/**
 * Summarise total owed to me and total I owe across all counterparties.
 * netOwed: output of applyPayments, userId: current user
 */
export function summariseBalances(netOwed, userId) {
  let owed = 0, owing = 0
  // Others owe me
  for (const [debtor, creditors] of Object.entries(netOwed)) {
    if (debtor === userId) continue
    const amt = creditors[userId] || 0
    if (amt > 0.01) owed += amt
  }
  // I owe others
  const myDebts = netOwed[userId] || {}
  for (const amt of Object.values(myDebts)) {
    if (amt > 0.01) owing += amt
  }
  return { owed, owing }
}
