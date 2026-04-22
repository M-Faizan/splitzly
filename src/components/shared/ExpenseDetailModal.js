import React, { useState, useEffect } from 'react'
import {
  View, Text, Modal, TouchableOpacity, ScrollView,
  StyleSheet, Alert, ActivityIndicator, Image,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '../../lib/supabase'
import { logActivity } from '../../lib/activityLog'
import { recordPayment, logSettlement } from '../../services/paymentService'
import { colors, spacing, radius, shadow, categoryColors } from '../../constants/theme'
import { useCurrency } from '../../hooks/useCurrency'

export default function ExpenseDetailModal({ visible, expense, currentUserId, onClose, onSettled, onDeleted, navigation, groupName, groupCreatedBy }) {
  const insets = useSafeAreaInsets()
  const { fmt } = useCurrency()

  const [expSplits, setExpSplits] = useState([])
  const [expItems, setExpItems] = useState([])
  const [expPaidByName, setExpPaidByName] = useState('')
  const [loading, setLoading] = useState(false)
  const [settling, setSettling] = useState(false)

  useEffect(() => {
    if (visible && expense) loadDetail()
    else { setExpSplits([]); setExpItems([]) }
  }, [visible, expense?.id])

  async function loadDetail() {
    setLoading(true)
    setExpSplits([])
    setExpItems([])

    const [{ data: splitsData }, { data: payerProfile }, { data: expenseFull }, { data: itemsData }] = await Promise.all([
      supabase.from('expense_splits').select('id, amount, user_id, profiles:user_id(name, avatar_url)').eq('expense_id', expense.id),
      supabase.from('profiles').select('name').eq('id', expense.paid_by).single(),
      supabase.from('expenses').select('id, group_id').eq('id', expense.id).single(),
      supabase.from('expense_items').select('id, name, amount').eq('expense_id', expense.id),
    ])

    const groupId = expenseFull?.group_id || expense.group_id
    let allGroupExps = []
    if (groupId) {
      const { data } = await supabase.from('expenses').select('id, paid_by, expense_splits(user_id, amount)').eq('group_id', groupId)
      allGroupExps = data || []
    } else {
      allGroupExps = [{ id: expense.id, paid_by: expense.paid_by, expense_splits: splitsData || [] }]
    }

    const allGroupExpIds = allGroupExps.map(e => e.id)
    let paymentsMap = {}
    if (allGroupExpIds.length > 0) {
      const { data: allPayments } = await supabase.from('payments').select('expense_id, from_user_id, amount').in('expense_id', allGroupExpIds)
      for (const p of (allPayments || [])) {
        if (!paymentsMap[p.expense_id]) paymentsMap[p.expense_id] = {}
        paymentsMap[p.expense_id][p.from_user_id] = (paymentsMap[p.expense_id][p.from_user_id] || 0) + parseFloat(p.amount)
      }
    }

    // Build net owed map
    const rawOwed = {}
    for (const e of allGroupExps) {
      for (const s of (e.expense_splits || [])) {
        if (s.user_id === e.paid_by) continue
        if (!rawOwed[s.user_id]) rawOwed[s.user_id] = {}
        rawOwed[s.user_id][e.paid_by] = (rawOwed[s.user_id][e.paid_by] || 0) + parseFloat(s.amount)
      }
    }
    for (const e of allGroupExps) {
      for (const [fromUser, amt] of Object.entries(paymentsMap[e.id] || {})) {
        if (rawOwed[fromUser]?.[e.paid_by] !== undefined)
          rawOwed[fromUser][e.paid_by] = Math.max(0, rawOwed[fromUser][e.paid_by] - amt)
      }
    }

    const enriched = (splitsData || []).map(s => {
      if (s.user_id === expense.paid_by) return { ...s, is_settled: true, remaining: 0 }
      const owes = rawOwed[s.user_id]?.[expense.paid_by] || 0
      const owedBack = rawOwed[expense.paid_by]?.[s.user_id] || 0
      const net = owes - owedBack
      return { ...s, is_settled: net < 0.01, remaining: Math.max(0, net) }
    })

    const name = payerProfile?.name || 'Someone'
    setExpSplits(enriched)
    setExpItems(itemsData || [])
    setExpPaidByName(expense.paid_by === currentUserId ? `${name} (You)` : name)
    setLoading(false)
  }

  async function handleSettle() {
    const mySplit = expSplits.find(s => s.user_id === currentUserId)
    if (!mySplit || mySplit.is_settled) return
    setSettling(true)
    try {
      await recordPayment({ fromUserId: currentUserId, toUserId: expense.paid_by, expenseId: expense.id, amount: mySplit.remaining })
      const { data: profile } = await supabase.from('profiles').select('name').eq('id', currentUserId).single()
      const payeeName = expPaidByName.replace(' (You)', '')
      await logSettlement({
        fromUserId: currentUserId,
        toUserId: expense.paid_by,
        fromName: profile?.name || 'Someone',
        toName: payeeName,
        amount: mySplit.remaining,
        description: expense.description,
        groupId: expense.group_id || null,
        expenseId: expense.id,
      })
      onClose()
      onSettled?.()
    } catch (e) {
      Alert.alert('Error', 'Could not record payment.')
    }
    setSettling(false)
  }

  async function handleDelete() {
    Alert.alert('Delete Expense', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          const { data: profile } = await supabase.from('profiles').select('name').eq('id', currentUserId).single()
          await logActivity({
            actorId: currentUserId,
            type: 'expense_deleted',
            titleYou: `You deleted "${expense.description}"`,
            titleOther: `${profile?.name || 'Someone'} deleted "${expense.description}"`,
            subtitle: expense.group?.name || groupName || 'Personal',
            amount: expense.amount,
            groupId: expense.group_id || null,
            expenseId: expense.id,
          })
          await supabase.from('expenses').delete().eq('id', expense.id)
          onClose()
          onDeleted?.()
        },
      },
    ])
  }

  if (!expense) return null

  const catColor = categoryColors[expense.category] || categoryColors.Other
  const allSettled = expSplits.length > 0 && expSplits.every(s => s.is_settled)
  const pendingSplits = expSplits.filter(s => !s.is_settled)
  const mySplit = expSplits.find(s => s.user_id === currentUserId)
  const canSettle = mySplit && !mySplit.is_settled && expense.paid_by !== currentUserId
  const pendingOthers = expense.paid_by === currentUserId ? expSplits.filter(s => s.user_id !== currentUserId && !s.is_settled) : []
  const dateStr = expense.date ? new Date(expense.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.dismiss} activeOpacity={1} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.md }]}>
          <View style={styles.handle} />

          {/* Header */}
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.desc}>{expense.description}</Text>
              <View style={styles.meta}>
                <View style={[styles.catBadge, { backgroundColor: catColor.bg }]}>
                  <View style={[styles.catDot, { backgroundColor: catColor.dot }]} />
                  <Text style={[styles.catText, { color: catColor.dot }]}>{expense.category}</Text>
                </View>
                <Text style={styles.metaText}>{expPaidByName} · {dateStr}</Text>
              </View>
            </View>
            {(expense.paid_by === currentUserId || groupCreatedBy === currentUserId) && (
              <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete}>
                <Ionicons name="trash-outline" size={16} color={colors.pending} />
              </TouchableOpacity>
            )}
          </View>

          {/* Amount + status */}
          <View style={styles.amountRow}>
            <Text style={styles.amount}>{fmt(expense.amount)}</Text>
            <View style={[styles.statusChip, { backgroundColor: allSettled ? colors.settledBg : colors.pendingBg }]}>
              <Ionicons name={allSettled ? 'checkmark-circle' : 'time-outline'} size={11} color={allSettled ? colors.settled : colors.pending} />
              <Text style={[styles.statusText, { color: allSettled ? colors.settled : colors.pending }]}>
                {allSettled ? 'Settled' : `${fmt(pendingSplits.reduce((s, x) => s + (x.remaining ?? parseFloat(x.amount)), 0))} pending`}
              </Text>
            </View>
          </View>

          {/* Receipt Items */}
          {expItems.length > 0 && (
            <View style={styles.itemsCard}>
              <Text style={styles.itemsTitle}>Receipt Items</Text>
              {expItems.map((item, idx) => (
                <View key={item.id} style={[styles.itemRow, idx < expItems.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border }]}>
                  <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
                  <Text style={styles.itemAmt}>{fmt(parseFloat(item.amount))}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Splits */}
          <ScrollView style={styles.splits} showsVerticalScrollIndicator={false}>
            {loading
              ? <ActivityIndicator color={colors.primary} style={{ padding: spacing.lg }} />
              : expSplits.map((split, idx) => (
                  <View key={split.user_id} style={[styles.splitRow, idx < expSplits.length - 1 && styles.splitBorder]}>
                    <View style={[styles.avatar, { backgroundColor: split.is_settled ? colors.settledBg : colors.primaryLight }]}>
                      {split.profiles?.avatar_url
                        ? <Image source={{ uri: split.profiles.avatar_url }} style={styles.avatarImg} />
                        : <Text style={[styles.avatarText, { color: split.is_settled ? colors.settled : colors.primary }]}>
                            {split.profiles?.name?.[0]?.toUpperCase()}
                          </Text>
                      }
                    </View>
                    <Text style={styles.splitName}>
                      {split.profiles?.name}{split.user_id === currentUserId ? ' (You)' : ''}
                    </Text>
                    <Text style={styles.splitAmt}>{fmt(split.amount)}</Text>
                    <View style={[styles.splitChip, { backgroundColor: split.is_settled ? colors.settledBg : colors.pendingBg }]}>
                      <Text style={[styles.splitChipText, { color: split.is_settled ? colors.settled : colors.pending }]}>
                        {split.is_settled ? 'Settled' : 'Pending'}
                      </Text>
                    </View>
                  </View>
                ))
            }
          </ScrollView>

          {/* Settle My Share */}
          {canSettle && (
            <TouchableOpacity style={[styles.settleBtn, settling && { opacity: 0.5 }]} onPress={handleSettle} disabled={settling} activeOpacity={0.85}>
              {settling
                ? <ActivityIndicator color={colors.white} size="small" />
                : <>
                    <Ionicons name="checkmark-circle-outline" size={16} color={colors.white} />
                    <Text style={styles.settleBtnText}>Settle My Share · {fmt(mySplit.remaining)}</Text>
                  </>
              }
            </TouchableOpacity>
          )}

          {/* Nudge */}
          {pendingOthers.length === 1 && (
            <TouchableOpacity
              style={styles.nudgeBtn}
              onPress={() => {
                onClose()
                setTimeout(() => navigation?.navigate('Chat', {
                  partnerId: pendingOthers[0].user_id,
                  partnerName: pendingOthers[0].profiles?.name,
                  nudgeAmount: pendingOthers[0].remaining,
                }), 300)
              }}
              activeOpacity={0.85}
            >
              <Ionicons name="notifications-outline" size={16} color={colors.primary} />
              <Text style={styles.nudgeBtnText}>Nudge {pendingOthers[0].profiles?.name} · {fmt(pendingOthers[0].remaining)}</Text>
            </TouchableOpacity>
          )}
          {pendingOthers.length > 1 && (
            <TouchableOpacity
              style={styles.nudgeBtn}
              onPress={async () => {
                await Promise.all(pendingOthers.map(s =>
                  supabase.from('messages').insert({
                    from_user_id: currentUserId,
                    to_user_id: s.user_id,
                    content: `Hey, you owe me ${fmt(s.remaining)} for "${expense.description}" — settle up when you can! 👋`,
                    read: false,
                  })
                ))
                Alert.alert('Nudged!', `Sent a reminder to ${pendingOthers.length} people.`)
              }}
              activeOpacity={0.85}
            >
              <Ionicons name="notifications-outline" size={16} color={colors.primary} />
              <Text style={styles.nudgeBtnText}>Nudge All ({pendingOthers.length}) · {fmt(pendingOthers.reduce((s, x) => s + x.remaining, 0))}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  dismiss: { flex: 1 },
  sheet: {
    backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg, paddingTop: spacing.sm, maxHeight: '85%',
  },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: spacing.md },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginBottom: spacing.sm },
  desc: { fontSize: 17, fontWeight: '800', color: colors.text },
  meta: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: 4, flexWrap: 'wrap' },
  catBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 7, paddingVertical: 3, borderRadius: radius.full },
  catDot: { width: 5, height: 5, borderRadius: 3 },
  catText: { fontSize: 10, fontWeight: '700' },
  metaText: { fontSize: 11, color: colors.textMuted, fontWeight: '500' },
  deleteBtn: { padding: spacing.xs, borderRadius: radius.md, backgroundColor: colors.pendingBg },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  amount: { fontSize: 30, fontWeight: '800', color: colors.text, letterSpacing: -1 },
  statusChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.full },
  statusText: { fontSize: 11, fontWeight: '700' },
  itemsCard: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm, marginBottom: spacing.sm },
  itemsTitle: { fontSize: 11, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: spacing.xs },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  itemName: { fontSize: 13, color: colors.text, flex: 1 },
  itemAmt: { fontSize: 13, fontWeight: '700', color: colors.text },
  splits: { borderTopWidth: 1, borderTopColor: colors.border },
  splitRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm + 2 },
  splitBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  avatar: { width: 32, height: 32, borderRadius: radius.full, justifyContent: 'center', alignItems: 'center' },
  avatarImg: { width: 32, height: 32, borderRadius: radius.full },
  avatarText: { fontWeight: '800', fontSize: 12 },
  splitName: { flex: 1, fontSize: 13, fontWeight: '600', color: colors.text },
  splitAmt: { fontSize: 13, fontWeight: '800', color: colors.text },
  splitChip: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: radius.full },
  splitChipText: { fontSize: 10, fontWeight: '700' },
  settleBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    backgroundColor: colors.primary, borderRadius: radius.full, paddingVertical: spacing.md,
    marginTop: spacing.sm, ...shadow.md,
  },
  settleBtnText: { color: colors.white, fontWeight: '700', fontSize: 14 },
  nudgeBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    borderRadius: radius.full, paddingVertical: spacing.md,
    marginTop: spacing.sm, borderWidth: 1, borderColor: colors.primary,
  },
  nudgeBtnText: { color: colors.primary, fontWeight: '700', fontSize: 14 },
})
