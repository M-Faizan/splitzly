import { showAlert } from '../../utils/alert'
import React, { useEffect, useState, useCallback } from 'react'
import { View, Text, StyleSheet, ActivityIndicator, ScrollView, TouchableOpacity, Alert, Image } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'
import { logActivity } from '../../lib/activityLog'
import { useAuth } from '../../hooks/useAuth'
import { useCurrency } from '../../hooks/useCurrency'
import { colors, categoryColors, spacing, radius, shadow, typography } from '../../constants/theme'

export default function ExpenseDetailScreen({ route, navigation }) {
  const { expense, group, members } = route.params
  const { user } = useAuth()
  const { fmt } = useCurrency()
  const insets = useSafeAreaInsets()
  const [splits, setSplits] = useState([])
  const [paidByName, setPaidByName] = useState('')
  const [loading, setLoading] = useState(true)
  const [settling, setSettling] = useState(false)
  const [groupCreatedBy, setGroupCreatedBy] = useState(null)

  useEffect(() => {
    navigation.setOptions({
      title: '',
      headerRight: () => (
        <View style={styles.headerActions}>
          {group && (
            <TouchableOpacity
              onPress={() => navigation.navigate('AddExpense', { group, members, expense })}
              style={styles.headerIconBtn}
              accessibilityLabel="Edit expense"
            >
              <Ionicons name="pencil-outline" size={18} color={colors.primary} />
            </TouchableOpacity>
          )}
          {(expense.paid_by === user.id || groupCreatedBy === user.id) && (
            <TouchableOpacity onPress={handleDelete} style={styles.headerIconBtn} accessibilityLabel="Delete expense">
              <Ionicons name="trash-outline" size={18} color={colors.pending} />
            </TouchableOpacity>
          )}
        </View>
      )
    })
  }, [groupCreatedBy])

  useFocusEffect(
    useCallback(() => { fetchSplits() }, [])
  )

  async function handleDelete() {
    showAlert('Delete Expense', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          await supabase.from('payments').delete().eq('expense_id', expense.id)
          await supabase.from('expense_splits').delete().eq('expense_id', expense.id)
          await supabase.from('expenses').delete().eq('id', expense.id)
          const { data: profile } = await supabase.from('profiles').select('name').eq('id', user.id).single()
          const actorName = profile?.name || 'Someone'
          await logActivity({
            actorId: user.id,
            type: 'expense_deleted',
            titleYou: `You deleted "${expense.description}"`,
            titleOther: `${actorName} deleted "${expense.description}"`,
            subtitle: group?.name || 'Personal',
            amount: parseFloat(expense.amount),
            groupId: group?.id || null,
          })
          navigation.goBack()
        }
      }
    ])
  }

  async function fetchSplits() {
    const [{ data: splitsData }, { data: payerProfile }, { data: expenseFull }] = await Promise.all([
      supabase.from('expense_splits').select('id, amount, user_id, profiles:user_id(name, avatar_url)').eq('expense_id', expense.id),
      supabase.from('profiles').select('name').eq('id', expense.paid_by).single(),
      supabase.from('expenses').select('id, group_id').eq('id', expense.id).single(),
    ])

    const groupId = expenseFull?.group_id || expense.group_id

    if (groupId) {
      const { data: groupData } = await supabase.from('groups').select('created_by').eq('id', groupId).single()
      setGroupCreatedBy(groupData?.created_by || null)
    }

    // Fetch all expenses in the same group to compute net balances
    let allGroupExps = []
    if (groupId) {
      const { data } = await supabase
        .from('expenses').select('id, paid_by, expense_splits(user_id, amount)').eq('group_id', groupId)
      allGroupExps = data || []
    } else {
      allGroupExps = [{ id: expense.id, paid_by: expense.paid_by, expense_splits: splitsData || [] }]
    }

    const allGroupExpIds = allGroupExps.map(e => e.id)
    let allPaymentsMap = {}
    if (allGroupExpIds.length > 0) {
      const { data: allPayments } = await supabase
        .from('payments').select('expense_id, from_user_id, amount').in('expense_id', allGroupExpIds)
      for (const p of (allPayments || [])) {
        if (!allPaymentsMap[p.expense_id]) allPaymentsMap[p.expense_id] = {}
        allPaymentsMap[p.expense_id][p.from_user_id] = (allPaymentsMap[p.expense_id][p.from_user_id] || 0) + parseFloat(p.amount)
      }
    }

    // Net owed per (debtor, creditor) across all group expenses
    const rawOwed = {}
    for (const e of allGroupExps) {
      for (const s of (e.expense_splits || [])) {
        if (s.user_id === e.paid_by) continue
        if (!rawOwed[s.user_id]) rawOwed[s.user_id] = {}
        rawOwed[s.user_id][e.paid_by] = (rawOwed[s.user_id][e.paid_by] || 0) + parseFloat(s.amount)
      }
    }
    for (const e of allGroupExps) {
      const expPayments = allPaymentsMap[e.id] || {}
      for (const [fromUser, amt] of Object.entries(expPayments)) {
        if (rawOwed[fromUser]?.[e.paid_by] !== undefined)
          rawOwed[fromUser][e.paid_by] = Math.max(0, rawOwed[fromUser][e.paid_by] - amt)
      }
    }

    const enriched = (splitsData || []).map(s => {
      if (s.user_id === expense.paid_by) return { ...s, is_settled: true, remaining: 0 }
      const owes = rawOwed[s.user_id]?.[expense.paid_by] || 0
      const owedBack = rawOwed[expense.paid_by]?.[s.user_id] || 0
      const net = owes - owedBack
      console.log('SPLIT', s.user_id, 'owes', expense.paid_by, ':', owes, 'owedBack:', owedBack, 'net:', net)
      return { ...s, is_settled: net < 0.01, remaining: Math.max(0, net) }
    })
    console.log('rawOwed:', JSON.stringify(rawOwed))
    console.log('groupId:', groupId, 'allGroupExps count:', allGroupExps.length)

    setSplits(enriched)
    const name = payerProfile?.name || 'Someone'
    setPaidByName(expense.paid_by === user.id ? `${name} (You)` : name)
    setLoading(false)
  }

  async function handleSettle() {
    const mySplit = splits.find(s => s.user_id === user.id)
    if (!mySplit || mySplit.is_settled) return
    setSettling(true)
    const { error } = await supabase.from('payments').insert({
      from_user_id: user.id,
      to_user_id: expense.paid_by,
      expense_id: expense.id,
      amount: mySplit.remaining,
      note: 'Settled up'
    })
    if (!error) {
      const { data: profile } = await supabase.from('profiles').select('name').eq('id', user.id).single()
      const actorName = profile?.name || 'Someone'
      await logActivity({
        actorId: user.id,
        type: 'settled',
        titleYou: `You settled "${expense.description}"`,
        titleOther: `${actorName} settled "${expense.description}"`,
        subtitle: group?.name || 'Personal',
        amount: mySplit.remaining,
        groupId: group?.id || null,
        expenseId: expense.id,
      })
    }
    setSettling(false)
    if (error) return showAlert('Error', 'Could not record payment.')
    fetchSplits()
  }

  const catColor = categoryColors[expense.category] || categoryColors.Other
  const paidBy = paidByName || (expense.paid_by === user.id ? 'You' : 'Someone')
  const allSettled = splits.length > 0 && splits.every(s => s.is_settled)
  const pendingSplits = splits.filter(s => !s.is_settled)
  const dateStr = expense.date ? new Date(expense.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''

  const mySplit = splits.find(s => s.user_id === user.id)
  const canSettle = mySplit && !mySplit.is_settled && expense.paid_by !== user.id

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: canSettle ? 100 : 32 }]} showsVerticalScrollIndicator={false}>

      {/* Compact hero */}
      <View style={styles.heroCard}>
        <View style={styles.heroTopRow}>
          <View style={[styles.categoryBadge, { backgroundColor: catColor.bg }]}>
            <View style={[styles.catDot, { backgroundColor: catColor.dot }]} />
            <Text style={[styles.categoryText, { color: catColor.dot }]}>{expense.category}</Text>
          </View>
          <View style={[styles.statusChip, { backgroundColor: allSettled ? colors.settledBg : colors.pendingBg }]}>
            <Ionicons name={allSettled ? 'checkmark-circle' : 'time-outline'} size={11} color={allSettled ? colors.settled : colors.pending} />
            <Text style={[styles.statusChipText, { color: allSettled ? colors.settled : colors.pending }]}>
              {allSettled ? 'Settled' : 'Pending'}
            </Text>
          </View>
        </View>

        <Text style={styles.description}>{expense.description}</Text>
        <Text style={styles.amount}>{fmt(expense.amount)}</Text>

        <View style={styles.heroDivider} />

        <View style={styles.metaRow}>
          <View style={styles.metaItem}>
            <Ionicons name="person" size={12} color={colors.primary} />
            <Text style={styles.metaText}>{paidBy}</Text>
          </View>
          <View style={styles.metaDot} />
          <View style={styles.metaItem}>
            <Ionicons name="calendar-outline" size={12} color={colors.textMuted} />
            <Text style={styles.metaText}>{dateStr}</Text>
          </View>
          {pendingSplits.length > 0 && (
            <>
              <View style={styles.metaDot} />
              <View style={styles.metaItem}>
                <Ionicons name="time-outline" size={12} color={colors.pending} />
                <Text style={[styles.metaText, { color: colors.pending }]}>{fmt(pendingSplits.reduce((s, x) => s + (x.remaining ?? parseFloat(x.amount)), 0))} pending</Text>
              </View>
            </>
          )}
        </View>
      </View>

      {/* Split breakdown */}
      <View style={styles.sectionRow}>
        <Text style={styles.sectionTitle}>Split Breakdown</Text>
        <Text style={styles.sectionCount}>{splits.length}</Text>
      </View>

      <View style={styles.splitsCard}>
        {loading
          ? <ActivityIndicator color={colors.primary} style={{ padding: spacing.lg }} />
          : splits.map((split, idx) => (
              <View key={split.user_id} style={[styles.splitRow, idx < splits.length - 1 && styles.splitRowBorder]}>
                <View style={[styles.avatar, { backgroundColor: split.is_settled ? colors.settledBg : colors.primaryLight }]}>
                  {split.profiles?.avatar_url
                    ? <Image source={{ uri: split.profiles.avatar_url }} style={styles.avatarImg} />
                    : <Text style={[styles.avatarText, { color: split.is_settled ? colors.settled : colors.primary }]}>
                        {split.profiles?.name?.[0]?.toUpperCase()}
                      </Text>
                  }
                </View>
                <View style={styles.splitInfo}>
                  <Text style={styles.splitName}>
                    {split.profiles?.name}{split.user_id === user.id ? ' (You)' : ''}
                  </Text>
                </View>
                <View style={styles.splitRight}>
                  <Text style={styles.splitAmount}>{fmt(split.is_settled ? split.amount : (split.remaining || split.amount))}</Text>
                  <View style={[styles.splitStatusChip, { backgroundColor: split.is_settled ? colors.settledBg : colors.pendingBg }]}>
                    <Text style={[styles.splitStatusText, { color: split.is_settled ? colors.settled : colors.pending }]}>
                      {split.is_settled ? 'Settled' : 'Pending'}
                    </Text>
                  </View>
                </View>
              </View>
            ))
        }
      </View>

      </ScrollView>

      {canSettle && (
        <View style={[styles.settleBar, { paddingBottom: insets.bottom + spacing.sm }]}>
          <TouchableOpacity
            style={[styles.settleBtn, settling && { opacity: 0.5 }]}
            onPress={handleSettle}
            disabled={settling}
            activeOpacity={0.85}
          >
            {settling
              ? <ActivityIndicator color={colors.white} />
              : <>
                  <Ionicons name="checkmark-circle-outline" size={18} color={colors.white} />
                  <Text style={styles.settleBtnText}>Settle My Share · {fmt(mySplit?.remaining || 0)}</Text>
                </>
            }
          </TouchableOpacity>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  content: { padding: spacing.lg, gap: spacing.sm },
  headerActions: { flexDirection: 'row', gap: spacing.xs, marginRight: spacing.sm },
  headerIconBtn: {
    width: 32, height: 32, borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.06)',
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },

  heroCard: {
    backgroundColor: colors.background, borderRadius: radius.xl,
    padding: spacing.md, ...shadow.sm,
  },
  heroTopRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: spacing.sm,
  },
  categoryBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.full,
  },
  catDot: { width: 6, height: 6, borderRadius: radius.full },
  categoryText: { fontSize: 11, fontWeight: '700' },
  statusChip: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.full,
  },
  statusChipText: { fontSize: 11, fontWeight: '700' },
  description: { fontSize: 18, fontWeight: '800', color: colors.text, marginBottom: 2 },
  amount: { fontSize: 32, fontWeight: '800', color: colors.text, letterSpacing: -1, marginBottom: spacing.sm },
  heroDivider: { height: 1, backgroundColor: colors.border, marginBottom: spacing.sm },
  metaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.xs },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 12, color: colors.textMuted, fontWeight: '500' },
  metaDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: colors.border },

  sectionRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs },
  sectionTitle: { ...typography.bodyBold },
  sectionCount: {
    fontSize: 11, fontWeight: '700', color: colors.primary,
    backgroundColor: colors.primaryLight, paddingHorizontal: 7,
    paddingVertical: 1, borderRadius: radius.full,
  },

  splitsCard: {
    backgroundColor: colors.background, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border, overflow: 'hidden',
  },
  splitRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm + 2 },
  splitRowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  avatar: {
    width: 34, height: 34, borderRadius: radius.full,
    justifyContent: 'center', alignItems: 'center',
  },
  avatarImg: { width: 34, height: 34, borderRadius: radius.full },
  avatarText: { fontWeight: '800', fontSize: 13 },
  splitInfo: { flex: 1 },
  splitName: { ...typography.bodyBold, fontSize: 13 },
  splitRight: { alignItems: 'flex-end', gap: 3 },
  splitAmount: { fontSize: 14, fontWeight: '800', color: colors.text },
  splitStatusChip: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: radius.full },
  splitStatusText: { fontSize: 10, fontWeight: '700' },

  settleBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: spacing.lg, paddingTop: spacing.sm,
    backgroundColor: colors.surface,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  settleBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.sm, backgroundColor: colors.primary,
    borderRadius: radius.full, paddingVertical: spacing.md, ...shadow.sm,
  },
  settleBtnText: { color: colors.white, fontWeight: '700', fontSize: 15 },
})
