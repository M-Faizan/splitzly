import React, { useState, useRef, useCallback } from 'react'
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, Modal, KeyboardAvoidingView, Platform, StatusBar
} from 'react-native'
import { Swipeable } from 'react-native-gesture-handler'
import { useFocusEffect } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { useCurrency } from '../../hooks/useCurrency'
import { AVATAR_COLORS } from '../../constants/app'
import { colors, spacing, radius, shadow, typography } from '../../constants/theme'

export default function FriendsScreen({ navigation }) {
  const insets = useSafeAreaInsets()
  const { user } = useAuth()
  const { fmt, symbol } = useCurrency()
  const [friends, setFriends] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalVisible, setModalVisible] = useState(false)
  const [searchEmail, setSearchEmail] = useState('')
  const [settleTarget, setSettleTarget] = useState(null)
  const [settleAmount, setSettleAmount] = useState('')
  const [settling, setSettling] = useState(false)
  const [adding, setAdding] = useState(false)
  const [selectedFriend, setSelectedFriend] = useState(null)

  async function openSettle(item) {
    const netOwed = Math.abs(item.net)
    setSettleAmount(netOwed.toFixed(2))
    setSettleTarget({ friend: item.profile, total: netOwed, splits: [], expenses: {} })

    // Load expense breakdown
    const { data: friendExpenses } = await supabase
      .from('expenses').select('id, description').eq('paid_by', item.profile.id)
    const ids = (friendExpenses || []).map(e => e.id)
    let splits = [], expMap = {}

    if (ids.length > 0) {
      const { data: mySplits } = await supabase
        .from('expense_splits').select('id, expense_id, amount')
        .in('expense_id', ids).eq('user_id', user.id)
      const { data: priorPayments } = await supabase
        .from('payments').select('expense_id, amount')
        .eq('from_user_id', user.id).eq('to_user_id', item.profile.id)

      const paidPerExpense = {}
      for (const p of (priorPayments || [])) {
        if (p.expense_id) paidPerExpense[p.expense_id] = (paidPerExpense[p.expense_id] || 0) + parseFloat(p.amount)
      }
      splits = (mySplits || []).map(s => ({
        ...s,
        remaining: Math.max(0, parseFloat(s.amount) - (paidPerExpense[s.expense_id] || 0))
      })).filter(s => s.remaining > 0.005)
      for (const e of (friendExpenses || [])) expMap[e.id] = e
    }

    setSettleTarget({ friend: item.profile, total: netOwed, splits, expenses: expMap })
  }

  async function confirmSettle() {
    const amount = parseFloat(settleAmount)
    if (!settleTarget || !amount || amount <= 0) return
    setSettling(true)

    const splits = settleTarget.splits
    const totalRemaining = splits.reduce((s, x) => s + x.remaining, 0)

    let payments
    if (splits.length > 0 && totalRemaining > 0.005) {
      // Distribute amount proportionally across unsettled expenses
      payments = splits.map(s => ({
        from_user_id: user.id,
        to_user_id: settleTarget.friend.id,
        expense_id: s.expense_id,
        amount: parseFloat(((s.remaining / totalRemaining) * amount).toFixed(2)),
        note: 'Settled up'
      }))
    } else {
      setSettling(false)
      return Alert.alert('Nothing to settle', 'No outstanding expense splits found.')
    }

    const { error } = await supabase.from('payments').insert(payments)
    if (!error) {
      const { data: profile } = await supabase.from('profiles').select('name').eq('id', user.id).single()
      const actorName = profile?.name || 'Someone'
      const friendName = settleTarget.friend.name
      const paidAmount = parseFloat(settleAmount)
      await supabase.from('activity_log').insert([
        { user_id: user.id, type: 'settled', title: `You paid ${friendName}`, subtitle: null, amount: paidAmount, group_id: null, expense_id: null },
        { user_id: settleTarget.friend.id, type: 'settled', title: `${actorName} paid you`, subtitle: null, amount: paidAmount, group_id: null, expense_id: null },
      ])
    }
    setSettling(false)
    if (error) return Alert.alert('Error', 'Could not record payment.')
    setSettleTarget(null)
    fetchFriends()
  }

  useFocusEffect(useCallback(() => { fetchFriends() }, []))

  async function fetchFriends() {
    setLoading(true)
    const { data } = await supabase
      .from('friendships')
      .select('id, friend:friend_id(id, name, email), user:user_id(id, name, email), status')
      .or(`user_id.eq.${user.id},friend_id.eq.${user.id}`)
      .eq('status', 'accepted')

    const rawList = (data || []).map(f => {
      const isRequester = f.user?.id === user.id
      return { id: f.id, profile: isRequester ? f.friend : f.user }
    })

    // For each friend, calculate balance and shared groups
    const enriched = await Promise.all(rawList.map(async item => {
      const friendId = item.profile?.id

      // Shared groups
      const { data: myGroups } = await supabase
        .from('group_members')
        .select('group_id')
        .eq('user_id', user.id)

      const myGroupIds = (myGroups || []).map(g => g.group_id)

      let sharedGroups = []
      if (myGroupIds.length > 0) {
        const { data: friendGroups } = await supabase
          .from('group_members')
          .select('group:groups(id, name)')
          .eq('user_id', friendId)
          .in('group_id', myGroupIds)
        sharedGroups = (friendGroups || []).map(g => g.group?.name).filter(Boolean)
      }

      // Raw splits friend owes me (on expenses I paid)
      const { data: myExpenses } = await supabase
        .from('expenses').select('id').eq('paid_by', user.id)
      const myExpenseIds = (myExpenses || []).map(e => e.id)

      let rawOwedToMe = 0
      if (myExpenseIds.length > 0) {
        const { data: theirSplits } = await supabase
          .from('expense_splits').select('amount')
          .in('expense_id', myExpenseIds).eq('user_id', friendId)
        rawOwedToMe = (theirSplits || []).reduce((s, x) => s + parseFloat(x.amount), 0)
      }

      // Payments friend has already made to me
      const { data: theirPayments } = await supabase
        .from('payments').select('amount')
        .eq('from_user_id', friendId).eq('to_user_id', user.id)
      const paidByFriend = (theirPayments || []).reduce((s, x) => s + parseFloat(x.amount), 0)
      const owedToMe = Math.max(0, rawOwedToMe - paidByFriend)

      // Raw splits I owe friend (on expenses they paid)
      const { data: theirExpenses } = await supabase
        .from('expenses').select('id').eq('paid_by', friendId)
      const theirExpenseIds = (theirExpenses || []).map(e => e.id)

      let rawIOwe = 0
      if (theirExpenseIds.length > 0) {
        const { data: mySplits } = await supabase
          .from('expense_splits').select('amount')
          .in('expense_id', theirExpenseIds).eq('user_id', user.id)
        rawIOwe = (mySplits || []).reduce((s, x) => s + parseFloat(x.amount), 0)
      }

      // Payments I've already made to friend
      const { data: myPayments } = await supabase
        .from('payments').select('amount')
        .eq('from_user_id', user.id).eq('to_user_id', friendId)
      const paidByMe = (myPayments || []).reduce((s, x) => s + parseFloat(x.amount), 0)
      const iOwe = Math.max(0, rawIOwe - paidByMe)

      return { ...item, owedToMe, iOwe, net: owedToMe - iOwe, sharedGroups }
    }))

    setFriends(enriched)
    setLoading(false)
  }

  async function addFriend() {
    if (!searchEmail) return
    setAdding(true)

    const { data: found } = await supabase
      .from('profiles')
      .select('id, name, email')
      .eq('email', searchEmail.toLowerCase().trim())
      .single()

    if (!found) { setAdding(false); return Alert.alert('Not Found', 'No user with that email.') }
    if (found.id === user.id) { setAdding(false); return Alert.alert('Oops', "You can't add yourself.") }

    const { error } = await supabase.from('friendships').insert({
      user_id: user.id, friend_id: found.id, status: 'accepted'
    })

    setAdding(false)
    if (error) return Alert.alert('Error', 'Could not add friend.')
    setModalVisible(false)
    setSearchEmail('')
    fetchFriends()
  }

  async function removeFriend(item) {
    Alert.alert(
      'Remove Friend',
      `Remove ${item.profile?.name} from your friends?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove', style: 'destructive', onPress: async () => {
            await supabase.from('friendships').delete().eq('id', item.id)
            setFriends(prev => prev.filter(f => f.id !== item.id))
          }
        }
      ]
    )
  }

  const renderFriend = ({ item, index }) => {
    const avatarStyle = AVATAR_COLORS[index % AVATAR_COLORS.length]
    const net = item.net || 0
    const hasBalance = Math.abs(net) > 0.01

    const renderRightActions = () => (
      <TouchableOpacity style={styles.deleteAction} onPress={() => removeFriend(item)}>
        <Ionicons name="person-remove-outline" size={18} color={colors.white} />
        <Text style={styles.deleteActionText}>Remove</Text>
      </TouchableOpacity>
    )

    return (
      <Swipeable renderRightActions={renderRightActions} overshootRight={false}>
        <View style={styles.friendCard}>
          {/* Top row: avatar + info + balance (tappable for detail) */}
          <TouchableOpacity
            style={styles.friendCardTop}
            onPress={() => setSelectedFriend(item)}
            activeOpacity={0.7}
          >
            <View style={[styles.avatar, { backgroundColor: avatarStyle.bg }]}>
              <Text style={[styles.avatarText, { color: avatarStyle.text }]}>
                {item.profile?.name?.[0]?.toUpperCase() || '?'}
              </Text>
            </View>
            <View style={styles.friendInfo}>
              <Text style={styles.friendName}>{item.profile?.name}</Text>
            </View>
            <View style={styles.friendRight}>
              {hasBalance ? (
                <>
                  <Text style={[styles.balanceAmount, { color: net > 0 ? colors.settled : colors.pending }]}>
                    {net > 0 ? '' : '-'}{fmt(Math.abs(net))}
                  </Text>
                  <Text style={[styles.balanceLabel, { color: net > 0 ? colors.settled : colors.pending }]}>
                    {net > 0 ? 'owes you' : 'you owe'}
                  </Text>
                </>
              ) : (
                <Text style={styles.settledLabel}>Settled up</Text>
              )}
            </View>
          </TouchableOpacity>

        </View>
      </Swipeable>
    )
  }

  return (
    <View style={[styles.container, { paddingTop: 0 }]}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      <LinearGradient
        colors={['#162840', '#1E3A55', '#162840']}
        locations={[0, 0.5, 1]}
        style={[styles.header, { paddingTop: insets.top + spacing.sm }]}
      >
        <View>
          <Text style={styles.headerTitle}>Friends</Text>
          {friends.length > 0 && (
            <Text style={styles.headerSub}>{friends.length} {friends.length === 1 ? 'friend' : 'friends'}</Text>
          )}
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={() => setModalVisible(true)} accessibilityLabel="Add friend">
          <Text style={styles.addBtnText}>+ Add</Text>
        </TouchableOpacity>
      </LinearGradient>

      {loading
        ? <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
        : friends.length === 0
          ? <View style={styles.emptyState}>
              <View style={styles.emptyIllustration}>
                <Text style={styles.emptyEmoji}>🤝</Text>
              </View>
              <Text style={styles.emptyTitle}>No friends yet</Text>
              <Text style={styles.emptySubText}>Add friends to start splitting bills together</Text>
              <TouchableOpacity style={styles.emptyCtaBtn} onPress={() => setModalVisible(true)}>
                <Ionicons name="person-add-outline" size={16} color={colors.white} />
                <Text style={styles.emptyCtaText}>Add friends on Splitzly</Text>
              </TouchableOpacity>
            </View>
          : <FlatList
              data={friends}
              keyExtractor={i => i.id}
              renderItem={renderFriend}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
            />
      }

      {/* Settle Up bottom sheet */}
      <Modal visible={!!settleTarget} animationType="slide" transparent onRequestClose={() => setSettleTarget(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={[styles.modal, { paddingBottom: insets.bottom + spacing.md }]}>
            <View style={styles.modalHandle} />
            {settleTarget && (
              <>
                {/* Header */}
                <View style={styles.settleHeader}>
                  <View style={styles.settleAvatarRow}>
                    <View style={styles.settleYouAvatar}>
                      <Ionicons name="person" size={14} color={colors.primary} />
                    </View>
                    <Ionicons name="arrow-forward" size={12} color={colors.textMuted} />
                    <View style={styles.settleFriendAvatar}>
                      <Text style={styles.settleFriendAvatarText}>
                        {settleTarget?.friend?.name?.[0]?.toUpperCase()}
                      </Text>
                    </View>
                  </View>
                  <View>
                    <Text style={styles.modalTitle}>Settle Up</Text>
                    <Text style={styles.modalSubtitle}>with {settleTarget?.friend?.name}</Text>
                  </View>
                </View>

                {/* Total owed label */}
                <Text style={styles.settleOwedLabel}>
                  Total owed: <Text style={styles.settleOwedAmt}>{fmt(settleTarget?.total || 0)}</Text>
                </Text>

                {/* Editable amount */}
                <View style={styles.settleInputWrap}>
                  <Text style={styles.settleInputCurrency}>{symbol}</Text>
                  <TextInput
                    style={styles.settleInput}
                    value={settleAmount}
                    onChangeText={setSettleAmount}
                    keyboardType="decimal-pad"
                    placeholder="0.00"
                    placeholderTextColor="rgba(255,255,255,0.25)"
                    selectTextOnFocus
                  />
                  <TouchableOpacity onPress={() => setSettleAmount((settleTarget?.total || 0).toFixed(2))}>
                    <Text style={styles.settleMaxBtn}>Max</Text>
                  </TouchableOpacity>
                </View>

                {/* Expense breakdown */}
                {settleTarget?.splits?.length > 0 && (
                  <View style={styles.settleBreakdown}>
                    <Text style={styles.settleBreakdownTitle}>Expense breakdown</Text>
                    {settleTarget.splits.map(s => {
                      const exp = settleTarget.expenses[s.expense_id]
                      return (
                        <View key={s.id} style={styles.settleBreakdownRow}>
                          <View style={styles.settleBreakdownDot} />
                          <Text style={styles.settleBreakdownDesc} numberOfLines={1}>
                            {exp?.description || 'Expense'}
                          </Text>
                          <Text style={styles.settleBreakdownAmt}>{fmt(s.remaining)}</Text>
                        </View>
                      )
                    })}
                  </View>
                )}

                {/* Buttons */}
                <View style={styles.modalFooterRow}>
                  <TouchableOpacity style={styles.cancelBtn} onPress={() => setSettleTarget(null)}>
                    <Text style={styles.cancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.button, (settling || !settleAmount || parseFloat(settleAmount) <= 0 || parseFloat(settleAmount) > (settleTarget?.total || 0)) && { opacity: 0.4 }]}
                    onPress={confirmSettle}
                    disabled={settling || !settleAmount || parseFloat(settleAmount) <= 0 || parseFloat(settleAmount) > (settleTarget?.total || 0)}
                  >
                    {settling
                      ? <ActivityIndicator color={colors.white} size="small" />
                      : <Text style={styles.buttonText}>Confirm</Text>
                    }
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Friend Detail Modal */}
      <Modal visible={!!selectedFriend} animationType="slide" transparent onRequestClose={() => setSelectedFriend(null)}>
        <View style={styles.detailOverlay}>
          <View style={[styles.detailSheet, { paddingBottom: insets.bottom + spacing.md }]}>
            <View style={styles.modalHandle} />
            {selectedFriend && (() => {
              const sf = selectedFriend
              const sfNet = sf.net || 0
              const sfHasBalance = Math.abs(sfNet) > 0.01
              const sfAvatarStyle = AVATAR_COLORS[friends.indexOf(sf) % AVATAR_COLORS.length]
              const isOwed = sfNet > 0
              const accentColor = !sfHasBalance ? colors.settled : isOwed ? colors.settled : colors.pending
              return (
                <>
                  {/* Handle + header row */}
                  <View style={styles.detailHero}>
                    <View style={[styles.detailAvatarRing, { borderColor: accentColor }]}>
                      <View style={[styles.detailAvatar, { backgroundColor: sfAvatarStyle.bg }]}>
                        <Text style={[styles.detailAvatarText, { color: sfAvatarStyle.text }]}>
                          {sf.profile?.name?.[0]?.toUpperCase() || '?'}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.detailName}>{sf.profile?.name}</Text>
                    <TouchableOpacity onPress={() => setSelectedFriend(null)} style={styles.detailCloseBtn}>
                      <Ionicons name="close" size={15} color={colors.textMuted} />
                    </TouchableOpacity>
                  </View>

                  {/* Net balance */}
                  <View style={[styles.detailNetBox, {
                    backgroundColor: isOwed ? 'rgba(0,201,177,0.1)' : sfHasBalance ? 'rgba(251,113,133,0.1)' : 'rgba(0,201,177,0.08)',
                    borderColor: accentColor + '55',
                  }]}>
                    <Text style={[styles.detailNetLabel, { color: accentColor }]}>
                      {!sfHasBalance ? 'Settled up' : isOwed ? `${sf.profile?.name} owes you` : `You owe ${sf.profile?.name}`}
                    </Text>
                    {sfHasBalance
                      ? <Text style={[styles.detailNetAmount, { color: accentColor }]}>{fmt(Math.abs(sfNet))}</Text>
                      : <Ionicons name="checkmark-circle" size={22} color={colors.settled} style={{ marginTop: 4 }} />
                    }
                  </View>

                  {/* Breakdown — only when both sides exist */}
                  {sf.owedToMe > 0.01 && sf.iOwe > 0.01 && (
                    <View style={styles.detailBreakdownCard}>
                      <View style={styles.detailBreakdownRow}>
                        <View style={styles.detailBreakdownIconBox}>
                          <Ionicons name="arrow-down" size={10} color={colors.settled} />
                        </View>
                        <Text style={styles.detailBreakdownDesc}>{sf.profile?.name} owes you</Text>
                        <Text style={[styles.detailBreakdownAmt, { color: colors.settled }]}>{fmt(sf.owedToMe)}</Text>
                      </View>
                      <View style={styles.detailBreakdownRow}>
                        <View style={[styles.detailBreakdownIconBox, { backgroundColor: 'rgba(251,113,133,0.15)' }]}>
                          <Ionicons name="arrow-up" size={10} color={colors.pending} />
                        </View>
                        <Text style={styles.detailBreakdownDesc}>You owe {sf.profile?.name}</Text>
                        <Text style={[styles.detailBreakdownAmt, { color: colors.pending }]}>{fmt(sf.iOwe)}</Text>
                      </View>
                      <View style={styles.detailNetRow}>
                        <Text style={styles.detailNetRowLabel}>Net</Text>
                        <Text style={[styles.detailNetRowAmt, { color: accentColor }]}>{fmt(Math.abs(sfNet))}</Text>
                      </View>
                    </View>
                  )}

                  {/* Shared groups chips */}
                  {sf.sharedGroups?.length > 0 && (
                    <View style={styles.detailGroupChips}>
                      {sf.sharedGroups.map((g, i) => (
                        <View key={i} style={styles.detailGroupChip}>
                          <Ionicons name="albums-outline" size={11} color={colors.primary} />
                          <Text style={styles.detailGroupName}>{g}</Text>
                        </View>
                      ))}
                    </View>
                  )}

                  {/* Settle up button */}
                  {sfNet < -0.01 && (
                    <TouchableOpacity
                      style={styles.detailSettleBtn}
                      onPress={() => { setSelectedFriend(null); setTimeout(() => openSettle(sf), 300) }}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="checkmark-circle-outline" size={17} color={colors.white} />
                      <Text style={styles.detailSettleBtnText}>Settle Up · {fmt(Math.abs(sfNet))}</Text>
                    </TouchableOpacity>
                  )}

                  {/* Nudge button — only when they owe you */}
                  {sfNet > 0.01 && (
                    <TouchableOpacity
                      style={styles.detailNudgeBtn}
                      onPress={() => {
                        setSelectedFriend(null)
                        setTimeout(() => navigation.navigate('Chat', {
                          partnerId: sf.profile.id,
                          partnerName: sf.profile.name,
                          nudgeAmount: sfNet,
                        }), 300)
                      }}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="notifications-outline" size={17} color={colors.primary} />
                      <Text style={styles.detailNudgeBtnText}>Nudge · {fmt(sfNet)}</Text>
                    </TouchableOpacity>
                  )}
                </>
              )
            })()}
          </View>
        </View>
      </Modal>

      <Modal visible={modalVisible} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={styles.modal}>
            <View style={styles.modalHandle} />

            {/* Header row */}
            <View style={styles.modalHeader}>
              <View style={styles.modalIconBox}>
                <Ionicons name="person-add" size={20} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>Add Friend</Text>
                <Text style={styles.modalSubtitle}>Enter their email to connect</Text>
              </View>
            </View>

            {/* Email input */}
            <View style={styles.inputWrap}>
              <Ionicons name="mail-outline" size={17} color="rgba(255,255,255,0.35)" style={{ marginRight: spacing.sm }} />
              <TextInput
                style={styles.input}
                placeholder="friend@example.com"
                placeholderTextColor="rgba(255,255,255,0.25)"
                autoCapitalize="none"
                keyboardType="email-address"
                value={searchEmail}
                onChangeText={setSearchEmail}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={addFriend}
                accessibilityLabel="Friend's email address"
              />
            </View>

            {/* Action row */}
            <View style={styles.modalFooterRow}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => { setModalVisible(false); setSearchEmail('') }}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.button, !searchEmail.trim() && { opacity: 0.4 }]} onPress={addFriend} disabled={adding || !searchEmail.trim()}>
                {adding
                  ? <ActivityIndicator color={colors.white} size="small" />
                  : <Text style={styles.buttonText}>Add Friend</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: spacing.lg, paddingBottom: spacing.md,
  },
  headerTitle: { ...typography.h2, color: colors.white },
  headerSub: { ...typography.caption, marginTop: 1, color: 'rgba(255,255,255,0.55)' },
  addBtn: {
    backgroundColor: 'rgba(255,255,255,0.12)', paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm, borderRadius: radius.full,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
  },
  addBtnText: { color: colors.white, fontWeight: '700', fontSize: 14 },

  // Summary card - removed (duplicate of home screen)
  listContent: { padding: spacing.lg },
  friendCard: {
    backgroundColor: colors.background,
    borderRadius: radius.lg, ...shadow.sm, marginBottom: spacing.sm,
    overflow: 'hidden',
  },
  friendCardTop: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    padding: spacing.md,
  },
  cardDivider: { height: 1, backgroundColor: colors.border, marginHorizontal: spacing.md },
  settleBar: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: spacing.sm + 2, paddingHorizontal: spacing.md,
  },
  settleBarText: { fontSize: 13, fontWeight: '700', color: colors.primary },
  avatar: {
    width: 46, height: 46, borderRadius: radius.full,
    justifyContent: 'center', alignItems: 'center',
  },
  avatarText: { fontWeight: '800', fontSize: 18 },
  friendInfo: { flex: 1 },
  friendName: { ...typography.bodyBold },
  friendEmail: { ...typography.caption, marginTop: 2 },
  groupsRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  groupsText: { fontSize: 11, color: colors.primary, fontWeight: '600', flex: 1 },
  friendRight: { alignItems: 'flex-end', marginRight: spacing.xs },
  balanceAmount: { fontSize: 14, fontWeight: '800' },
  balanceLabel: { fontSize: 10, fontWeight: '600', marginTop: 1 },
  offsetRow: { flexDirection: 'row', gap: 3, marginTop: 3, alignItems: 'center' },
  offsetOwed: { fontSize: 9, fontWeight: '700', color: colors.settled },
  offsetSep: { fontSize: 9, color: colors.textMuted },
  offsetOwe: { fontSize: 9, fontWeight: '700', color: colors.pending },
  offsetBar: {
    flexDirection: 'row', paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
  },
  offsetBarItem: { flex: 1, alignItems: 'center' },
  offsetBarValue: { fontSize: 13, fontWeight: '700', color: colors.settled },
  offsetBarLabel: { fontSize: 10, color: colors.textMuted, fontWeight: '500', marginTop: 1 },
  offsetBarSep: { width: 1, backgroundColor: colors.border, marginHorizontal: spacing.sm },
  settledLabel: { fontSize: 11, fontWeight: '600', color: colors.textMuted },
  deleteAction: {
    backgroundColor: colors.pending, justifyContent: 'center', alignItems: 'center',
    width: 80, borderRadius: radius.lg, marginBottom: spacing.sm, marginLeft: spacing.xs,
    gap: 4,
  },
  deleteActionText: { color: colors.white, fontSize: 11, fontWeight: '700' },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl, gap: spacing.md },
  emptyIllustration: {
    width: 100, height: 100, borderRadius: radius.full,
    backgroundColor: colors.primaryLight, justifyContent: 'center', alignItems: 'center',
    marginBottom: spacing.sm,
  },
  emptyEmoji: { fontSize: 48 },
  emptyTitle: { ...typography.h3, color: colors.text },
  emptySubText: { ...typography.caption, textAlign: 'center', lineHeight: 20 },
  emptyCtaBtn: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.primary, paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md, borderRadius: radius.md, marginTop: spacing.sm, ...shadow.sm,
  },
  emptyCtaText: { color: colors.white, fontWeight: '700', fontSize: 15 },

  settleOwedLabel: { fontSize: 12, color: colors.textMuted, marginBottom: spacing.sm },
  settleOwedAmt: { color: colors.pending, fontWeight: '700' },
  settleInputWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: radius.lg,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: spacing.md, marginBottom: spacing.md, gap: spacing.xs,
  },
  settleInputCurrency: { fontSize: 20, fontWeight: '700', color: colors.textSecondary },
  settleInput: { flex: 1, fontSize: 24, fontWeight: '700', color: colors.text, paddingVertical: spacing.md },
  settleMaxBtn: { fontSize: 12, fontWeight: '700', color: colors.primary, paddingVertical: spacing.xs, paddingHorizontal: spacing.sm },
  settleHeader: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.md,
  },
  settleAvatarRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
  },
  settleYouAvatar: {
    width: 32, height: 32, borderRadius: radius.full,
    backgroundColor: colors.primaryLight, justifyContent: 'center', alignItems: 'center',
    borderWidth: 1.5, borderColor: colors.primary,
  },
  settleFriendAvatar: {
    width: 32, height: 32, borderRadius: radius.full,
    backgroundColor: 'rgba(79,70,229,0.15)', justifyContent: 'center', alignItems: 'center',
    borderWidth: 1.5, borderColor: 'rgba(129,140,248,0.5)',
  },
  settleFriendAvatarText: { fontSize: 13, fontWeight: '800', color: '#818CF8' },
  settleAmountBox: {
    backgroundColor: 'rgba(0,201,177,0.12)', borderRadius: radius.lg,
    borderWidth: 1, borderColor: 'rgba(0,201,177,0.2)',
    paddingVertical: spacing.md, alignItems: 'center', marginBottom: spacing.md,
  },
  settleAmountLabel: { fontSize: 10, fontWeight: '700', color: colors.primary, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 2 },
  settleAmount: { fontSize: 28, fontWeight: '800', color: colors.text, letterSpacing: -0.5 },
  settleBreakdown: {
    borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm, marginBottom: spacing.md,
  },
  settleBreakdownTitle: {
    fontSize: 10, fontWeight: '700', color: colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 1, marginBottom: spacing.xs,
  },
  settleBreakdownRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 4 },
  settleBreakdownDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.primary, opacity: 0.6 },
  settleBreakdownDesc: { flex: 1, fontSize: 13, color: colors.text, fontWeight: '500' },
  settleBreakdownAmt: { fontSize: 13, fontWeight: '700', color: colors.textSecondary },

  modalOverlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  modal: {
    backgroundColor: colors.background, borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl, padding: spacing.lg, paddingBottom: 36,
  },
  modalHandle: {
    width: 40, height: 4, borderRadius: radius.full,
    backgroundColor: colors.border, alignSelf: 'center', marginBottom: spacing.lg,
  },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg,
  },
  modalIconBox: {
    width: 44, height: 44, borderRadius: radius.md,
    backgroundColor: colors.primaryLight, justifyContent: 'center', alignItems: 'center',
  },
  modalTitle: { fontSize: 16, fontWeight: '800', color: colors.text },
  modalSubtitle: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: radius.lg, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: spacing.md, marginBottom: spacing.md,
  },
  input: { flex: 1, fontSize: 15, color: colors.text, paddingVertical: spacing.md },
  modalFooterRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  button: {
    flex: 1, backgroundColor: colors.primary, borderRadius: radius.full,
    paddingVertical: spacing.md, alignItems: 'center',
  },
  buttonText: { color: colors.white, fontWeight: '700', fontSize: 15 },
  cancelBtn: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)', paddingVertical: spacing.md,
    borderRadius: radius.full, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  cancelText: { color: colors.textSecondary, fontSize: 15, fontWeight: '600' },

  // Friend detail modal
  detailOverlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  detailSheet: {
    backgroundColor: colors.background, borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl, padding: spacing.md, paddingTop: spacing.sm,
  },
  detailCloseBtn: {
    width: 26, height: 26, borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.06)', justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  detailHero: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  detailAvatarRing: {
    width: 40, height: 40, borderRadius: 20,
    borderWidth: 2, justifyContent: 'center', alignItems: 'center',
  },
  detailAvatar: { width: 33, height: 33, borderRadius: 17, justifyContent: 'center', alignItems: 'center' },
  detailAvatarText: { fontWeight: '800', fontSize: 13 },
  detailName: { flex: 1, fontSize: 15, fontWeight: '800', color: colors.text },
  detailEmail: { fontSize: 11, color: colors.textMuted },
  detailNetBox: {
    borderRadius: radius.lg, borderWidth: 1,
    paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
    alignItems: 'center', marginBottom: spacing.sm,
  },
  detailNetLabel: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },
  detailNetAmount: { fontSize: 26, fontWeight: '800', letterSpacing: -0.5, marginTop: 1 },
  detailBreakdownCard: {
    backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border, padding: spacing.sm, marginBottom: spacing.sm,
  },
  detailBreakdownTitle: {
    fontSize: 9, fontWeight: '700', color: colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 1, marginBottom: spacing.xs,
  },
  detailBreakdownRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 3 },
  detailBreakdownIconBox: {
    width: 18, height: 18, borderRadius: 4,
    backgroundColor: 'rgba(0,201,177,0.15)', justifyContent: 'center', alignItems: 'center',
  },
  detailBreakdownDesc: { flex: 1, fontSize: 12, color: colors.text, fontWeight: '500' },
  detailBreakdownAmt: { fontSize: 12, fontWeight: '800' },
  detailNetRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderTopWidth: 1, borderTopColor: colors.border, marginTop: 3, paddingTop: spacing.xs,
  },
  detailNetRowLabel: { fontSize: 10, fontWeight: '600', color: colors.textMuted },
  detailNetRowAmt: { fontSize: 12, fontWeight: '800' },
  detailGroupsCard: {
    backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border, padding: spacing.sm, marginBottom: spacing.sm,
  },
  detailGroupChips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.sm },
  detailGroupChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: colors.primaryLight, borderRadius: radius.full,
    paddingHorizontal: spacing.sm, paddingVertical: 4,
  },
  detailGroupName: { fontSize: 11, color: colors.primary, fontWeight: '700' },
  detailGroupRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 4 },
  detailSettleBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    backgroundColor: colors.primary, borderRadius: radius.full,
    paddingVertical: spacing.md, ...shadow.sm,
  },
  detailSettleBtnText: { color: colors.white, fontWeight: '800', fontSize: 14 },
  detailNudgeBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    backgroundColor: colors.primaryLight, borderRadius: radius.full,
    paddingVertical: spacing.md, marginTop: spacing.sm,
    borderWidth: 1, borderColor: colors.primary,
  },
  detailNudgeBtnText: { color: colors.primary, fontWeight: '800', fontSize: 14 },
})
