import { showAlert } from '../../utils/alert'
import React, { useEffect, useState, useRef } from 'react'
import {
  View, Text, TextInput, StyleSheet, TouchableOpacity,
  ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform, Modal, Image, Keyboard
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { pickImage } from '../../utils/pickImage'
import { supabase } from '../../lib/supabase'
import { logActivity } from '../../lib/activityLog'
import { useAuth } from '../../hooks/useAuth'
import { useCurrency } from '../../hooks/useCurrency'
import { detectCategory, scanReceipt as scanReceiptAI } from '../../services/claudeService'
import { CATEGORIES } from '../../constants/app'
import { colors, categoryColors, spacing, radius, shadow, typography } from '../../constants/theme'

export default function AddExpenseScreen({ route, navigation }) {
  const { group, members: passedMembers, expense: editingExpense } = route.params || {}
  const { user } = useAuth()
  const { fmt, symbol } = useCurrency()
  const [description, setDescription] = useState(editingExpense?.description || '')
  const [amount, setAmount] = useState(editingExpense?.amount?.toString() || '')
  const [category, setCategory] = useState(editingExpense?.category || 'Food')
  const [members, setMembers] = useState([])
  const [selectedMembers, setSelectedMembers] = useState([])
  const [splitMode, setSplitMode] = useState('equal') // 'equal' | 'custom'
  const [customAmounts, setCustomAmounts] = useState({}) // { userId: '25.00' }
  const [saving, setSaving] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [detectingCategory, setDetectingCategory] = useState(false)
  const categoryDebounce = useRef(null)
  const userPickedCategory = useRef(false)
  const [receiptItems, setReceiptItems] = useState([])
  const [receiptExpanded, setReceiptExpanded] = useState(true)
  const [date, setDate] = useState(editingExpense?.date ? new Date(editingExpense.date) : new Date())
  const [addFriendModal, setAddFriendModal] = useState(false)
  const [friendsNotInGroup, setFriendsNotInGroup] = useState([])
  const [addingFriendId, setAddingFriendId] = useState(null)

  useEffect(() => {
    navigation.setOptions({ title: editingExpense ? 'Edit Expense' : 'Add Expense' })
    loadMembers()
  }, [])

  async function loadMembers() {
    // Resolve group_id from either the passed group or the editing expense
    const groupId = group?.id || editingExpense?.group_id
    if (!groupId) {
      // No group context — just load from splits if editing
      if (editingExpense) await loadFromSplitsOnly()
      return
    }

    const { data } = await supabase
      .from('group_members')
      .select('profiles:user_id(id, name, avatar_url)')
      .eq('group_id', groupId)
    const list = (data || []).map(m => m.profiles).filter(Boolean)
    setMembers(list)

    if (editingExpense) {
      const { data: splits } = await supabase
        .from('expense_splits')
        .select('user_id, amount')
        .eq('expense_id', editingExpense.id)
      const splitIds = (splits || []).map(s => s.user_id)
      setSelectedMembers(splitIds.length > 0 ? splitIds : list.map(m => m.id))

      const amounts = {}
      ;(splits || []).forEach(s => { amounts[s.user_id] = parseFloat(s.amount).toFixed(2) })
      setCustomAmounts(amounts)

      if (splits && splits.length > 1) {
        const values = splits.map(s => parseFloat(s.amount))
        const allEqual = values.every(v => Math.abs(v - values[0]) < 0.01)
        setSplitMode(allEqual ? 'equal' : 'custom')
      }
    } else {
      setSelectedMembers(list.map(m => m.id))
    }
  }

  async function loadFromSplitsOnly() {
    const { data: splits } = await supabase
      .from('expense_splits')
      .select('user_id, amount, profiles:user_id(id, name, avatar_url)')
      .eq('expense_id', editingExpense.id)

    const list = (splits || []).map(s => s.profiles).filter(Boolean)
    setMembers(list)
    const splitIds = list.map(m => m.id)
    setSelectedMembers(splitIds)

    const amounts = {}
    ;(splits || []).forEach(s => { amounts[s.user_id] = parseFloat(s.amount).toFixed(2) })
    setCustomAmounts(amounts)

    if (splits && splits.length > 1) {
      const values = splits.map(s => parseFloat(s.amount))
      const allEqual = values.every(v => Math.abs(v - values[0]) < 0.01)
      setSplitMode(allEqual ? 'equal' : 'custom')
    }
  }

  async function openAddFriendToGroup() {
    const { data } = await supabase
      .from('friendships')
      .select('friend:friend_id(id, name, email), user:user_id(id, name, email)')
      .or(`user_id.eq.${user.id},friend_id.eq.${user.id}`)
      .eq('status', 'accepted')

    const memberIds = members.map(m => m.id)
    const allFriends = (data || []).map(f => f.user?.id === user.id ? f.friend : f.user)
    const notInGroup = allFriends.filter(f => f && !memberIds.includes(f.id))

    if (notInGroup.length === 0) {
      return showAlert('No friends to add', 'All your friends are already in this group. Add them from the Friends tab first.')
    }
    setFriendsNotInGroup(notInGroup)
    setAddFriendModal(true)
  }

  async function addFriendToGroup(friend) {
    setAddingFriendId(friend.id)
    const { error } = await supabase
      .from('group_members')
      .insert({ group_id: group.id, user_id: friend.id })
    setAddingFriendId(null)

    if (error && !error.message.includes('duplicate')) {
      return showAlert('Could not add to group', error.message)
    }

    const { data: profile } = await supabase.from('profiles').select('name').eq('id', user.id).single()
    const actorName = profile?.name || 'Someone'
    await supabase.from('activity_log').insert([
      { user_id: user.id, type: 'member_added', title: `You added ${friend.name} to "${group.name}"`, subtitle: group.name, group_id: group.id },
      { user_id: friend.id, type: 'member_added', title: `${actorName} added you to "${group.name}"`, subtitle: group.name, group_id: group.id },
    ])

    const newMember = { id: friend.id, name: friend.name }
    setMembers(prev => prev.find(m => m.id === friend.id) ? prev : [...prev, newMember])
    setSelectedMembers(prev => prev.includes(friend.id) ? prev : [...prev, friend.id])
    setFriendsNotInGroup(prev => prev.filter(f => f.id !== friend.id))
    setAddFriendModal(false)
  }

  function toggleMember(id) {
    setSelectedMembers(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  function setCustomAmount(uid, val) {
    setCustomAmounts(prev => ({ ...prev, [uid]: val }))
  }

  function getEqualShare() {
    const total = parseFloat(amount) || 0
    const count = selectedMembers.length || 1
    return Math.round((total / count) * 100) / 100
  }

  function customTotal() {
    return selectedMembers.reduce((sum, uid) => {
      return sum + (parseFloat(customAmounts[uid]) || 0)
    }, 0)
  }

  async function autoDetectCategory(text) {
    if (!text || text.trim().length < 3) return
    setDetectingCategory(true)
    try {
      const detected = await detectCategory(text)
      if (detected) setCategory(detected)
    } catch (_) {}
    setDetectingCategory(false)
  }

  async function scanReceipt() {
    setScanning(true)
    try {
      const picked = await pickImage()
      if (!picked) { setScanning(false); return }

      // For web we get a blob URI — need to convert to base64 for the AI service
      let base64, mimeType
      if (Platform.OS === 'web') {
        const response = await fetch(picked.uri)
        const blob = await response.blob()
        mimeType = blob.type || 'image/jpeg'
        base64 = await new Promise((res) => {
          const reader = new FileReader()
          reader.onloadend = () => res(reader.result.split(',')[1])
          reader.readAsDataURL(blob)
        })
      } else {
        // Native: re-launch with base64 enabled
        const ImagePicker = await import('expo-image-picker')
        const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.5, base64: true })
        if (result.canceled) { setScanning(false); return }
        base64 = result.assets[0].base64
        mimeType = 'image/jpeg'
      }

      const parsed = await scanReceiptAI(base64, mimeType)
      if (parsed.description) setDescription(parsed.description)
      if (parsed.amount) setAmount(String(parseFloat(parsed.amount).toFixed(2)))
      if (parsed.category && CATEGORIES.includes(parsed.category)) setCategory(parsed.category)
      if (parsed.date) { const d = new Date(parsed.date); if (!isNaN(d)) setDate(d) }
      if (parsed.items?.length > 0) { setReceiptItems(parsed.items); setReceiptExpanded(true) }
    } catch (e) {
      console.log('scan error:', e.message)
      showAlert('Could not scan receipt', 'Try entering details manually.')
    }
    setScanning(false)
  }

  async function saveExpense() {
    if (!description.trim()) return showAlert('Error', 'Please enter a description')
    if (!amount || isNaN(parseFloat(amount))) return showAlert('Error', 'Please enter a valid amount')

    const toSplit = selectedMembers.length > 0 ? selectedMembers : [user.id]
    const totalAmount = parseFloat(amount)

    // Validate custom amounts add up
    if (splitMode === 'custom') {
      const sum = customTotal()
      if (Math.abs(sum - totalAmount) > 0.01) {
        return showAlert('Amounts don\'t add up', `Custom amounts total ${fmt(sum)} but expense is ${fmt(totalAmount)}. They must match.`)
      }
    }

    setSaving(true)
    const count = toSplit.length
    const share = Math.round((totalAmount / count) * 100) / 100
    // Last person absorbs any cent-level remainder so splits sum exactly to total
    const lastShare = Math.round((totalAmount - share * (count - 1)) * 100) / 100

    const splits = toSplit.map((uid, idx) => ({
      user_id: uid,
      amount: splitMode === 'custom'
        ? (parseFloat(customAmounts[uid]) || share)
        : idx === count - 1 ? lastShare : share,
      is_settled: uid === user.id
    }))

    if (editingExpense) {
      const { error } = await supabase.from('expenses').update({
        description: description.trim(), amount: totalAmount, category
      }).eq('id', editingExpense.id)

      if (error) { setSaving(false); return showAlert('Error', error.message) }

      await supabase.from('expense_splits').delete().eq('expense_id', editingExpense.id)
      await supabase.from('expense_splits').insert(
        splits.map(s => ({ ...s, expense_id: editingExpense.id }))
      )
      setSaving(false)
      navigation.goBack()
      return
    }

    const { data: expense, error } = await supabase
      .from('expenses')
      .insert({
        description: description.trim(), amount: totalAmount, category,
        paid_by: user.id, group_id: group?.id || null,
        date: date.toISOString()
      })
      .select().single()

    if (error) { setSaving(false); return showAlert('Error', 'Could not save expense.') }

    await supabase.from('expense_splits').insert(
      splits.map(s => ({ ...s, expense_id: expense.id }))
    )

    if (receiptItems.length > 0) {
      await supabase.from('expense_items').insert(
        receiptItems.map(item => ({
          expense_id: expense.id,
          name: item.name,
          amount: parseFloat(item.amount),
        }))
      )
    }

    const { data: profile } = await supabase.from('profiles').select('name').eq('id', user.id).single()
    const actorName = profile?.name || 'Someone'
    await logActivity({
      actorId: user.id,
      type: 'expense_added',
      titleYou: `You added "${description.trim()}"`,
      titleOther: `${actorName} added "${description.trim()}"`,
      subtitle: group?.name || 'Personal',
      amount: totalAmount,
      groupId: group?.id || null,
      expenseId: expense.id,
    })

    setSaving(false)
    navigation.goBack()
  }

  const catColor = categoryColors[category] || categoryColors.Other
  const totalAmount = parseFloat(amount) || 0
  const remaining = totalAmount - customTotal()

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
        onScrollBeginDrag={Keyboard.dismiss}
      >
        {/* Description + Amount card */}
        <View style={styles.amountCard}>
          <TouchableOpacity style={styles.scanBtn} onPress={scanReceipt} disabled={scanning}>
            {scanning
              ? <ActivityIndicator size="small" color={colors.primary} />
              : <Ionicons name="receipt-outline" size={16} color={colors.primary} />
            }
            <Text style={styles.scanBtnText}>{scanning ? 'Scanning...' : 'Scan Receipt'}</Text>
          </TouchableOpacity>
          <View style={styles.underline} />
          <View style={styles.fieldRow}>
            <Ionicons name="reader-outline" size={20} color="rgba(255,255,255,0.35)" style={styles.fieldIcon} />
            <TextInput
              style={styles.underlineInput}
              placeholder="Enter a description"
              placeholderTextColor="rgba(255,255,255,0.25)"
              value={description}
              onChangeText={text => {
                setDescription(text)
                if (!userPickedCategory.current) {
                  if (categoryDebounce.current) clearTimeout(categoryDebounce.current)
                  categoryDebounce.current = setTimeout(() => autoDetectCategory(text), 800)
                }
              }}
              accessibilityLabel="Expense description"
            />
          </View>
          <View style={styles.underline} />
          <View style={styles.fieldRow}>
            <Text style={styles.currencyIcon}>{symbol}</Text>
            <TextInput
              style={[styles.underlineInput, amount ? styles.amountText : styles.amountPlaceholder]}
              placeholder="0.00"
              placeholderTextColor="rgba(255,255,255,0.25)"
              keyboardType="decimal-pad"
              value={amount}
              onChangeText={setAmount}
              returnKeyType="done"
              onSubmitEditing={() => Keyboard.dismiss()}
              accessibilityLabel="Expense amount"
            />
          </View>
        </View>

        {/* Receipt items breakdown */}
        {receiptItems.length > 0 && (
          <View style={styles.receiptItemsCard}>
            <TouchableOpacity style={styles.receiptItemsHeader} onPress={() => setReceiptExpanded(p => !p)}>
              <Ionicons name="receipt-outline" size={13} color={colors.textSecondary} />
              <Text style={styles.receiptItemsTitle}>Receipt Items ({receiptItems.length})</Text>
              <Ionicons name={receiptExpanded ? 'chevron-up' : 'chevron-down'} size={14} color={colors.textMuted} />
            </TouchableOpacity>
            {receiptExpanded && (
              <ScrollView style={{ maxHeight: 200 }} nestedScrollEnabled showsVerticalScrollIndicator>
                {receiptItems.map((item, idx) => (
                  <View key={idx} style={[styles.receiptItemRow, idx < receiptItems.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border }]}>
                    <Text style={styles.receiptItemName} numberOfLines={1}>{item.name}</Text>
                    <Text style={styles.receiptItemAmt}>{fmt(parseFloat(item.amount))}</Text>
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
        )}

        {/* Paid by row */}
        <View style={styles.paidByRow}>
          <Text style={styles.paidByText}>Paid by </Text>
          <View style={styles.paidByChip}><Text style={styles.paidByChipText}>you</Text></View>
          <Text style={styles.paidByText}> on </Text>
          <View style={styles.paidByChip}>
            <Text style={styles.paidByChipText}>
              {date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
            </Text>
          </View>
          <Text style={styles.paidByText}> and split </Text>
          <View style={styles.paidByChip}>
            <Text style={styles.paidByChipText}>
              {splitMode === 'custom' ? 'custom' : 'equally'}
            </Text>
          </View>
        </View>

        <View style={styles.divider} />

        {/* Category */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.xs }}>
          <Text style={styles.sectionLabel}>Category</Text>
          {detectingCategory && <ActivityIndicator size="small" color={colors.accent} />}
        </View>
        <View style={styles.categoryRow}>
          {CATEGORIES.map(cat => {
            const cc = categoryColors[cat] || categoryColors.Other
            const isActive = category === cat
            return (
              <TouchableOpacity
                key={cat}
                style={[styles.categoryChip, isActive && { backgroundColor: cc.bg, borderColor: cc.dot }]}
                onPress={() => { userPickedCategory.current = true; setCategory(cat) }}
              >
                <View style={[styles.catDot, { backgroundColor: cc.dot }]} />
                <Text style={[styles.categoryChipText, isActive && { color: cc.dot, fontWeight: '700' }]}>{cat}</Text>
              </TouchableOpacity>
            )
          })}
        </View>

        {/* Split with */}
        <View style={styles.splitHeader}>
          <Text style={styles.sectionLabel}>Split with</Text>
          {group && members.length > 1 && (
            <TouchableOpacity onPress={openAddFriendToGroup} style={styles.addToGroupBtn}>
              <Ionicons name="person-add-outline" size={13} color={colors.primary} />
              <Text style={styles.addToGroupText}>Add friend to group</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Split mode toggle — only show when 2+ members selected */}
        {selectedMembers.length > 1 && (
          <View style={styles.splitToggle}>
            <TouchableOpacity
              style={[styles.splitToggleBtn, splitMode === 'equal' && styles.splitToggleBtnActive]}
              onPress={() => setSplitMode('equal')}
            >
              <Text style={[styles.splitToggleText, splitMode === 'equal' && styles.splitToggleTextActive]}>
                Equal
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.splitToggleBtn, splitMode === 'custom' && styles.splitToggleBtnActive]}
              onPress={() => setSplitMode('custom')}
            >
              <Text style={[styles.splitToggleText, splitMode === 'custom' && styles.splitToggleTextActive]}>
                Custom
              </Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.membersCard}>
          {members.map((m, idx) => {
            const isSelected = selectedMembers.includes(m.id)
            const isMe = m.id === user.id
            const equalShare = getEqualShare()
            return (
              <View key={m.id} style={[styles.memberRow, idx < members.length - 1 && styles.memberRowBorder]}>
                <TouchableOpacity
                  style={styles.memberLeft}
                  onPress={() => toggleMember(m.id)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.checkbox, isSelected && styles.checkboxActive]}>
                    {isSelected && <Text style={styles.checkmark}>✓</Text>}
                  </View>
                  <View style={styles.memberAvatar}>
                    {m.avatar_url
                      ? <Image source={{ uri: m.avatar_url }} style={styles.memberAvatarImg} />
                      : <Text style={styles.memberAvatarText}>{m.name?.[0]?.toUpperCase()}</Text>
                    }
                  </View>
                  <Text style={styles.memberName}>{m.name}{isMe ? ' (You)' : ''}</Text>
                </TouchableOpacity>

                {isSelected && (
                  splitMode === 'custom' ? (
                    <View style={styles.customAmountBox}>
                      <Text style={styles.customAmountCurrency}>{symbol}</Text>
                      <TextInput
                        style={styles.customAmountInput}
                        value={customAmounts[m.id] || ''}
                        onChangeText={val => setCustomAmount(m.id, val)}
                        keyboardType="decimal-pad"
                        placeholder="0.00"
                        placeholderTextColor={colors.textMuted}
                      />
                    </View>
                  ) : (
                    <Text style={styles.equalShare}>{fmt(parseFloat(equalShare))}</Text>
                  )
                )}
              </View>
            )
          })}

          {members.length <= 1 && (
            <TouchableOpacity style={styles.noFriendsRow} onPress={openAddFriendToGroup}>
              <Ionicons name="person-add-outline" size={16} color={colors.primary} />
              <Text style={styles.noFriendsText}>Tap to add a friend and split this expense</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Custom split remaining indicator */}
        {splitMode === 'custom' && selectedMembers.length > 1 && totalAmount > 0 && (
          <View style={[styles.remainingRow, { backgroundColor: Math.abs(remaining) < 0.01 ? colors.settledBg : colors.pendingBg }]}>
            <Text style={[styles.remainingText, { color: Math.abs(remaining) < 0.01 ? colors.settled : colors.pending }]}>
              {Math.abs(remaining) < 0.01
                ? '✓ Amounts add up perfectly'
                : remaining > 0
                  ? `${fmt(remaining)} still unassigned`
                  : `${fmt(Math.abs(remaining))} over total`
              }
            </Text>
          </View>
        )}

        {/* Equal split preview */}
        {splitMode === 'equal' && selectedMembers.length > 1 && totalAmount > 0 && (
          <View style={[styles.splitPreview, { backgroundColor: catColor.bg }]}>
            <Text style={[styles.splitPreviewLabel, { color: catColor.dot }]}>Each person pays</Text>
            <Text style={[styles.splitPreviewAmount, { color: catColor.dot }]}>{fmt(parseFloat(getEqualShare()))}</Text>
          </View>
        )}

        <TouchableOpacity style={[styles.saveBtn, (!description.trim() || !amount) && { opacity: 0.4 }]} onPress={saveExpense} disabled={saving || !description.trim() || !amount} accessibilityLabel="Save expense">
          {saving ? <ActivityIndicator color={colors.white} /> : <Text style={styles.saveBtnText}>Save Expense</Text>}
        </TouchableOpacity>
      </ScrollView>

      {/* Add friend to group modal */}
      <Modal visible={addFriendModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Add friend to group</Text>
            <Text style={styles.modalSubtitle}>They'll be added to this group and you can split with them</Text>
            {friendsNotInGroup.map((f, idx) => (
              <TouchableOpacity
                key={f.id}
                style={[styles.friendRow, idx < friendsNotInGroup.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border }]}
                onPress={() => addFriendToGroup(f)}
                disabled={addingFriendId !== null}
              >
                <View style={styles.friendAvatar}>
                  <Text style={styles.friendAvatarText}>{f.name?.[0]?.toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.friendName}>{f.name}</Text>
                  <Text style={styles.friendEmail}>{f.email}</Text>
                </View>
                {addingFriendId === f.id
                  ? <ActivityIndicator size="small" color={colors.primary} />
                  : <Ionicons name="add-circle-outline" size={22} color={colors.primary} />
                }
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setAddFriendModal(false)}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xxl, gap: spacing.sm },

  amountCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: radius.lg,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: spacing.md,
  },
  scanBtn: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    alignSelf: 'flex-end', paddingVertical: spacing.sm,
  },
  scanBtnText: { color: colors.primary, fontSize: 12, fontWeight: '600' },
  fieldRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  fieldIcon: { width: 22 },
  currencyIcon: { width: 22, fontSize: 18, fontWeight: '700', color: 'rgba(255,255,255,0.4)' },
  underlineInput: { flex: 1, fontSize: 15, color: colors.text },
  amountText: { fontSize: 28, fontWeight: '800', color: colors.white },
  amountPlaceholder: { fontSize: 28, fontWeight: '300', color: 'rgba(255,255,255,0.2)' },
  underline: { height: 1, backgroundColor: 'rgba(255,255,255,0.07)' },
  paidByRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4 },
  paidByText: { ...typography.caption, color: colors.textSecondary },
  paidByChip: { backgroundColor: colors.primaryLight, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  paidByChipText: { color: colors.primary, fontWeight: '700', fontSize: 12 },
  divider: { height: 1, backgroundColor: colors.border },
  sectionLabel: { ...typography.caption, fontWeight: '600', color: colors.textSecondary },
  categoryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  categoryChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: spacing.sm + 2, paddingVertical: 6,
    backgroundColor: colors.surface, borderRadius: radius.full,
    borderWidth: 1, borderColor: colors.border,
  },
  catDot: { width: 7, height: 7, borderRadius: radius.full },
  categoryChipText: { color: colors.textSecondary, fontWeight: '500', fontSize: 12 },
  splitHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  addToGroupBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  addToGroupText: { color: colors.primary, fontSize: 12, fontWeight: '600' },
  splitToggle: {
    flexDirection: 'row', backgroundColor: colors.surface, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, padding: 3,
  },
  splitToggleBtn: { flex: 1, paddingVertical: spacing.xs + 2, alignItems: 'center', borderRadius: radius.sm - 2 },
  splitToggleBtnActive: { backgroundColor: colors.primary },
  splitToggleText: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },
  splitToggleTextActive: { color: colors.white },
  membersCard: {
    backgroundColor: colors.surface, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, overflow: 'hidden',
  },
  memberRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  memberRowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  memberLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1 },
  checkbox: {
    width: 20, height: 20, borderRadius: radius.sm, borderWidth: 2,
    borderColor: colors.border, justifyContent: 'center', alignItems: 'center',
  },
  checkboxActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  checkmark: { color: colors.white, fontWeight: '700', fontSize: 11 },
  memberAvatar: {
    width: 28, height: 28, borderRadius: radius.full,
    backgroundColor: colors.primaryLight, justifyContent: 'center', alignItems: 'center',
    overflow: 'hidden',
  },
  memberAvatarImg: { width: 28, height: 28, borderRadius: radius.full },
  memberAvatarText: { color: colors.primary, fontWeight: '700', fontSize: 11 },
  memberName: { ...typography.body, fontSize: 13, flex: 1 },
  youTag: { fontSize: 10, color: colors.textMuted, fontStyle: 'italic' },
  equalShare: { fontSize: 13, fontWeight: '700', color: colors.primary },
  customAmountBox: {
    flexDirection: 'row', alignItems: 'center',
    borderBottomWidth: 1, borderBottomColor: colors.primary, paddingBottom: 2,
  },
  customAmountCurrency: { fontSize: 12, color: colors.primary, fontWeight: '700', marginRight: 2 },
  customAmountInput: { fontSize: 13, fontWeight: '700', color: colors.primary, minWidth: 50, textAlign: 'right' },
  remainingRow: { borderRadius: radius.md, padding: spacing.sm, alignItems: 'center' },
  remainingText: { fontSize: 12, fontWeight: '600' },
  noFriendsRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    padding: spacing.md, justifyContent: 'center',
  },
  noFriendsText: { color: colors.primary, fontSize: 13, fontWeight: '600' },
  splitPreview: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderRadius: radius.md, padding: spacing.sm + 2,
    backgroundColor: colors.primaryLight,
    borderWidth: 1, borderColor: colors.cardBorder,
  },
  splitPreviewLabel: { fontSize: 12, fontWeight: '600', color: colors.primary },
  splitPreviewAmount: { fontSize: 16, fontWeight: '800', color: colors.primary },
  saveBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingVertical: spacing.md, alignItems: 'center',
    marginTop: spacing.xs, ...shadow.sm,
  },
  saveBtnText: { color: colors.white, fontWeight: '800', fontSize: 15 },
  modalOverlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  modal: {
    backgroundColor: colors.background, borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl, padding: spacing.lg, paddingBottom: 40,
  },
  modalHandle: {
    width: 40, height: 4, borderRadius: radius.full,
    backgroundColor: colors.border, alignSelf: 'center', marginBottom: spacing.lg,
  },
  modalTitle: { ...typography.h3, marginBottom: spacing.xs },
  modalSubtitle: { ...typography.caption, marginBottom: spacing.lg },
  friendRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  friendAvatar: {
    width: 40, height: 40, borderRadius: radius.full,
    backgroundColor: colors.primaryLight, justifyContent: 'center', alignItems: 'center',
  },
  friendAvatarText: { color: colors.primary, fontWeight: '700', fontSize: 15 },
  friendName: { ...typography.bodyBold },
  friendEmail: { ...typography.caption, marginTop: 2 },
  receiptItemsCard: {
    backgroundColor: colors.surface, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, overflow: 'hidden',
  },
  receiptItemsHeader: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  receiptItemsTitle: { flex: 1, fontSize: 12, fontWeight: '600', color: colors.textSecondary },
  receiptItemRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.sm - 2 },
  receiptItemName: { fontSize: 13, color: colors.text, flex: 1 },
  receiptItemAmt: { fontSize: 13, fontWeight: '700', color: colors.primary },
  cancelBtn: { padding: spacing.sm, marginTop: spacing.sm },
  cancelText: { textAlign: 'center', color: colors.textSecondary, fontSize: 15 },
})
