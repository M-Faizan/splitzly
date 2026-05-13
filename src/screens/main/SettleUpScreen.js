import { showAlert } from '../../utils/alert'
import React, { useState, useEffect } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, ScrollView, StatusBar
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { useCurrency } from '../../hooks/useCurrency'
import { colors, spacing, radius, shadow } from '../../constants/theme'

export default function SettleUpScreen({ route, navigation }) {
  const { friend } = route.params || {}
  const { user } = useAuth()
  const { fmt } = useCurrency()
  const insets = useSafeAreaInsets()
  const [splits, setSplits] = useState([])
  const [expenses, setExpenses] = useState({})
  const [loading, setLoading] = useState(true)
  const [settling, setSettling] = useState(false)

  useEffect(() => { fetchSplits() }, [])

  async function fetchSplits() {
    setLoading(true)

    const { data: friendExpenses } = await supabase
      .from('expenses')
      .select('id, description, amount')
      .eq('paid_by', friend.id)

    const friendExpenseIds = (friendExpenses || []).map(e => e.id)

    if (friendExpenseIds.length === 0) {
      setSplits([])
      setLoading(false)
      return
    }

    const { data: mySplits } = await supabase
      .from('expense_splits')
      .select('id, expense_id, amount')
      .in('expense_id', friendExpenseIds)
      .eq('user_id', user.id)

    // Filter to only unsettled splits using payments
    const { data: myPayments } = await supabase
      .from('payments').select('expense_id, amount')
      .eq('from_user_id', user.id).eq('to_user_id', friend.id)
    const paidPerExpense = {}
    for (const p of (myPayments || [])) {
      if (p.expense_id) paidPerExpense[p.expense_id] = (paidPerExpense[p.expense_id] || 0) + parseFloat(p.amount)
    }
    const unsettled = (mySplits || []).filter(s => {
      const remaining = Math.max(0, parseFloat(s.amount) - (paidPerExpense[s.expense_id] || 0))
      return remaining > 0.01
    })

    const expMap = {}
    for (const e of (friendExpenses || [])) expMap[e.id] = e
    setExpenses(expMap)
    setSplits(unsettled)
    setLoading(false)
  }

  const total = splits.reduce((s, x) => s + parseFloat(x.amount), 0)

  async function handleSettle() {
    if (splits.length === 0) return
    setSettling(true)

    await supabase.from('payments').insert({
      from_user_id: user.id,
      to_user_id: friend.id,
      amount: total,
      note: 'Settled up'
    })

    setSettling(false)
    showAlert('Done!', `You settled ${fmt(total)} with ${friend?.name}`, [
      { text: 'OK', onPress: () => navigation.goBack() }
    ])
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      {loading ? (
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 60 }} />
      ) : (
        <>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

            {/* Avatar row */}
            <View style={styles.avatarRow}>
              <View style={styles.youAvatar}>
                <Ionicons name="person" size={18} color={colors.primary} />
              </View>
              <View style={styles.arrowBox}>
                <Ionicons name="arrow-forward" size={12} color={colors.textMuted} />
              </View>
              <View style={styles.friendAvatar}>
                <Text style={styles.friendAvatarText}>{friend?.name?.[0]?.toUpperCase()}</Text>
              </View>
            </View>

            <View style={styles.names}>
              <Text style={styles.nameLabel}>You</Text>
              <View style={{ width: 44 }} />
              <Text style={styles.nameLabel}>{friend?.name}</Text>
            </View>

            {/* Main card */}
            <View style={styles.card}>
              <Text style={styles.subtitle}>
                You owe <Text style={styles.friendNameHL}>{friend?.name}</Text>
              </Text>

              <View style={styles.amountBox}>
                <Text style={styles.amountLabel}>Total to settle</Text>
                <Text style={styles.amount}>{fmt(total)}</Text>
              </View>

              {splits.length > 0 && (
                <View style={styles.breakdown}>
                  <Text style={styles.breakdownTitle}>Expense breakdown</Text>
                  {splits.map(s => {
                    const exp = expenses[s.expense_id]
                    return (
                      <View key={s.id} style={styles.breakdownRow}>
                        <View style={styles.breakdownDot} />
                        <Text style={styles.breakdownDesc} numberOfLines={1}>
                          {exp?.description || 'Expense'}
                        </Text>
                        <Text style={styles.breakdownAmt}>{fmt(parseFloat(s.amount))}</Text>
                      </View>
                    )
                  })}
                </View>
              )}

              {splits.length === 0 && (
                <View style={styles.noteBox}>
                  <Ionicons name="checkmark-circle-outline" size={15} color={colors.settled} />
                  <Text style={styles.note}>You're all settled up with {friend?.name}!</Text>
                </View>
              )}
            </View>

          </ScrollView>

          {/* Buttons pinned to bottom */}
          <View style={[styles.btnRow, { paddingBottom: insets.bottom + spacing.sm }]}>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => navigation.goBack()}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, (settling || splits.length === 0) && { opacity: 0.4 }]}
              onPress={handleSettle}
              disabled={settling || splits.length === 0}
              accessibilityLabel="Confirm settlement"
            >
              {settling
                ? <ActivityIndicator color={colors.white} />
                : <Text style={styles.btnText}>Confirm</Text>
              }
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  scroll: {
    flexGrow: 1, padding: spacing.lg,
    paddingTop: spacing.xl, paddingBottom: spacing.xl,
  },

  avatarRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.sm, marginBottom: spacing.xs,
  },
  youAvatar: {
    width: 44, height: 44, borderRadius: radius.full,
    backgroundColor: colors.primaryLight, justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: colors.primary,
  },
  arrowBox: {
    width: 22, height: 22, borderRadius: radius.full,
    backgroundColor: colors.surface, justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: colors.border,
  },
  friendAvatar: {
    width: 44, height: 44, borderRadius: radius.full,
    backgroundColor: 'rgba(79,70,229,0.15)', justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: 'rgba(129,140,248,0.5)',
  },
  friendAvatarText: { fontSize: 18, fontWeight: '800', color: '#818CF8' },

  names: {
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
    gap: spacing.sm, marginBottom: spacing.md,
  },
  nameLabel: { fontSize: 11, color: colors.textMuted, fontWeight: '600', width: 44, textAlign: 'center' },

  card: {
    backgroundColor: colors.background, borderRadius: radius.xl,
    padding: spacing.lg, alignItems: 'center', marginBottom: spacing.md, ...shadow.md,
  },
  subtitle: { fontSize: 13, color: colors.textSecondary, marginBottom: spacing.sm },
  friendNameHL: { color: colors.text, fontWeight: '700' },

  amountBox: {
    backgroundColor: 'rgba(0,201,177,0.18)', borderRadius: radius.lg,
    borderWidth: 1, borderColor: 'rgba(0,201,177,0.25)',
    paddingVertical: spacing.sm + 2, paddingHorizontal: spacing.lg,
    alignItems: 'center', marginBottom: spacing.md, width: '100%',
  },
  amountLabel: { fontSize: 10, fontWeight: '700', color: colors.primary, marginBottom: 2, letterSpacing: 0.5, textTransform: 'uppercase' },
  amount: { fontSize: 32, fontWeight: '800', color: colors.text, letterSpacing: -1 },

  breakdown: {
    width: '100%', borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm,
  },
  breakdownTitle: {
    fontSize: 10, fontWeight: '700', color: colors.textMuted,
    marginBottom: spacing.xs, textTransform: 'uppercase', letterSpacing: 1,
  },
  breakdownRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: 4,
  },
  breakdownDot: {
    width: 5, height: 5, borderRadius: 3,
    backgroundColor: colors.primary, opacity: 0.6,
  },
  breakdownDesc: { flex: 1, fontSize: 13, color: colors.text, fontWeight: '500' },
  breakdownAmt: { fontSize: 13, fontWeight: '700', color: colors.textSecondary },

  noteBox: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.settledBg, borderRadius: radius.md,
    padding: spacing.sm, width: '100%',
  },
  note: { flex: 1, fontSize: 13, color: colors.settled, lineHeight: 18 },

  btnRow: {
    flexDirection: 'row', gap: spacing.sm,
    paddingHorizontal: spacing.lg, paddingTop: spacing.md,
    borderTopWidth: 1, borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  btn: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.primary, borderRadius: radius.full,
    paddingVertical: spacing.md, ...shadow.sm,
  },
  btnText: { color: colors.white, fontWeight: '700', fontSize: 15 },
  cancelBtn: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: radius.full,
    paddingVertical: spacing.md, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  cancelText: { color: colors.textSecondary, fontSize: 15, fontWeight: '600' },
})
