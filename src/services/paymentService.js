import { supabase } from '../lib/supabase'

export async function recordPayment({ fromUserId, toUserId, expenseId, amount, note = 'Settled up' }) {
  const { error } = await supabase.from('payments').insert({
    from_user_id: fromUserId,
    to_user_id: toUserId,
    expense_id: expenseId || null,
    amount,
    note,
  })
  if (error) throw error
}

export async function logSettlement({ fromUserId, toUserId, fromName, toName, amount, description, groupId, expenseId }) {
  const rows = [
    {
      user_id: fromUserId,
      type: 'settled',
      title: `You paid ${toName}${description ? ` for "${description}"` : ''}`,
      amount,
      group_id: groupId || null,
      expense_id: expenseId || null,
    },
    {
      user_id: toUserId,
      type: 'settled',
      title: `${fromName} paid you${description ? ` for "${description}"` : ''}`,
      amount,
      group_id: groupId || null,
      expense_id: expenseId || null,
    },
  ]
  await supabase.from('activity_log').insert(rows)
}
