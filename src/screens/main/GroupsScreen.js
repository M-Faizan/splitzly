import { showAlert } from '../../utils/alert'
import React, { useState, useCallback } from 'react'
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, Modal, KeyboardAvoidingView, Platform, Image, StatusBar
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { useCurrency } from '../../hooks/useCurrency'
import { AVATAR_COLORS } from '../../constants/app'
import { colors, spacing, radius, shadow, typography } from '../../constants/theme'

export default function GroupsScreen({ navigation }) {
  const insets = useSafeAreaInsets()
  const { user } = useAuth()
  const { fmt } = useCurrency()
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalVisible, setModalVisible] = useState(false)
  const [groupName, setGroupName] = useState('')
  const [creating, setCreating] = useState(false)

  useFocusEffect(
    useCallback(() => { fetchGroups() }, [])
  )

  async function fetchGroups() {
    setLoading(true)
    const { data } = await supabase
      .from('group_members')
      .select('group:groups(id, name, image_url, created_at)')
      .eq('user_id', user.id)

    const rawGroups = (data || []).map(d => d.group).filter(g => g && g.id)

    const enriched = await Promise.all(rawGroups.map(async g => {
      const [{ data: expData }, { data: memberData }] = await Promise.all([
        supabase.from('expenses').select('id, amount, paid_by, expense_splits(user_id, amount)').eq('group_id', g.id),
        supabase.from('group_members').select('user_id').eq('group_id', g.id),
      ])

      const expIds = (expData || []).map(e => e.id)
      let paymentsMap = {}
      if (expIds.length > 0) {
        const { data: payments } = await supabase
          .from('payments').select('expense_id, from_user_id, amount')
          .in('expense_id', expIds)
        for (const p of (payments || [])) {
          if (!paymentsMap[p.expense_id]) paymentsMap[p.expense_id] = {}
          paymentsMap[p.expense_id][p.from_user_id] = (paymentsMap[p.expense_id][p.from_user_id] || 0) + parseFloat(p.amount)
        }
      }

      const total = (expData || []).reduce((s, e) => s + parseFloat(e.amount), 0)

      // Compute net balance per (debtor, creditor) pair across all group expenses
      const rawOwed = {}
      for (const e of (expData || [])) {
        for (const s of (e.expense_splits || [])) {
          if (s.user_id === e.paid_by) continue
          const debtor = s.user_id, creditor = e.paid_by
          if (!rawOwed[debtor]) rawOwed[debtor] = {}
          rawOwed[debtor][creditor] = (rawOwed[debtor][creditor] || 0) + parseFloat(s.amount)
        }
      }
      // Subtract actual payments
      for (const e of (expData || [])) {
        const expPayments = paymentsMap[e.id] || {}
        for (const [fromUser, amt] of Object.entries(expPayments)) {
          if (rawOwed[fromUser]?.[e.paid_by] !== undefined) {
            rawOwed[fromUser][e.paid_by] = Math.max(0, rawOwed[fromUser][e.paid_by] - amt)
          }
        }
      }

      const pending = (expData || []).filter(e => {
        const splits = e.expense_splits || []
        return !splits.every(s => {
          if (s.user_id === e.paid_by) return true
          const owes = rawOwed[s.user_id]?.[e.paid_by] || 0
          const owedBack = rawOwed[e.paid_by]?.[s.user_id] || 0
          return (owes - owedBack) < 0.01
        })
      }).length

      return { ...g, total, expenseCount: (expData || []).length, memberCount: (memberData || []).length, pending }
    }))

    setGroups(enriched)
    setLoading(false)
  }

  async function createGroup() {
    if (!groupName.trim()) return
    setCreating(true)
    const { data, error } = await supabase
      .from('groups')
      .insert({ name: groupName.trim(), created_by: user.id })
      .select()
      .single()

    if (error) { setCreating(false); return showAlert('Error', error.message) }

    await supabase.from('group_members').insert({ group_id: data.id, user_id: user.id })
    setCreating(false)
    setModalVisible(false)
    setGroupName('')
    fetchGroups()
  }

  const renderGroup = ({ item, index }) => {
    const iconStyle = AVATAR_COLORS[index % AVATAR_COLORS.length]
    return (
      <TouchableOpacity
        style={styles.groupCard}
        onPress={() => navigation.navigate('GroupDetail', { group: item })}
        activeOpacity={0.7}
      >
        <View style={[styles.groupIcon, { backgroundColor: iconStyle.bg }]}>
            {item?.image_url
              ? <Image source={{ uri: item.image_url }} style={styles.groupIconImg} />
              : <Text style={[styles.groupIconText, { color: iconStyle.text }]}>
                  {item?.name?.[0]?.toUpperCase()}
                </Text>
            }
          </View>
        <View style={styles.groupInfo}>
          <Text style={styles.groupName}>{item?.name}</Text>
          <View style={styles.groupMeta}>
            <Ionicons name="people-outline" size={12} color={colors.textMuted} />
            <Text style={styles.groupMetaText}>{item.memberCount} {item.memberCount === 1 ? 'member' : 'members'}</Text>
            <View style={styles.metaDot} />
            <Ionicons name="receipt-outline" size={12} color={colors.textMuted} />
            <Text style={styles.groupMetaText}>{item.expenseCount} {item.expenseCount === 1 ? 'expense' : 'expenses'}</Text>
          </View>
        </View>
        <View style={styles.groupRight}>
          <Text style={styles.groupTotal}>{fmt(item.total)}</Text>
          {item.pending > 0 && (
            <View style={styles.pendingBadge}>
              <Text style={styles.pendingBadgeText}>{item.pending} pending</Text>
            </View>
          )}
          {item.pending === 0 && item.expenseCount > 0 && (
            <View style={styles.settledBadge}>
              <Text style={styles.settledBadgeText}>Settled</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
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
          <Text style={styles.headerTitle}>Groups</Text>
          {groups.length > 0 && (
            <Text style={styles.headerSub}>{groups.length} {groups.length === 1 ? 'group' : 'groups'}</Text>
          )}
        </View>
        {groups.length > 0 && (
          <TouchableOpacity style={styles.addBtn} onPress={() => setModalVisible(true)} accessibilityLabel="Create group">
            <Text style={styles.addBtnText}>+ New</Text>
          </TouchableOpacity>
        )}
      </LinearGradient>

      {loading
        ? <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
        : groups.length === 0
          ? <View style={styles.emptyState}>
              <View style={styles.emptyIllustration}>
                <Text style={styles.emptyEmoji}>👥</Text>
              </View>
              <Text style={styles.emptyTitle}>No groups yet</Text>
              <Text style={styles.emptySubText}>Create a group for trips, flatmates, or any shared expenses</Text>
              <TouchableOpacity style={styles.emptyCtaBtn} onPress={() => setModalVisible(true)}>
                <Ionicons name="add-circle-outline" size={16} color={colors.white} />
                <Text style={styles.emptyCtaText}>Create group</Text>
              </TouchableOpacity>
            </View>
          : <FlatList
              data={groups}
              keyExtractor={i => i?.id}
              renderItem={renderGroup}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
            />
      }

      <Modal visible={modalVisible} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={styles.modal}>
            <View style={styles.modalHandle} />

            {/* Live preview avatar */}
            <View style={styles.newGroupPreview}>
              <View style={styles.newGroupAvatar}>
                <Text style={styles.newGroupAvatarText}>
                  {groupName.trim() ? groupName.trim()[0].toUpperCase() : '?'}
                </Text>
              </View>
              <View>
                <Text style={styles.newGroupPreviewName} numberOfLines={1}>
                  {groupName.trim() || 'Group name'}
                </Text>
                <Text style={styles.newGroupPreviewSub}>Just you · 0 expenses</Text>
              </View>
            </View>

            {/* Suggestions */}
            {(() => {
              const ALL_SUGGESTIONS = [
                'Trip to Bali 🌴', 'Flat Share 🏠', 'Dinner 🍕', 'Road Trip 🚗',
                'Weekend Getaway ✈️', 'Groceries 🛒', 'Party 🎉', 'Office Lunch 🍱',
                'Holiday 🏖️', 'Camping ⛺', 'Concert 🎵', 'Sports ⚽',
              ]
              const query = groupName.toLowerCase().trim()
              const matches = query
                ? ALL_SUGGESTIONS.filter(s => s.toLowerCase().includes(query))
                : ALL_SUGGESTIONS.slice(0, 4)
              const rest = query
                ? ALL_SUGGESTIONS.filter(s => !s.toLowerCase().includes(query)).slice(0, 4)
                : ALL_SUGGESTIONS.slice(4)
              const shown = [...matches, ...rest].slice(0, 8)
              return (
                <>
                  <Text style={styles.suggestLabel}>Suggestions</Text>
                  <View style={styles.suggestRow}>
                    {shown.map(s => {
                      const isMatch = query && s.toLowerCase().includes(query)
                      return (
                        <TouchableOpacity
                          key={s}
                          style={[styles.suggestChip, isMatch && styles.suggestChipActive]}
                          onPress={() => setGroupName(s)}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.suggestChipText, isMatch && styles.suggestChipTextActive]}>{s}</Text>
                        </TouchableOpacity>
                      )
                    })}
                  </View>
                </>
              )
            })()}

            {/* Name input with autocomplete */}
            {(() => {
              const ALL_SUGGESTIONS = [
                'Trip to Bali 🌴', 'Flat Share 🏠', 'Dinner 🍕', 'Road Trip 🚗',
                'Weekend Getaway ✈️', 'Groceries 🛒', 'Party 🎉', 'Office Lunch 🍱',
                'Holiday 🏖️', 'Camping ⛺', 'Concert 🎵', 'Sports ⚽',
              ]
              const query = groupName.trim()
              const hint = query
                ? ALL_SUGGESTIONS.find(s => s.toLowerCase().startsWith(query.toLowerCase()))
                : null
              return (
                <View style={styles.inputWrapper}>
                  <TextInput
                    style={styles.input}
                    placeholder="Group name..."
                    placeholderTextColor={colors.textMuted}
                    value={groupName}
                    onChangeText={setGroupName}
                    autoFocus
                    returnKeyType="done"
                    onSubmitEditing={createGroup}
                    accessibilityLabel="Group name"
                  />
                  {hint && (
                    <TouchableOpacity style={styles.autocompleteBar} onPress={() => setGroupName(hint)} activeOpacity={0.7}>
                      <Ionicons name="arrow-up-circle" size={16} color={colors.primary} />
                      <Text style={styles.autocompleteText} numberOfLines={1}>{hint}</Text>
                      <Text style={styles.autocompleteTap}>tap to fill</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )
            })()}

            <View style={styles.modalFooterRow}>
              <TouchableOpacity style={styles.cancelPill} onPress={() => { setModalVisible(false); setGroupName('') }}>
                <Text style={styles.cancelPillText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.createBtn, !groupName.trim() && { opacity: 0.5 }]} onPress={createGroup} disabled={creating || !groupName.trim()}>
                {creating
                  ? <ActivityIndicator color={colors.white} size="small" />
                  : <>
                      <Ionicons name="add" size={18} color={colors.white} />
                      <Text style={styles.createBtnText}>Create</Text>
                    </>
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
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(255,255,255,0.12)', paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm, borderRadius: radius.full,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
  },
  addBtnText: { color: colors.white, fontWeight: '700', fontSize: 14 },
  listContent: { padding: spacing.lg, gap: spacing.sm, maxWidth: 600, width: '100%', alignSelf: 'center' },
  groupCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    padding: spacing.md, backgroundColor: colors.background,
    borderRadius: radius.lg, ...shadow.sm,
  },
  groupIcon: {
    width: 48, height: 48, borderRadius: radius.md,
    justifyContent: 'center', alignItems: 'center',
    overflow: 'hidden',
  },
  groupIconImg: { width: 48, height: 48, borderRadius: radius.md },
  groupIconText: { fontWeight: '800', fontSize: 20 },
  groupInfo: { flex: 1 },
  groupName: { ...typography.bodyBold, marginBottom: 4 },
  groupMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  groupMetaText: { fontSize: 12, color: colors.textMuted, fontWeight: '500' },
  metaDot: { width: 3, height: 3, borderRadius: 999, backgroundColor: colors.textMuted },
  groupRight: { alignItems: 'flex-end', gap: 4 },
  groupTotal: { fontSize: 15, fontWeight: '800', color: colors.text },
  pendingBadge: {
    backgroundColor: colors.pendingBg, paddingHorizontal: 7,
    paddingVertical: 2, borderRadius: radius.full,
  },
  pendingBadgeText: { fontSize: 10, fontWeight: '700', color: colors.pending },
  settledBadge: {
    backgroundColor: colors.settledBg, paddingHorizontal: 7,
    paddingVertical: 2, borderRadius: radius.full,
  },
  settledBadgeText: { fontSize: 10, fontWeight: '700', color: colors.settled },

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

  modalOverlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  modal: {
    backgroundColor: colors.background, borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl, padding: spacing.lg, paddingBottom: 40,
  },
  modalHandle: {
    width: 40, height: 4, borderRadius: radius.full,
    backgroundColor: colors.border, alignSelf: 'center', marginBottom: spacing.lg,
  },

  // New group modal
  newGroupPreview: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.surface, borderRadius: radius.xl,
    padding: spacing.md, marginBottom: spacing.lg, borderWidth: 1, borderColor: colors.border,
  },
  newGroupAvatar: {
    width: 48, height: 48, borderRadius: radius.md,
    backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center',
  },
  newGroupAvatarText: { color: colors.white, fontWeight: '800', fontSize: 22 },
  newGroupPreviewName: { fontSize: 16, fontWeight: '700', color: colors.text },
  newGroupPreviewSub: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  suggestLabel: { fontSize: 11, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: spacing.sm },
  suggestRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.md },
  suggestChip: {
    backgroundColor: colors.primaryLight, borderRadius: radius.full,
    paddingHorizontal: spacing.sm, paddingVertical: 6,
  },
  suggestChipActive: {
    backgroundColor: colors.primary,
  },
  suggestChipText: { fontSize: 13, fontWeight: '600', color: colors.primary },
  suggestChipTextActive: { color: colors.white },
  input: {
    backgroundColor: colors.surface, borderRadius: radius.md,
    padding: spacing.md, fontSize: 15, color: colors.text,
    borderWidth: 1, borderColor: colors.border,
  },
  inputWrapper: { marginBottom: spacing.md },
  autocompleteBar: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.primaryLight, borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    marginTop: spacing.xs, borderWidth: 1, borderColor: colors.cardBorder,
  },
  autocompleteText: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.primary },
  autocompleteTap: { fontSize: 11, color: colors.primary, opacity: 0.6, fontWeight: '500' },
  modalFooterRow: { flexDirection: 'row', gap: spacing.sm },
  cancelPill: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)', paddingVertical: spacing.sm + 4,
    borderRadius: radius.full, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  cancelPillText: { fontSize: 14, fontWeight: '600', color: colors.textSecondary },
  createBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, backgroundColor: colors.primary, paddingVertical: spacing.sm + 4,
    borderRadius: radius.full,
  },
  createBtnText: { color: colors.white, fontWeight: '700', fontSize: 14 },
})
