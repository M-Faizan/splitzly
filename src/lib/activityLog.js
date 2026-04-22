import { supabase } from './supabase'

export async function logActivity({ actorId, type, titleYou, titleOther, subtitle, amount, groupId, expenseId }) {
  const rows = [{ user_id: actorId, type, title: titleYou, subtitle: subtitle || null, amount: amount || null, group_id: groupId || null, expense_id: expenseId || null }]

  if (groupId) {
    const { data: members } = await supabase
      .from('group_members').select('user_id').eq('group_id', groupId)
    for (const m of (members || [])) {
      if (m.user_id === actorId) continue
      rows.push({ user_id: m.user_id, type, title: titleOther, subtitle: subtitle || null, amount: amount || null, group_id: groupId, expense_id: expenseId || null })
    }
  }

  const { error } = await supabase.from('activity_log').insert(rows)
  if (error) console.warn('activity_log insert failed:', error.message)
}
