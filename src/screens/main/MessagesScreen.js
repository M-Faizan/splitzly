import React, { useState, useCallback } from 'react'
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  ActivityIndicator, StatusBar
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { timeAgo } from '../../lib/formatters'
import { AVATAR_COLORS } from '../../constants/app'
import { colors, spacing, radius, shadow, typography } from '../../constants/theme'

export default function MessagesScreen({ navigation }) {
  const insets = useSafeAreaInsets()
  const { user } = useAuth()
  const [conversations, setConversations] = useState([])
  const [loading, setLoading] = useState(true)

  useFocusEffect(useCallback(() => { fetchConversations() }, []))

  async function fetchConversations() {
    setLoading(true)

    const { data } = await supabase
      .from('messages')
      .select('id, body, read, created_at, from_user_id, to_user_id, from_user:from_user_id(id, name), to_user:to_user_id(id, name)')
      .or(`from_user_id.eq.${user.id},to_user_id.eq.${user.id}`)
      .order('created_at', { ascending: false })

    // Group by conversation partner
    const convMap = {}
    for (const msg of (data || [])) {
      const partnerId = msg.from_user_id === user.id ? msg.to_user_id : msg.from_user_id
      const partnerProfile = msg.from_user_id === user.id ? msg.to_user : msg.from_user
      if (!convMap[partnerId]) {
        convMap[partnerId] = {
          partnerId,
          partnerName: partnerProfile?.name || 'Unknown',
          lastMessage: msg.body,
          lastTime: msg.created_at,
          unread: 0,
        }
      }
      // Count unread messages sent to me
      if (!msg.read && msg.to_user_id === user.id) {
        convMap[partnerId].unread++
      }
    }

    setConversations(Object.values(convMap).sort((a, b) => new Date(b.lastTime) - new Date(a.lastTime)))
    setLoading(false)
  }

  const totalUnread = conversations.reduce((s, c) => s + c.unread, 0)

  const renderItem = ({ item, index }) => {
    const avatarStyle = AVATAR_COLORS[index % AVATAR_COLORS.length]
    return (
      <TouchableOpacity
        style={styles.convRow}
        onPress={() => navigation.navigate('Chat', { partnerId: item.partnerId, partnerName: item.partnerName })}
        activeOpacity={0.7}
      >
        <View style={[styles.avatar, { backgroundColor: avatarStyle.bg }]}>
          <Text style={[styles.avatarText, { color: avatarStyle.text }]}>
            {item.partnerName?.[0]?.toUpperCase()}
          </Text>
        </View>
        <View style={styles.convInfo}>
          <View style={styles.convTopRow}>
            <Text style={[styles.convName, item.unread > 0 && styles.convNameUnread]}>{item.partnerName}</Text>
            <Text style={styles.convTime}>{timeAgo(item.lastTime)}</Text>
          </View>
          <View style={styles.convBottomRow}>
            <Text style={[styles.convPreview, item.unread > 0 && styles.convPreviewUnread]} numberOfLines={1}>
              {item.lastMessage}
            </Text>
            {item.unread > 0 && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadBadgeText}>{item.unread}</Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    )
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      <LinearGradient
        colors={['#162840', '#1E3A55', '#162840']}
        locations={[0, 0.5, 1]}
        style={[styles.header, { paddingTop: insets.top + spacing.sm }]}
      >
        <View>
          <Text style={styles.headerTitle}>Messages</Text>
          {totalUnread > 0 && (
            <Text style={styles.headerSub}>{totalUnread} unread</Text>
          )}
        </View>
      </LinearGradient>

      {loading
        ? <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
        : conversations.length === 0
          ? <View style={styles.emptyState}>
              <View style={styles.emptyIllustration}>
                <Text style={styles.emptyEmoji}>💬</Text>
              </View>
              <Text style={styles.emptyTitle}>No messages yet</Text>
              <Text style={styles.emptySubText}>Nudge a friend from the Friends tab to start a conversation</Text>
            </View>
          : <FlatList
              data={conversations}
              keyExtractor={i => i.partnerId}
              renderItem={renderItem}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
            />
      }
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
  listContent: { padding: spacing.lg, gap: spacing.sm },
  convRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.background, borderRadius: radius.lg,
    padding: spacing.md, ...shadow.sm,
  },
  avatar: {
    width: 46, height: 46, borderRadius: radius.full,
    justifyContent: 'center', alignItems: 'center',
  },
  avatarText: { fontWeight: '800', fontSize: 18 },
  convInfo: { flex: 1 },
  convTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 },
  convName: { fontSize: 15, fontWeight: '600', color: colors.text },
  convNameUnread: { fontWeight: '800' },
  convTime: { fontSize: 11, color: colors.textMuted },
  convBottomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  convPreview: { flex: 1, fontSize: 13, color: colors.textMuted, fontWeight: '400' },
  convPreviewUnread: { color: colors.text, fontWeight: '600' },
  unreadBadge: {
    backgroundColor: colors.primary, borderRadius: radius.full,
    minWidth: 18, height: 18, justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: 5, marginLeft: spacing.sm,
  },
  unreadBadgeText: { fontSize: 10, fontWeight: '800', color: colors.white },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl, gap: spacing.md },
  emptyIllustration: {
    width: 100, height: 100, borderRadius: radius.full,
    backgroundColor: colors.primaryLight, justifyContent: 'center', alignItems: 'center',
    marginBottom: spacing.sm,
  },
  emptyEmoji: { fontSize: 48 },
  emptyTitle: { ...typography.h3, color: colors.text },
  emptySubText: { ...typography.caption, textAlign: 'center', lineHeight: 20 },
})
