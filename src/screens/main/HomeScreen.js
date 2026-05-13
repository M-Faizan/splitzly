import { showAlert } from '../../utils/alert'
import React, { useCallback, useState } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, ScrollView, Alert, Image, Modal, FlatList, StatusBar
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { supabase } from '../../lib/supabase'
import { logActivity } from '../../lib/activityLog'
import { useAuth } from '../../hooks/useAuth'
import { useCurrency } from '../../hooks/useCurrency'
import ExpenseDetailModal from '../../components/shared/ExpenseDetailModal'
import { colors, categoryColors, spacing, radius, shadow, typography } from '../../constants/theme'

export default function HomeScreen({ navigation }) {
  const insets = useSafeAreaInsets()
  const { user } = useAuth()
  const { fmt } = useCurrency()
  const [expenses, setExpenses] = useState([])
  const [groups, setGroups] = useState([])
  const [summary, setSummary] = useState({ owed: 0, owing: 0, total: 0 })
  const [owingBreakdown, setOwingBreakdown] = useState([])
  const [owedBreakdown, setOwedBreakdown] = useState([])
  const [activity, setActivity] = useState([])
  const [loading, setLoading] = useState(true)
  const [groupPickerVisible, setGroupPickerVisible] = useState(false)
  const [userName, setUserName] = useState('')
  const [avatarUrl, setAvatarUrl] = useState(null)
  const [selectedExpense, setSelectedExpense] = useState(null)
  const [selectedExpenseMembers, setSelectedExpenseMembers] = useState([])

  async function openExpense(expense) {
    setSelectedExpense(expense)
    if (expense?.group_id) {
      const { data } = await supabase
        .from('group_members')
        .select('user_id, profiles:user_id(id, name, avatar_url)')
        .eq('group_id', expense.group_id)
      setSelectedExpenseMembers((data || []).map(m => ({ ...m.profiles, user_id: m.user_id })))
    }
  }

  useFocusEffect(
    useCallback(() => { fetchData() }, [])
  )

  async function fetchData() {
    setLoading(true)

    const { data: profile } = await supabase
      .from('profiles').select('name, avatar_url').eq('id', user.id).single()
    setUserName(profile?.name?.split(' ')[0] || '')
    setAvatarUrl(profile?.avatar_url || null)

    // All expenses I paid for
    const { data: paidByMe } = await supabase
      .from('expenses')
      .select('id, description, amount, category, date, group_id, paid_by, group:groups(id, name)')
      .eq('paid_by', user.id).order('date', { ascending: false })

    // All splits I'm part of
    const { data: mySplits } = await supabase
      .from('expense_splits').select('amount, expense_id').eq('user_id', user.id)

    const myExpenseIds = (paidByMe || []).map(e => e.id)
    const paidByMeIdSet = new Set(myExpenseIds)

    // All expenses others paid where I have a split
    const owingExpenseIds = (mySplits || []).filter(s => !paidByMeIdSet.has(s.expense_id)).map(s => s.expense_id)

    let owingExpenses = []
    if (owingExpenseIds.length > 0) {
      const { data } = await supabase
        .from('expenses')
        .select('id, description, amount, category, group_id, paid_by, group:groups(id, name), payer:profiles!paid_by(name)')
        .in('id', owingExpenseIds)
      owingExpenses = data || []
    }

    // Others' splits on my expenses
    let owedSplits = []
    if (myExpenseIds.length > 0) {
      const { data } = await supabase
        .from('expense_splits')
        .select('id, amount, user_id, expense_id, profiles:user_id(name)')
        .in('expense_id', myExpenseIds).neq('user_id', user.id)
      owedSplits = data || []
    }

    // All payments I made and received
    const [{ data: paymentsOut }, { data: paymentsInData }] = await Promise.all([
      supabase.from('payments').select('to_user_id, amount, expense_id').eq('from_user_id', user.id),
      supabase.from('payments').select('from_user_id, amount, expense_id').eq('to_user_id', user.id),
    ])

    // Payments made per expense
    const paidPerExpense = {}
    for (const p of (paymentsOut || [])) {
      if (p.expense_id) paidPerExpense[p.expense_id] = (paidPerExpense[p.expense_id] || 0) + parseFloat(p.amount)
    }

    // Payments received per expense
    const receivedPerExpense = {}
    for (const p of (paymentsInData || [])) {
      if (p.expense_id) receivedPerExpense[p.expense_id] = (receivedPerExpense[p.expense_id] || 0) + parseFloat(p.amount)
    }

    // Compute net per person: positive = they owe me, negative = I owe them
    const netPerPerson = {}

    // They owe me (raw splits on my expenses)
    for (const s of owedSplits) {
      netPerPerson[s.user_id] = (netPerPerson[s.user_id] || 0) + parseFloat(s.amount)
    }
    // I owe them (my splits on their expenses)
    for (const exp of owingExpenses) {
      const mySplit = (mySplits || []).find(s => s.expense_id === exp.id)
      if (mySplit) netPerPerson[exp.paid_by] = (netPerPerson[exp.paid_by] || 0) - parseFloat(mySplit.amount)
    }
    // Payments I made reduce what I owe them
    for (const p of (paymentsOut || [])) {
      netPerPerson[p.to_user_id] = (netPerPerson[p.to_user_id] || 0) + parseFloat(p.amount)
    }
    // Payments they made reduce what they owe me
    for (const p of (paymentsInData || [])) {
      netPerPerson[p.from_user_id] = (netPerPerson[p.from_user_id] || 0) - parseFloat(p.amount)
    }

    // Summary: owed to me = sum of positive nets, I owe = sum of negative nets
    let owed = 0, owing = 0
    for (const net of Object.values(netPerPerson)) {
      if (net > 0.01) owed += net
      else if (net < -0.01) owing += Math.abs(net)
    }

    const total = (mySplits || []).reduce((sum, s) => sum + parseFloat(s.amount), 0)

    // "You Owe" breakdown: one row per expense, showing remaining amount after payments
    const breakdown = owingExpenses.map(exp => {
      const mySplit = (mySplits || []).find(s => s.expense_id === exp.id)
      const raw = parseFloat(mySplit?.amount || 0)
      const paid = paidPerExpense[exp.id] || 0
      const remaining = Math.max(0, raw - paid)
      return {
        expenseId: exp.id,
        description: exp.description,
        groupName: exp.group?.name || 'Personal',
        groupId: exp.group?.id,
        paidByName: exp.payer?.name || 'Someone',
        paidById: exp.paid_by,
        amount: remaining,
        category: exp.category,
        expense: exp,
      }
    })
    .filter(item => item.amount > 0.005)
    .sort((a, b) => b.amount - a.amount)

    // "Owed to You" breakdown: per expense, showing remaining after payments received
    const owedBreakdown = owedSplits.map(s => {
      const exp = (paidByMe || []).find(e => e.id === s.expense_id)
      const raw = parseFloat(s.amount)
      const received = receivedPerExpense[s.expense_id] || 0
      const remaining = Math.max(0, raw - received)
      return {
        splitId: s.id,
        debtorId: s.user_id,
        debtorName: s.profiles?.name || 'Someone',
        description: exp?.description || '',
        groupName: exp?.group?.name || 'Personal',
        amount: remaining,
        category: exp?.category,
        expense: exp,
      }
    })
    .filter(item => item.amount > 0.005)
    .sort((a, b) => b.amount - a.amount)

    const participantExpenseIds = (mySplits || []).map(s => s.expense_id)
    const allInvolvedIds = [...new Set([...myExpenseIds, ...participantExpenseIds])]

    let recentExpenses = paidByMe || []
    if (participantExpenseIds.length > 0) {
      const { data: participantExpenses } = await supabase
        .from('expenses')
        .select('id, description, amount, category, date, group_id, paid_by, group:groups(id, name)')
        .in('id', allInvolvedIds)
        .order('date', { ascending: false })
        .limit(3)
      recentExpenses = participantExpenses || []
    }

    const { data: memberData } = await supabase
      .from('group_members')
      .select('group:groups(id, name, image_url)')
      .eq('user_id', user.id)

    const myGroups = (memberData || []).map(d => d.group).filter(Boolean)

    const groupsWithStats = await Promise.all(myGroups.map(async g => {
      const { data: expData } = await supabase
        .from('expenses')
        .select('amount')
        .eq('group_id', g.id)
      const groupTotal = (expData || []).reduce((sum, e) => sum + parseFloat(e.amount), 0)
      return { ...g, total: groupTotal, count: (expData || []).length }
    }))

    setSummary({ owed, owing, total })
    setOwingBreakdown(breakdown)
    setOwedBreakdown(owedBreakdown)
    setExpenses(recentExpenses)
    setGroups(groupsWithStats)

    // Activity feed — from activity_log
    const { data: activityData } = await supabase
      .from('activity_log')
      .select('id, type, title, subtitle, amount, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(5)
    setActivity(activityData || [])

    setLoading(false)
  }

  async function handleAddExpense() {
    if (groups.length === 0) {
      showAlert('No groups yet', 'Create a group first before adding an expense.', [
        { text: 'Go to Groups', onPress: () => navigation.navigate('Groups') },
        { text: 'Cancel', style: 'cancel' },
      ])
      return
    }
    if (groups.length === 1) {
      const g = groups[0]
      const { data: memberData } = await supabase
        .from('group_members').select('profiles:user_id(id, name)').eq('group_id', g.id)
      const members = (memberData || []).map(m => m.profiles)
      navigation.navigate('AddExpense', { group: g, members })
      return
    }
    setGroupPickerVisible(true)
  }

  async function selectGroup(g) {
    setGroupPickerVisible(false)
    const { data: memberData } = await supabase
      .from('group_members').select('profiles:user_id(id, name)').eq('group_id', g.id)
    const members = (memberData || []).map(m => m.profiles)
    navigation.navigate('AddExpense', { group: g, members })
  }

  const net = summary.owed - summary.owing

  const hour = new Date().getHours()
  const timeGreeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const displayName = userName ? userName.charAt(0).toUpperCase() + userName.slice(1) : ''

  async function handleLogout() {
    showAlert(
      displayName || 'Account',
      'What would you like to do?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign Out', style: 'destructive', onPress: async () => {
          setUserName('')
          await supabase.auth.signOut()
        }},
      ]
    )
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      {/* Navy gradient header */}
      <LinearGradient
        colors={['#162840', '#1E3A55', '#162840']}
        locations={[0, 0.5, 1]}
        style={[styles.header, { paddingTop: insets.top + spacing.sm }]}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.greeting}>
            {displayName ? `${timeGreeting}, ${displayName}` : 'Splitzly'}
          </Text>
          <Text style={styles.subGreeting}>Here's your financial overview</Text>
        </View>
        <TouchableOpacity onPress={() => navigation.navigate('Profile')} style={styles.logoutBtn} accessibilityLabel="Profile">
          <View style={styles.avatarBtn}>
            {avatarUrl
              ? <Image source={{ uri: avatarUrl }} style={styles.avatarImg} />
              : <Text style={styles.avatarBtnText}>{displayName?.[0] || '?'}</Text>
            }
          </View>
        </TouchableOpacity>
      </LinearGradient>

      {/* Balance card — overlaps header */}
      <View style={styles.balanceCardWrapper}>
        <View style={styles.balanceCard}>
          <View style={styles.balanceTopRow}>
            <View>
              <Text style={styles.balanceLabel}>
                {net >= 0 ? 'You are owed' : 'You owe'}
              </Text>
              <Text style={[styles.balanceAmount, { color: net >= 0 ? colors.settled : colors.pending }]}>
                {fmt(Math.abs(net))}
              </Text>
            </View>
            <View style={styles.balanceTotalBox}>
              <Text style={styles.balanceTotalAmount}>{fmt(summary.total)}</Text>
              <Text style={styles.balanceTotalLabel}>total spent</Text>
            </View>
          </View>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {loading
          ? <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
          : <>
              {/* You owe breakdown */}
              {owingBreakdown.length > 0 && (
                <>
                  <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>You Owe</Text>
                    <View style={styles.owingBadge}>
                      <Text style={styles.owingBadgeText}>{owingBreakdown.length}</Text>
                    </View>
                  </View>
                  <View style={styles.owingCard}>
                    {owingBreakdown.map((item, idx) => {
                      const catColor = categoryColors[item.category] || categoryColors.Other
                      return (
                        <TouchableOpacity
                          key={item.expenseId}
                          style={[styles.owingRow, idx < owingBreakdown.length - 1 && styles.owingRowBorder]}
                          onPress={() => openExpense(item.expense)}
                          activeOpacity={0.7}
                        >
                          <View style={[styles.owingCatBox, { backgroundColor: catColor.bg }]}>
                            <View style={[styles.owingCatDot, { backgroundColor: catColor.dot }]} />
                          </View>
                          <View style={styles.owingInfo}>
                            <Text style={styles.owingDesc} numberOfLines={1}>{item.description}</Text>
                            <Text style={styles.owingMetaText}>
                              in {item.groupName} · paid by {item.paidByName}
                            </Text>
                          </View>
                          <View style={styles.owingAmountCol}>
                            <Text style={styles.owingAmount}>{fmt(item.amount)}</Text>
                            <Text style={styles.owingLabel}>your share</Text>
                          </View>
                        </TouchableOpacity>
                      )
                    })}
                  </View>
                </>
              )}

              {/* Owed to you breakdown */}
              {owedBreakdown.length > 0 && (
                <>
                  <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>Owed to You</Text>
                    <View style={styles.owedBadge}>
                      <Text style={styles.owedBadgeText}>{owedBreakdown.length}</Text>
                    </View>
                  </View>
                  <View style={styles.owingCard}>
                    {owedBreakdown.map((item, idx) => {
                      const catColor = categoryColors[item.category] || categoryColors.Other
                      return (
                        <TouchableOpacity
                          key={item.splitId}
                          style={[styles.owingRow, idx < owedBreakdown.length - 1 && styles.owingRowBorder]}
                          onPress={() => openExpense(item.expense)}
                          activeOpacity={0.7}
                        >
                          <View style={[styles.owingCatBox, { backgroundColor: catColor.bg }]}>
                            <View style={[styles.owingCatDot, { backgroundColor: catColor.dot }]} />
                          </View>
                          <View style={styles.owingInfo}>
                            <Text style={styles.owingDesc} numberOfLines={1}>{item.description}</Text>
                            <Text style={styles.owingMetaText}>
                              {item.debtorName} · in {item.groupName}
                            </Text>
                          </View>
                          <View style={styles.owingAmountCol}>
                            <Text style={styles.owedAmount}>{fmt(item.amount)}</Text>
                            <Text style={styles.owingLabel}>owes you</Text>
                          </View>
                        </TouchableOpacity>
                      )
                    })}
                  </View>
                </>
              )}

              {/* Groups */}
              {groups.length > 0 && (
                <>
                  <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>Your Groups</Text>
                    <TouchableOpacity onPress={() => navigation.navigate('Groups')}>
                      <Text style={styles.sectionLink}>See all</Text>
                    </TouchableOpacity>
                  </View>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.groupsScroll} contentContainerStyle={styles.groupsScrollContent}>
                    {groups.map(g => (
                      <TouchableOpacity
                        key={g.id}
                        style={styles.groupCard}
                        onPress={() => navigation.navigate('GroupDetail', { group: g })}
                        activeOpacity={0.7}
                      >
                        <View style={styles.groupIconBox}>
                          {g.image_url
                            ? <Image source={{ uri: g.image_url }} style={styles.groupIconImg} />
                            : <Text style={styles.groupIconText}>{g.name?.[0]?.toUpperCase()}</Text>
                          }
                        </View>
                        <Text style={styles.groupName} numberOfLines={1}>{g.name}</Text>
                        <Text style={styles.groupTotal}>{fmt(g.total)}</Text>
                        <Text style={styles.groupCount}>{g.count} {g.count === 1 ? 'expense' : 'expenses'}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </>
              )}

              {/* Recent Expenses — always shown, max 3 */}
              {expenses.length > 0 && (
                <>
                  <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>Recent Expenses</Text>
                  </View>
                  {expenses.slice(0, 3).map(item => {
                      const catColor = categoryColors[item.category] || categoryColors.Other
                      return (
                        <TouchableOpacity
                          key={item.id}
                          style={styles.expenseCard}
                          onPress={() => openExpense(item)}
                          activeOpacity={0.7}
                        >
                          <View style={[styles.catIconBox, { backgroundColor: catColor.bg }]}>
                            <View style={[styles.categoryDot, { backgroundColor: catColor.dot }]} />
                          </View>
                          <View style={styles.expenseInfo}>
                            <Text style={styles.expenseDesc} numberOfLines={1}>{item.description}</Text>
                            <Text style={styles.expenseSub}>
                              {item.group?.name || 'Personal'} · {new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            </Text>
                          </View>
                          <Text style={styles.expenseAmount}>{fmt(item.amount)}</Text>
                        </TouchableOpacity>
                      )
                    })
                  }
                </>
              )}
              {/* Activity feed */}
              {activity.length > 0 && (
                <>
                  <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>Activity</Text>
                  </View>
                  <View style={styles.activityCard}>
                    {activity.map((item, idx) => {
                      const isDeleted = item.type === 'expense_deleted' || item.type === 'group_deleted'
                      const isSettled = item.type === 'settled'
                      const isMemberAdded = item.type === 'member_added'
                      const iconName = isDeleted ? 'trash-outline' : isSettled ? 'checkmark-circle-outline' : isMemberAdded ? 'person-add-outline' : 'add-circle-outline'
                      const iconColor = isDeleted ? colors.pending : isSettled ? colors.settled : colors.primary
                      const iconBg = isDeleted ? colors.pendingBg : isSettled ? colors.settledBg : colors.primaryLight
                      const ago = (() => {
                        const diff = Date.now() - new Date(item.created_at).getTime()
                        const mins = Math.floor(diff / 60000)
                        if (mins < 60) return `${mins}m ago`
                        const hrs = Math.floor(mins / 60)
                        if (hrs < 24) return `${hrs}h ago`
                        return `${Math.floor(hrs / 24)}d ago`
                      })()
                      return (
                        <View key={item.id} style={[styles.activityRow, idx < activity.length - 1 && styles.activityRowBorder]}>
                          <View style={[styles.activityIconBox, { backgroundColor: iconBg }]}>
                            <Ionicons name={iconName} size={14} color={iconColor} />
                          </View>
                          <View style={styles.activityInfo}>
                            <Text style={styles.activityTitle} numberOfLines={1}>{item.title}</Text>
                            {item.subtitle && <Text style={styles.activitySub} numberOfLines={1}>{item.subtitle}</Text>}
                          </View>
                          <View style={styles.activityRight}>
                            {item.amount != null && (
                              <Text style={[styles.activityAmount, { color: isDeleted ? colors.pending : isSettled ? colors.settled : colors.text }]}>
                                {fmt(item.amount)}
                              </Text>
                            )}
                            <Text style={styles.activityAgo}>{ago}</Text>
                          </View>
                        </View>
                      )
                    })}
                  </View>
                </>
              )}

            </>
        }
        <View style={{ height: 16 }} />
      </ScrollView>

      {/* FAB */}
      <TouchableOpacity
        style={[styles.fab, { bottom: insets.bottom + 76, right: spacing.lg }]}
        onPress={handleAddExpense}
        activeOpacity={0.85}
        accessibilityLabel="Add expense"
      >
        <Ionicons name="add" size={24} color={colors.white} />
        <Text style={styles.fabLabel}>Add</Text>
      </TouchableOpacity>

      <ExpenseDetailModal
        visible={!!selectedExpense}
        expense={selectedExpense}
        currentUserId={user.id}
        group={selectedExpense?.group}
        members={selectedExpenseMembers}
        onClose={() => { setSelectedExpense(null); setSelectedExpenseMembers([]) }}
        onSettled={fetchData}
        onDeleted={fetchData}
        navigation={navigation}
      />

      {/* Group picker modal */}
      <Modal visible={groupPickerVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modal, { paddingBottom: insets.bottom + spacing.lg }]}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Add expense to...</Text>
            <TouchableOpacity
              style={styles.newGroupRow}
              onPress={() => { setGroupPickerVisible(false); navigation.navigate('Groups') }}
              activeOpacity={0.7}
            >
              <View style={[styles.groupRowIcon, { backgroundColor: colors.accentLight }]}>
                <Ionicons name="add" size={20} color={colors.accent} />
              </View>
              <Text style={[styles.groupRowName, { color: colors.accent }]}>Create new group</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.accent} />
            </TouchableOpacity>
            <View style={{ height: 1, backgroundColor: colors.border, marginBottom: spacing.sm }} />
            <FlatList
              data={groups}
              keyExtractor={g => g.id}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.groupRow} onPress={() => selectGroup(item)} activeOpacity={0.7}>
                  <View style={[styles.groupRowIcon, { overflow: 'hidden' }]}>
                    {item.image_url
                      ? <Image source={{ uri: item.image_url }} style={{ width: 40, height: 40 }} />
                      : <Text style={styles.groupRowIconText}>{item.name?.[0]?.toUpperCase()}</Text>
                    }
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.groupRowName}>{item.name}</Text>
                    <Text style={styles.groupRowMeta}>{item.count} {item.count === 1 ? 'expense' : 'expenses'}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                </TouchableOpacity>
              )}
              ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: colors.border }} />}
            />
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setGroupPickerVisible(false)}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },

  // Gradient header
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl + spacing.lg,
  },
  greeting: { fontSize: 22, fontWeight: '800', color: colors.white, letterSpacing: -0.3 },
  subGreeting: { fontSize: 13, color: 'rgba(255,255,255,0.55)', marginTop: 2, fontWeight: '400' },
  logoutBtn: { padding: spacing.xs, marginTop: 2 },
  avatarBtn: {
    width: 36, height: 36, borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.35)',
    overflow: 'hidden',
  },
  avatarImg: { width: 36, height: 36, borderRadius: radius.full },
  avatarBtnText: { color: colors.white, fontWeight: '800', fontSize: 15 },

  // Balance card floats over header
  balanceCardWrapper: {
    paddingHorizontal: spacing.lg,
    marginTop: -(spacing.xxl + spacing.md),
    marginBottom: spacing.md,
  },
  balanceCard: {
    backgroundColor: colors.background, borderRadius: radius.xl,
    padding: spacing.lg, ...shadow.md,
  },
  balanceTopRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  balanceLabel: { fontSize: 12, fontWeight: '600', color: colors.textSecondary, marginBottom: spacing.xs },
  balanceAmount: { fontSize: 38, fontWeight: '800', letterSpacing: -1 },
  balanceTotalBox: { alignItems: 'flex-end' },
  balanceTotalAmount: { fontSize: 18, fontWeight: '800', color: colors.text },
  balanceTotalLabel: { fontSize: 10, color: colors.textMuted, fontWeight: '500', marginTop: 2 },

  scrollContent: { paddingHorizontal: spacing.lg, paddingBottom: 100, maxWidth: 600, width: '100%', alignSelf: 'center' },

  // Section headers
  sectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: spacing.sm, marginTop: spacing.xs,
  },
  sectionTitle: { ...typography.bodyBold },
  sectionLink: { ...typography.caption, color: colors.primary, fontWeight: '600' },

  // You Owe
  owingBadge: {
    backgroundColor: colors.pendingBg, paddingHorizontal: 8,
    paddingVertical: 2, borderRadius: radius.full,
  },
  owingBadgeText: { fontSize: 12, fontWeight: '700', color: colors.pending },
  owedBadge: {
    backgroundColor: colors.settledBg, paddingHorizontal: 8,
    paddingVertical: 2, borderRadius: radius.full,
  },
  owedBadgeText: { fontSize: 12, fontWeight: '700', color: colors.settled },
  owingCard: {
    backgroundColor: colors.background, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border,
    overflow: 'hidden', marginBottom: spacing.lg, ...shadow.sm,
  },
  owingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md },
  owingRowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  owingCatBox: {
    width: 36, height: 36, borderRadius: radius.sm,
    justifyContent: 'center', alignItems: 'center', flexShrink: 0,
  },
  owingCatDot: { width: 10, height: 10, borderRadius: radius.full },
  owingInfo: { flex: 1 },
  owingDesc: { ...typography.bodyBold, fontSize: 14 },
  owingMetaText: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  owingAmountCol: { alignItems: 'flex-end' },
  owingAmount: { fontSize: 15, fontWeight: '800', color: colors.pending },
  owedAmount: { fontSize: 15, fontWeight: '800', color: colors.settled },
  owingLabel: { fontSize: 10, color: colors.textMuted, fontWeight: '500', marginTop: 1 },

  // Groups
  groupsScroll: { marginHorizontal: -spacing.lg, marginBottom: spacing.lg },
  groupsScrollContent: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  groupCard: {
    width: 110, backgroundColor: colors.background, borderRadius: radius.lg,
    padding: spacing.sm + 4, ...shadow.sm,
  },
  groupIconBox: {
    width: 34, height: 34, borderRadius: radius.md,
    backgroundColor: colors.primaryLight, justifyContent: 'center',
    alignItems: 'center', marginBottom: spacing.xs, overflow: 'hidden',
  },
  groupIconImg: { width: 34, height: 34, borderRadius: radius.md },
  groupIconText: { color: colors.primary, fontWeight: '800', fontSize: 14 },
  groupName: { ...typography.bodyBold, fontSize: 12, marginBottom: 2 },
  groupTotal: { fontSize: 14, fontWeight: '800', color: colors.text, marginBottom: 1 },
  groupCount: { ...typography.small },

  // Expense cards
  expenseCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: spacing.sm + 2, paddingHorizontal: spacing.md,
    backgroundColor: colors.background, borderRadius: radius.lg,
    marginBottom: spacing.sm, ...shadow.sm,
  },
  catIconBox: {
    width: 36, height: 36, borderRadius: radius.sm,
    justifyContent: 'center', alignItems: 'center',
  },
  categoryDot: { width: 10, height: 10, borderRadius: radius.full },
  expenseInfo: { flex: 1 },
  expenseDesc: { ...typography.bodyBold },
  expenseSub: { ...typography.caption, marginTop: 1 },
  expenseAmount: { fontSize: 15, fontWeight: '700', color: colors.text },

  // Empty state
  emptyState: { alignItems: 'center', marginTop: 40, gap: spacing.sm },
  emptyIconBox: {
    width: 64, height: 64, borderRadius: radius.full,
    backgroundColor: colors.primaryLight, justifyContent: 'center', alignItems: 'center',
  },
  emptyText: { ...typography.h3, color: colors.textSecondary },
  emptySubText: { ...typography.caption, textAlign: 'center' },
  emptyBtn: {
    marginTop: spacing.sm, backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
    borderRadius: radius.full,
  },
  emptyBtnText: { color: colors.white, fontWeight: '700', fontSize: 14 },

  // FAB with label
  fabRow: {},
  fab: {
    position: 'absolute',
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2,
    borderRadius: radius.full,
    backgroundColor: colors.primary, ...shadow.md,
  },
  fabLabel: { color: colors.white, fontWeight: '700', fontSize: 14 },

  modalOverlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  modal: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.xxl, borderTopRightRadius: radius.xxl,
    padding: spacing.lg,
  },
  modalHandle: {
    width: 40, height: 4, borderRadius: radius.full,
    backgroundColor: colors.border, alignSelf: 'center', marginBottom: spacing.lg,
  },
  modalTitle: { ...typography.h3, marginBottom: spacing.md },
  groupRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  newGroupRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  groupRowIcon: {
    width: 40, height: 40, borderRadius: radius.md,
    backgroundColor: colors.primaryLight, justifyContent: 'center', alignItems: 'center',
  },
  groupRowIconText: { color: colors.primary, fontWeight: '800', fontSize: 16 },
  groupRowName: { ...typography.bodyBold },
  groupRowMeta: { ...typography.caption, marginTop: 1 },
  cancelBtn: { padding: spacing.md, marginTop: spacing.sm },
  cancelText: { textAlign: 'center', color: colors.textSecondary, fontSize: 15, fontWeight: '600' },

  // Activity feed
  activityCard: {
    backgroundColor: colors.background, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border,
    overflow: 'hidden', marginBottom: spacing.lg, ...shadow.sm,
  },
  activityRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md },
  activityRowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  activityIconBox: {
    width: 34, height: 34, borderRadius: radius.full,
    justifyContent: 'center', alignItems: 'center', flexShrink: 0,
  },
  activityInfo: { flex: 1 },
  activityTitle: { fontSize: 13, fontWeight: '700', color: colors.text },
  activitySub: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  activityRight: { alignItems: 'flex-end' },
  activityAmount: { fontSize: 14, fontWeight: '800' },
  activityAgo: { fontSize: 10, color: colors.textMuted, marginTop: 2 },

})
