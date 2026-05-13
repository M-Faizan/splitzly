import { showAlert } from '../../utils/alert'
import React, { useEffect, useState, useCallback } from 'react'
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  ActivityIndicator, Modal, Alert, TextInput, KeyboardAvoidingView, Platform, Image, ScrollView
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { Ionicons } from '@expo/vector-icons'
import { pickImage } from '../../utils/pickImage'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '../../lib/supabase'
import { logActivity } from '../../lib/activityLog'
import { useAuth } from '../../hooks/useAuth'
import { useCurrency } from '../../hooks/useCurrency'
import { uploadGroupImage, removeGroupImage as removeGroupImageFile } from '../../services/mediaService'
import ExpenseDetailModal from '../../components/shared/ExpenseDetailModal'
import { colors, categoryColors as themeCatColors, spacing, radius, shadow, typography } from '../../constants/theme'

export default function GroupDetailScreen({ route, navigation }) {
  const { group } = route.params
  const { user } = useAuth()
  const { fmt } = useCurrency()
  const insets = useSafeAreaInsets()
  const [expenses, setExpenses] = useState([])
  const [members, setMembers] = useState([])
  const [friends, setFriends] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalVisible, setModalVisible] = useState(false)
  const [adding, setAdding] = useState(false)
  const [groupName, setGroupName] = useState(group.name)
  const [groupImageUrl, setGroupImageUrl] = useState(group.image_url || null)
  const [settingsModal, setSettingsModal] = useState(false)
  const [editNameInput, setEditNameInput] = useState('')
  const [savingName, setSavingName] = useState(false)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [groupCreatedBy, setGroupCreatedBy] = useState(null)
  const [filter, setFilter] = useState('all') // 'all' | 'pending' | 'settled'
  const [selectedExpense, setSelectedExpense] = useState(null)

  useEffect(() => {
    navigation.setOptions({
      title: '',
      headerRight: () => (
        <TouchableOpacity
          onPress={() => { setEditNameInput(groupName); setSettingsModal(true) }}
          style={{ marginRight: spacing.md, padding: 4 }}
          accessibilityLabel="Group settings"
        >
          <Ionicons name="ellipsis-horizontal-circle-outline" size={26} color={colors.primary} />
        </TouchableOpacity>
      )
    })
  }, [groupName])

  useFocusEffect(
    useCallback(() => { fetchData() }, [])
  )

  async function fetchData() {
    const [{ data: expData }, { data: memberData }, { data: groupData }] = await Promise.all([
      supabase.from('expenses')
        .select('id, description, amount, category, date, paid_by, profiles:paid_by(name), expense_splits(user_id, amount)')
        .eq('group_id', group.id)
        .order('date', { ascending: false }),
      supabase.from('group_members')
        .select('profiles:user_id(id, name)')
        .eq('group_id', group.id),
      supabase.from('groups').select('created_by').eq('id', group.id).single(),
    ])

    setGroupCreatedBy(groupData?.created_by || null)

    const exps = expData || []

    // Fetch all payments for expenses in this group
    const expIds = exps.map(e => e.id)
    let paymentsMap = {} // expense_id -> { from_user_id -> total_paid }
    if (expIds.length > 0) {
      const { data: payments } = await supabase
        .from('payments').select('expense_id, from_user_id, amount')
        .in('expense_id', expIds)
      for (const p of (payments || [])) {
        if (!paymentsMap[p.expense_id]) paymentsMap[p.expense_id] = {}
        paymentsMap[p.expense_id][p.from_user_id] = (paymentsMap[p.expense_id][p.from_user_id] || 0) + parseFloat(p.amount)
      }
    }

    // Compute net balance per (debtor, creditor) pair across all group expenses
    // netOwed[debtorId][creditorId] = how much debtor owes creditor (raw splits minus payments)
    const rawOwed = {} // rawOwed[debtor][creditor] = sum of splits
    for (const e of exps) {
      for (const s of (e.expense_splits || [])) {
        if (s.user_id === e.paid_by) continue
        const debtor = s.user_id, creditor = e.paid_by
        if (!rawOwed[debtor]) rawOwed[debtor] = {}
        rawOwed[debtor][creditor] = (rawOwed[debtor][creditor] || 0) + parseFloat(s.amount)
      }
    }
    // Subtract actual payments
    for (const expId of expIds) {
      const expPayments = paymentsMap[expId] || {}
      const exp = exps.find(e => e.id === expId)
      if (!exp) continue
      for (const [fromUser, amt] of Object.entries(expPayments)) {
        const creditor = exp.paid_by
        if (rawOwed[fromUser]?.[creditor] !== undefined) {
          rawOwed[fromUser][creditor] = Math.max(0, rawOwed[fromUser][creditor] - amt)
        }
      }
    }

    // A split is "net settled" if the net remaining owed from that debtor to that creditor <= 0
    // Net = what debtor owes creditor MINUS what creditor owes debtor back
    const isNetSettled = (debtorId, creditorId) => {
      const owes = rawOwed[debtorId]?.[creditorId] || 0
      const owedBack = rawOwed[creditorId]?.[debtorId] || 0
      return (owes - owedBack) < 0.01
    }

    // Enrich each expense with payments-based settled status — per expense only
    const enriched = exps.map(e => {
      const splits = e.expense_splits || []
      const allSettled = splits.every(s => {
        if (s.user_id === e.paid_by) return true
        const raw = parseFloat(s.amount)
        const paid = (paymentsMap[e.id]?.[s.user_id] || 0)
        return (raw - paid) < 0.01
      })
      return { ...e, _allSettled: allSettled }
    })

    setExpenses(enriched)
    setMembers((memberData || []).map(m => m.profiles))
    setLoading(false)
  }

  async function pickGroupImage() {
    const picked = await pickImage()
    if (!picked) return
    setUploadingImage(true)
    try {
      const url = await uploadGroupImage(group.id, picked.uri, picked.mimeType)
      setGroupImageUrl(url)
    } catch (e) {
      showAlert('Upload failed', e.message)
    }
    setUploadingImage(false)
  }

  async function removeGroupImage() {
    try {
      await removeGroupImageFile(group.id)
      setGroupImageUrl(null)
      setSettingsModal(false)
    } catch (e) {}
  }

  async function saveGroupName() {
    if (!editNameInput.trim() || editNameInput.trim() === groupName) {
      setSettingsModal(false)
      return
    }
    setSavingName(true)
    const { error } = await supabase.from('groups').update({ name: editNameInput.trim() }).eq('id', group.id)
    setSavingName(false)
    if (error) return showAlert('Error', error.message)
    setGroupName(editNameInput.trim())
    setSettingsModal(false)
  }

  async function handleDeleteGroup() {
    setSettingsModal(false)
    const doDelete = async () => {
      const { data: profile } = await supabase.from('profiles').select('name').eq('id', user.id).single()
      const actorName = profile?.name || 'Someone'
      const { data: memberData } = await supabase.from('group_members').select('user_id').eq('group_id', group.id)
      const logRows = (memberData || []).map(m => ({
        user_id: m.user_id,
        type: 'group_deleted',
        title: m.user_id === user.id ? `You deleted group "${groupName}"` : `${actorName} deleted group "${groupName}"`,
        subtitle: null,
        amount: null,
        group_id: null,
        expense_id: null,
      }))
      if (logRows.length > 0) await supabase.from('activity_log').insert(logRows)

      const { data: expData } = await supabase.from('expenses').select('id').eq('group_id', group.id)
      const expIds = (expData || []).map(e => e.id)
      if (expIds.length > 0) {
        await supabase.from('payments').delete().in('expense_id', expIds)
        await supabase.from('expense_splits').delete().in('expense_id', expIds)
        await supabase.from('expenses').delete().eq('group_id', group.id)
      }
      // Delete any unattributed payments tagged to this group
      await supabase.from('payments').delete().eq('group_id', group.id)
      await supabase.from('group_members').delete().eq('group_id', group.id)
      const { error } = await supabase.from('groups').delete().eq('id', group.id)
      if (error) showAlert('Could not delete group', error.message)
      else navigation.goBack()
    }

    if (expenses.length === 0) {
      doDelete()
      return
    }

    setTimeout(() => {
      showAlert('Delete Group', `"${groupName}" has ${expenses.length} expense${expenses.length === 1 ? '' : 's'}. Deleting it will remove all expenses and debts permanently.`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: doDelete },
      ])
    }, 400)
  }

  async function openAddMember() {
    const { data } = await supabase
      .from('friendships')
      .select('friend:friend_id(id, name, email), user:user_id(id, name, email)')
      .or(`user_id.eq.${user.id},friend_id.eq.${user.id}`)
      .eq('status', 'accepted')

    const memberIds = members.map(m => m?.id)
    const allFriends = (data || []).map(f =>
      f.user?.id === user.id ? f.friend : f.user
    )
    const notInGroup = allFriends.filter(f => f && !memberIds.includes(f.id))

    if (notInGroup.length === 0) {
      return showAlert('No friends to add', 'All your friends are already in this group.')
    }

    setFriends(notInGroup)
    setModalVisible(true)
  }

  async function addMember(friend) {
    setAdding(true)
    const { error } = await supabase.from('group_members').insert({ group_id: group.id, user_id: friend.id })
    setAdding(false)
    if (error) return showAlert('Error', error.message)

    const { data: profile } = await supabase.from('profiles').select('name').eq('id', user.id).single()
    const actorName = profile?.name || 'Someone'
    await supabase.from('activity_log').insert([
      { user_id: user.id, type: 'member_added', title: `You added ${friend.name} to "${groupName}"`, subtitle: groupName, group_id: group.id },
      { user_id: friend.id, type: 'member_added', title: `${actorName} added you to "${groupName}"`, subtitle: groupName, group_id: group.id },
    ])

    setMembers(prev => {
      if (prev.find(m => m.id === friend.id)) return prev
      return [...prev, { id: friend.id, name: friend.name }]
    })
    setFriends(prev => prev.filter(f => f.id !== friend.id))
    setModalVisible(false)
  }

  const totalSpent = expenses.reduce((sum, e) => sum + parseFloat(e.amount), 0)
  const pendingCount = expenses.filter(e => !e._allSettled).length
  const settledCount = expenses.filter(e => e._allSettled).length

  const filteredExpenses = filter === 'pending'
    ? expenses.filter(e => !e._allSettled)
    : filter === 'settled'
      ? expenses.filter(e => e._allSettled)
      : expenses

  const renderExpense = ({ item }) => {
    const catColor = themeCatColors[item.category] || themeCatColors.Other
    const isSettled = item._allSettled
    const dateStr = new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    return (
      <TouchableOpacity
        style={styles.expenseCard}
        onPress={() => setSelectedExpense(item)}
        activeOpacity={0.7}
      >
        <View style={[styles.catIconBox, { backgroundColor: catColor.bg }]}>
          <View style={[styles.categoryDot, { backgroundColor: catColor.dot }]} />
        </View>
        <View style={styles.expenseInfo}>
          <Text style={styles.expenseDesc} numberOfLines={1}>{item.description}</Text>
          <Text style={styles.expenseSub}>
            {item.profiles?.name} · {dateStr}
          </Text>
        </View>
        <View style={styles.expenseRight}>
          <Text style={styles.expenseAmount}>{fmt(item.amount)}</Text>
          <View style={[styles.statusBadge, { backgroundColor: isSettled ? colors.settledBg : colors.pendingBg }]}>
            <Text style={[styles.statusText, { color: isSettled ? colors.settled : colors.pending }]}>
              {isSettled ? 'Settled' : 'Pending'}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    )
  }

  const ListHeader = () => (
    <>
      {/* Compact group header */}
      <View style={styles.groupHero}>
        <TouchableOpacity onPress={pickGroupImage} style={styles.groupAvatarWrapper} activeOpacity={0.8}>
          {uploadingImage
            ? <View style={styles.groupAvatar}><ActivityIndicator color={colors.primary} size="small" /></View>
            : groupImageUrl
              ? <Image source={{ uri: groupImageUrl }} style={styles.groupAvatarImg} />
              : <View style={styles.groupAvatar}>
                  <Text style={styles.groupAvatarText}>{groupName?.[0]?.toUpperCase()}</Text>
                </View>
          }
          <View style={styles.groupAvatarEdit}>
            <Ionicons name="camera" size={10} color={colors.white} />
          </View>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.groupHeroName}>{groupName}</Text>
          <Text style={styles.groupHeroSub}>{members.length} {members.length === 1 ? 'member' : 'members'}</Text>
        </View>
        {/* Members avatars inline */}
        <View style={styles.memberAvatarsRow}>
          {members.slice(0, 4).map((m, i) => (
            <View key={m?.id} style={[styles.memberAvatarStack, { marginLeft: i === 0 ? 0 : -8 }]}>
              <Text style={styles.memberAvatarStackText}>{m?.name?.[0]?.toUpperCase()}</Text>
            </View>
          ))}
          {members.length > 4 && (
            <View style={[styles.memberAvatarStack, { marginLeft: -8, backgroundColor: colors.surface }]}>
              <Text style={[styles.memberAvatarStackText, { fontSize: 9 }]}>+{members.length - 4}</Text>
            </View>
          )}
          <TouchableOpacity onPress={openAddMember} style={styles.addMemberIconBtn}>
            <Ionicons name="add" size={14} color={colors.primary} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Summary bar */}
      <View style={styles.summaryCard}>
        <TouchableOpacity style={styles.summaryItem} onPress={() => setFilter('all')} activeOpacity={0.7}>
          <Text style={styles.summaryValue}>{fmt(totalSpent)}</Text>
          <View style={[styles.summaryLabelWrap, filter === 'all' && styles.summaryLabelWrapActive]}>
            <Text style={[styles.summaryLabel, filter === 'all' && styles.summaryLabelActive]}>Total</Text>
          </View>
        </TouchableOpacity>
        <View style={styles.summarySep} />
        <TouchableOpacity style={styles.summaryItem} onPress={() => setFilter(filter === 'pending' ? 'all' : 'pending')} activeOpacity={0.7}>
          <Text style={[styles.summaryValue, { color: colors.pending }]}>{pendingCount}</Text>
          <View style={[styles.summaryLabelWrap, filter === 'pending' && styles.summaryLabelWrapActive]}>
            <Text style={[styles.summaryLabel, filter === 'pending' && styles.summaryLabelActive]}>Pending</Text>
          </View>
        </TouchableOpacity>
        <View style={styles.summarySep} />
        <TouchableOpacity style={styles.summaryItem} onPress={() => setFilter(filter === 'settled' ? 'all' : 'settled')} activeOpacity={0.7}>
          <Text style={[styles.summaryValue, { color: colors.settled }]}>{settledCount}</Text>
          <View style={[styles.summaryLabelWrap, filter === 'settled' && styles.summaryLabelWrapActive]}>
            <Text style={[styles.summaryLabel, filter === 'settled' && styles.summaryLabelActive]}>Settled</Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* Expenses section header */}
      <View style={styles.expensesHeader}>
        <Text style={styles.expensesTitle}>
          {filter === 'pending' ? 'Pending' : filter === 'settled' ? 'Settled' : 'Expenses'}
        </Text>
        <Text style={styles.expensesCount}>{filteredExpenses.length}</Text>
      </View>
    </>
  )

  return (
    <View style={styles.container}>
      {loading
        ? <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 80 }} />
        : <FlatList
            data={filteredExpenses}
            keyExtractor={i => i.id}
            renderItem={renderExpense}
            ListHeaderComponent={<ListHeader />}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={styles.empty}>
                <View style={styles.emptyIconBox}>
                  <Ionicons name="receipt-outline" size={32} color={colors.primary} />
                </View>
                <Text style={styles.emptyTitle}>No expenses yet</Text>
                <Text style={styles.emptySubText}>Tap + to add your first expense</Text>
              </View>
            }
          />
      }

      {/* Pinned bottom button */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + spacing.sm }]}>
        <TouchableOpacity
          style={styles.addExpenseBtn}
          onPress={() => navigation.navigate('AddExpense', { group: { ...group, name: groupName, image_url: groupImageUrl }, members })}
          activeOpacity={0.85}
          accessibilityLabel="Add expense"
        >
          <Ionicons name="add" size={20} color={colors.white} />
          <Text style={styles.addExpenseBtnText}>Add Expense</Text>
        </TouchableOpacity>
      </View>

      {/* Add Member Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Add Member</Text>
            {friends.map(f => (
              <TouchableOpacity
                key={f.id}
                style={styles.friendRow}
                onPress={() => addMember(f)}
                disabled={adding}
                activeOpacity={0.7}
              >
                <View style={styles.friendAvatar}>
                  <Text style={styles.friendAvatarText}>{f.name?.[0]?.toUpperCase()}</Text>
                </View>
                <View style={styles.friendInfo}>
                  <Text style={styles.friendName}>{f.name}</Text>
                  <Text style={styles.friendEmail}>{f.email}</Text>
                </View>
                <Ionicons name="add-circle-outline" size={22} color={colors.primary} />
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setModalVisible(false)}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Settings Modal */}
      <Modal visible={settingsModal} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={[styles.modal, { paddingBottom: 40 }]}>
            <View style={styles.modalHandle} />

            {/* Avatar + name inline */}
            <View style={styles.settingsHeader}>
              <TouchableOpacity onPress={pickGroupImage} style={styles.settingsAvatarWrap} activeOpacity={0.8}>
                {uploadingImage
                  ? <View style={styles.settingsAvatar}><ActivityIndicator color={colors.primary} size="small" /></View>
                  : groupImageUrl
                    ? <Image source={{ uri: groupImageUrl }} style={styles.settingsAvatarImg} />
                    : <View style={styles.settingsAvatar}>
                        <Text style={styles.settingsAvatarText}>{groupName?.[0]?.toUpperCase()}</Text>
                      </View>
                }
                <View style={styles.settingsAvatarBadge}>
                  <Ionicons name="camera" size={10} color={colors.white} />
                </View>
              </TouchableOpacity>
              <View style={{ flex: 1 }}>
                <Text style={styles.settingsGroupName}>{groupName}</Text>
                <Text style={styles.settingsGroupSub}>Tap photo to change</Text>
              </View>
              {groupImageUrl && (
                <TouchableOpacity onPress={removeGroupImage} style={styles.removePhotoPill}>
                  <Ionicons name="close" size={12} color={colors.textSecondary} />
                  <Text style={styles.removePhotoPillText}>Remove</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Name input */}
            <View style={styles.nameFieldWrap}>
              <TextInput
                style={styles.nameField}
                value={editNameInput}
                onChangeText={setEditNameInput}
                returnKeyType="done"
                onSubmitEditing={saveGroupName}
                onBlur={saveGroupName}
                placeholder="Group name"
                placeholderTextColor="rgba(255,255,255,0.25)"
                accessibilityLabel="Group name"
              />
            </View>

            {/* Footer */}
            <View style={styles.settingsFooterRow}>
              {groupCreatedBy === user.id && (
                <TouchableOpacity style={styles.deleteBtn} onPress={handleDeleteGroup}>
                  <Text style={styles.deleteText}>Delete</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.cancelPill} onPress={() => setSettingsModal(false)}>
                <Text style={styles.cancelPillText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.saveBtn, !editNameInput.trim() && { opacity: 0.4 }]} onPress={saveGroupName} disabled={savingName || !editNameInput.trim()}>
                {savingName
                  ? <ActivityIndicator color={colors.white} size="small" />
                  : <Text style={styles.saveBtnText}>Save</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <ExpenseDetailModal
        visible={!!selectedExpense}
        expense={selectedExpense}
        currentUserId={user.id}
        groupId={group.id}
        groupName={groupName}
        groupCreatedBy={groupCreatedBy}
        group={group}
        members={members}
        onClose={() => setSelectedExpense(null)}
        onSettled={fetchData}
        onDeleted={fetchData}
        navigation={navigation}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },

  listContent: { paddingBottom: 80 },

  // Group hero — compact horizontal
  groupHero: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    backgroundColor: '#162840',
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)',
    marginBottom: spacing.sm,
  },
  groupAvatarWrapper: { position: 'relative' },
  groupAvatar: {
    width: 44, height: 44, borderRadius: radius.md,
    backgroundColor: 'rgba(0,201,177,0.15)',
    borderWidth: 1.5, borderColor: 'rgba(0,201,177,0.3)',
    justifyContent: 'center', alignItems: 'center',
  },
  groupAvatarImg: { width: 44, height: 44, borderRadius: radius.md },
  groupAvatarText: { color: colors.primary, fontSize: 18, fontWeight: '800' },
  groupAvatarEdit: {
    position: 'absolute', bottom: -3, right: -3,
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: colors.accent,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1.5, borderColor: '#162840',
  },
  groupHeroName: { fontSize: 16, fontWeight: '800', color: colors.text },
  groupHeroSub: { fontSize: 11, color: colors.textMuted, marginTop: 1 },

  memberAvatarsRow: { flexDirection: 'row', alignItems: 'center' },
  memberAvatarStack: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: 'rgba(0,201,177,0.2)',
    borderWidth: 1.5, borderColor: '#162840',
    justifyContent: 'center', alignItems: 'center',
  },
  memberAvatarStackText: { fontSize: 10, fontWeight: '800', color: colors.primary },
  addMemberIconBtn: {
    width: 26, height: 26, borderRadius: 13, marginLeft: spacing.xs,
    backgroundColor: colors.primaryLight,
    borderWidth: 1, borderColor: colors.primary,
    justifyContent: 'center', alignItems: 'center',
  },

  // Summary card
  summaryCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.background,
    borderWidth: 1, borderColor: colors.border,
    marginHorizontal: spacing.lg,
    borderRadius: radius.lg, paddingVertical: spacing.sm + 2, ...shadow.sm,
    marginBottom: spacing.xs,
  },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryValue: { fontSize: 16, fontWeight: '800', color: colors.text },
  summaryLabel: { fontSize: 10, color: colors.textMuted, marginTop: 1, fontWeight: '500' },
  summaryLabelActive: { color: colors.primary, fontWeight: '700' },
  summaryLabelWrap: { marginTop: 2, paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.full },
  summaryLabelWrapActive: { backgroundColor: colors.primaryLight },
  summarySep: { width: 1, height: 24, backgroundColor: colors.border },

  // Expenses section header
  expensesHeader: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    marginHorizontal: spacing.lg, marginTop: spacing.sm, marginBottom: spacing.xs,
  },
  expensesTitle: { ...typography.bodyBold },
  expensesCount: {
    fontSize: 12, fontWeight: '700', color: colors.primary,
    backgroundColor: colors.primaryLight, paddingHorizontal: 8,
    paddingVertical: 2, borderRadius: radius.full,
  },

  // Expense cards
  expenseCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: spacing.sm + 2, paddingHorizontal: spacing.md,
    backgroundColor: colors.background, borderRadius: radius.lg,
    marginHorizontal: spacing.lg, marginBottom: spacing.sm, ...shadow.sm,
  },
  catIconBox: {
    width: 38, height: 38, borderRadius: radius.md,
    justifyContent: 'center', alignItems: 'center',
  },
  categoryDot: { width: 10, height: 10, borderRadius: radius.full },
  expenseInfo: { flex: 1 },
  expenseDesc: { ...typography.bodyBold },
  expenseSub: { ...typography.caption, marginTop: 2 },
  expenseRight: { alignItems: 'flex-end', gap: 4 },
  expenseAmount: { ...typography.bodyBold, fontSize: 15 },
  statusBadge: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.full },
  statusText: { fontSize: 11, fontWeight: '600' },

  // Empty state
  empty: { alignItems: 'center', marginTop: 40, gap: spacing.sm, paddingHorizontal: spacing.xl },
  emptyIconBox: {
    width: 72, height: 72, borderRadius: radius.full,
    backgroundColor: colors.primaryLight, justifyContent: 'center', alignItems: 'center',
    marginBottom: spacing.sm,
  },
  emptyTitle: { ...typography.h3, color: colors.text },
  emptySubText: { ...typography.caption, textAlign: 'center' },

  // Bottom bar
  bottomBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: spacing.lg, paddingTop: spacing.sm,
    backgroundColor: colors.surface,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  addExpenseBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs,
    backgroundColor: colors.primary, borderRadius: radius.full,
    paddingVertical: spacing.md, ...shadow.sm,
  },
  addExpenseBtnText: { color: colors.white, fontWeight: '700', fontSize: 15 },

  // Modals
  modalOverlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  modal: {
    backgroundColor: colors.background, borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl, padding: spacing.lg,
  },
  modalHandle: {
    width: 40, height: 4, borderRadius: radius.full,
    backgroundColor: colors.border, alignSelf: 'center', marginBottom: spacing.lg,
  },
  modalTitle: { ...typography.h3, marginBottom: spacing.md },
  friendRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  friendAvatar: {
    width: 42, height: 42, borderRadius: radius.full,
    backgroundColor: colors.primaryLight, justifyContent: 'center', alignItems: 'center',
  },
  friendAvatarText: { color: colors.primary, fontWeight: '700', fontSize: 16 },
  friendInfo: { flex: 1 },
  friendName: { ...typography.bodyBold },
  friendEmail: { ...typography.caption, marginTop: 2 },
  cancelBtn: { padding: spacing.sm, marginTop: spacing.sm },
  cancelText: { textAlign: 'center', color: colors.textSecondary, fontSize: 15 },

  // Settings modal
  settingsLabel: { fontSize: 12, fontWeight: '700', color: colors.textMuted, marginBottom: spacing.xs, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: {
    backgroundColor: colors.surface, borderRadius: radius.md,
    padding: spacing.md, fontSize: 15, color: colors.text,
    marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border,
  },
  button: {
    backgroundColor: colors.primary, borderRadius: radius.md,
    padding: spacing.md, alignItems: 'center',
  },
  buttonText: { color: colors.white, fontWeight: '700', fontSize: 16 },
  settingsDivider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.md },

  // Settings modal
  settingsHeader: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.md,
  },
  settingsAvatarWrap: { position: 'relative' },
  settingsAvatar: {
    width: 52, height: 52, borderRadius: radius.lg,
    backgroundColor: 'rgba(0,201,177,0.15)',
    borderWidth: 1.5, borderColor: 'rgba(0,201,177,0.3)',
    justifyContent: 'center', alignItems: 'center',
  },
  settingsAvatarImg: { width: 52, height: 52, borderRadius: radius.lg },
  settingsAvatarText: { color: colors.primary, fontSize: 20, fontWeight: '800' },
  settingsAvatarBadge: {
    position: 'absolute', bottom: -2, right: -2,
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: colors.accent, justifyContent: 'center', alignItems: 'center',
    borderWidth: 1.5, borderColor: colors.background,
  },
  settingsGroupName: { fontSize: 17, fontWeight: '800', color: colors.text },
  settingsGroupSub: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  removePhotoPill: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: spacing.sm, paddingVertical: 5, borderRadius: radius.full,
  },
  removePhotoPillText: { fontSize: 11, color: colors.textSecondary, fontWeight: '600' },
  nameFieldWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: radius.lg, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: spacing.md, marginBottom: spacing.md,
  },
  nameField: {
    flex: 1, fontSize: 15, color: colors.text,
    paddingVertical: spacing.md,
  },
  settingsFooterRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  deleteBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    backgroundColor: colors.pendingBg, paddingVertical: spacing.sm + 2,
    borderRadius: radius.full, borderWidth: 1, borderColor: colors.pendingBg,
  },
  deleteText: { fontSize: 13, fontWeight: '700', color: colors.pending },
  cancelPill: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)', paddingVertical: spacing.sm + 2,
    borderRadius: radius.full, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  cancelPillText: { fontSize: 14, fontWeight: '600', color: colors.textSecondary },
  saveBtn: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.primary, paddingVertical: spacing.sm + 2,
    borderRadius: radius.full,
  },
  saveBtnText: { fontSize: 14, fontWeight: '700', color: colors.white },

})
