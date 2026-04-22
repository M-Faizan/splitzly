import { supabase } from '../lib/supabase'

export async function fetchExpenseDetail(expenseId) {
  const [{ data: splits }, { data: items }] = await Promise.all([
    supabase.from('expense_splits').select('id, amount, user_id, profiles:user_id(name, avatar_url)').eq('expense_id', expenseId),
    supabase.from('expense_items').select('id, name, amount').eq('expense_id', expenseId),
  ])
  return { splits: splits || [], items: items || [] }
}

export async function saveExpense({ description, amount, category, date, groupId, paidBy, splits, items }) {
  const { data: expense, error } = await supabase
    .from('expenses')
    .insert({ description, amount, category, date, group_id: groupId, paid_by: paidBy })
    .select()
    .single()
  if (error) throw error

  await supabase.from('expense_splits').insert(
    splits.map(s => ({ expense_id: expense.id, user_id: s.userId, amount: s.amount }))
  )

  if (items && items.length > 0) {
    await supabase.from('expense_items').insert(
      items.map(item => ({ expense_id: expense.id, name: item.name, amount: item.amount }))
    )
  }

  return expense
}

export async function deleteExpense(expenseId) {
  const { error } = await supabase.from('expenses').delete().eq('id', expenseId)
  if (error) throw error
}
