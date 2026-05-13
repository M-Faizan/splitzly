import React, { useState, useCallback, useRef, useEffect } from 'react'
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  TextInput, KeyboardAvoidingView, Platform, ActivityIndicator
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { timeAgo } from '../../lib/formatters'
import { colors, spacing, radius, typography } from '../../constants/theme'

export default function ChatScreen({ route, navigation }) {
  const { partnerId, partnerName, nudgeAmount } = route.params
  const { user } = useAuth()
  const [myName, setMyName] = useState('')
  const insets = useSafeAreaInsets()
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [input, setInput] = useState(nudgeAmount ? `Hey, you owe me €${parseFloat(nudgeAmount).toFixed(2)} — settle up when you can! 👋` : '')
  const [sending, setSending] = useState(false)
  const flatListRef = useRef(null)

  useEffect(() => {
    navigation.setOptions({
      title: partnerName,
      headerLeft: () => (
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ paddingHorizontal: spacing.sm, padding: 4 }}>
          <Ionicons name="chevron-back" size={24} color={colors.primary} />
        </TouchableOpacity>
      ),
    })
    supabase.from('profiles').select('name').eq('id', user.id).single()
      .then(({ data }) => setMyName(data?.name?.split(' ')[0] || 'You'))
  }, [partnerName])

  useFocusEffect(useCallback(() => {
    fetchMessages()
    markAsRead()
  }, []))

  async function fetchMessages() {
    const { data } = await supabase
      .from('messages')
      .select('id, body, read, created_at, from_user_id, to_user_id')
      .or(`and(from_user_id.eq.${user.id},to_user_id.eq.${partnerId}),and(from_user_id.eq.${partnerId},to_user_id.eq.${user.id})`)
      .order('created_at', { ascending: true })
    setMessages(data || [])
    setLoading(false)
  }

  async function markAsRead() {
    await supabase
      .from('messages')
      .update({ read: true })
      .eq('to_user_id', user.id)
      .eq('from_user_id', partnerId)
      .eq('read', false)
  }

  async function sendMessage() {
    const body = input.trim()
    if (!body) return
    setSending(true)
    setInput('')
    const { data, error } = await supabase.from('messages').insert({
      from_user_id: user.id,
      to_user_id: partnerId,
      body,
      read: false,
    }).select().single()
    setSending(false)
    if (!error && data) {
      setMessages(prev => [...prev, data])
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100)
    }
  }

  const renderMessage = ({ item }) => {
    const isMine = item.from_user_id === user.id
    return (
      <View style={[styles.msgRow, isMine ? styles.msgRowRight : styles.msgRowLeft]}>
        <Text style={styles.senderName}>{isMine ? myName : partnerName}</Text>
        <View style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleTheirs]}>
          <Text style={[styles.bubbleText, isMine ? styles.bubbleTextMine : styles.bubbleTextTheirs]}>
            {item.body}
          </Text>
        </View>
        <Text style={[styles.msgTime, isMine ? styles.msgTimeRight : styles.msgTimeLeft]}>
          {timeAgo(item.created_at)}
        </Text>
      </View>
    )
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={90}
    >
      {Platform.OS === 'web' && (
        <View style={styles.webHeader}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.webBackBtn}>
            <Ionicons name="chevron-back" size={22} color={colors.primary} />
          </TouchableOpacity>
          <Text style={styles.webHeaderTitle}>{partnerName}</Text>
          <View style={{ width: 36 }} />
        </View>
      )}
      {loading
        ? <ActivityIndicator size="large" color={colors.primary} style={{ flex: 1 }} />
        : <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={i => i.id}
            renderItem={renderMessage}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
            ListEmptyComponent={
              <View style={styles.emptyChat}>
                <Text style={styles.emptyChatText}>Say hi to {partnerName}!</Text>
              </View>
            }
          />
      }

      <View style={[styles.inputBar, { paddingBottom: insets.bottom + spacing.xs }]}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder={`Message ${partnerName}...`}
          placeholderTextColor={colors.textMuted}
          multiline
          maxLength={500}
          returnKeyType="send"
          onSubmitEditing={sendMessage}
          blurOnSubmit
        />
        <TouchableOpacity
          style={[styles.sendBtn, (!input.trim() || sending) && { opacity: 0.4 }]}
          onPress={sendMessage}
          disabled={!input.trim() || sending}
          activeOpacity={0.8}
        >
          {sending
            ? <ActivityIndicator size="small" color={colors.white} />
            : <Ionicons name="send" size={16} color={colors.white} />
          }
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  webHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.sm, paddingVertical: spacing.sm,
    backgroundColor: '#162840', borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  webBackBtn: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
  webHeaderTitle: { fontSize: 16, fontWeight: '700', color: colors.white },
  listContent: { padding: spacing.md, gap: spacing.sm, flexGrow: 1 },
  msgRow: { maxWidth: '80%', marginBottom: 2 },
  msgRowRight: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  msgRowLeft: { alignSelf: 'flex-start', alignItems: 'flex-start' },
  bubble: {
    borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
  },
  bubbleMine: { backgroundColor: colors.primary, borderBottomRightRadius: 4 },
  bubbleTheirs: { backgroundColor: colors.background, borderBottomLeftRadius: 4, borderWidth: 1, borderColor: colors.border },
  bubbleText: { fontSize: 15, lineHeight: 21 },
  bubbleTextMine: { color: colors.white },
  bubbleTextTheirs: { color: colors.text },
  msgTime: { fontSize: 10, color: colors.textMuted, marginTop: 2, marginHorizontal: spacing.xs },
  msgTimeRight: { textAlign: 'right' },
  msgTimeLeft: { textAlign: 'left' },
  senderName: { fontSize: 11, fontWeight: '600', color: colors.textSecondary, marginBottom: 3, marginHorizontal: spacing.xs },
  emptyChat: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 80 },
  emptyChatText: { fontSize: 14, color: colors.textMuted },
  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm,
    paddingHorizontal: spacing.md, paddingTop: spacing.sm,
    backgroundColor: colors.background, borderTopWidth: 1, borderTopColor: colors.border,
  },
  input: {
    flex: 1, fontSize: 15, color: colors.text,
    backgroundColor: colors.surface, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2,
    maxHeight: 100,
  },
  sendBtn: {
    width: 38, height: 38, borderRadius: radius.full,
    backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center',
  },
})
