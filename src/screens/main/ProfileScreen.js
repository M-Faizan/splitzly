import { showAlert } from '../../utils/alert'
import React, { useState, useEffect } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, ActivityIndicator,
  Platform, Modal, FlatList, Image, Linking, StatusBar, useWindowDimensions
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import * as ImagePicker from 'expo-image-picker'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { useCurrency } from '../../hooks/useCurrency'
import { uploadAvatar, removeAvatar as removeAvatarFile } from '../../services/mediaService'
import { CURRENCIES } from '../../constants/app'
import { colors, spacing, radius, shadow, typography } from '../../constants/theme'
import SplitzlyLogo from '../../components/SplitzlyLogo'

export default function ProfileScreen({ navigation }) {
  const insets = useSafeAreaInsets()
  const { height: windowHeight } = useWindowDimensions()
  const { user } = useAuth()
  const { setCurrency: setGlobalCurrency } = useCurrency()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [avatarUrl, setAvatarUrl] = useState(null)
  const [currency, setCurrency] = useState('USD')
  const [editingName, setEditingName] = useState(false)
  const [nameInput, setNameInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [currencyModal, setCurrencyModal] = useState(false)
  const [stats, setStats] = useState({ groups: 0, expenses: 0, friends: 0 })

  useEffect(() => { fetchProfile() }, [])

  async function fetchProfile() {
    const [{ data: profile }, { data: groupData }, { data: friendData }, { data: expData }] = await Promise.all([
      supabase.from('profiles').select('name, email, avatar_url, currency').eq('id', user.id).single(),
      supabase.from('group_members').select('id').eq('user_id', user.id),
      supabase.from('friendships').select('id').or(`user_id.eq.${user.id},friend_id.eq.${user.id}`).eq('status', 'accepted'),
      supabase.from('expense_splits').select('id').eq('user_id', user.id),
    ])
    setName(profile?.name || '')
    setEmail(profile?.email || user.email || '')
    setAvatarUrl(profile?.avatar_url || null)
    setCurrency(profile?.currency || 'USD')
    setStats({
      groups: (groupData || []).length,
      friends: (friendData || []).length,
      expenses: (expData || []).length,
    })
    setLoading(false)
  }

  async function pickAvatar() {
    const { status } = Platform.OS === 'web' ? { status: 'granted' } : await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (status !== 'granted') return showAlert('Permission needed', 'Please allow access to your photo library.')
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: Platform.OS !== 'web', aspect: [1, 1], quality: 0.7 })
    if (result.canceled) return
    setUploadingAvatar(true)
    try {
      const url = await uploadAvatar(user.id, result.assets[0].uri)
      setAvatarUrl(url)
    } catch (e) {
      showAlert('Upload failed', e.message)
    }
    setUploadingAvatar(false)
  }

  async function removeAvatar() {
    try {
      await removeAvatarFile(user.id)
      setAvatarUrl(null)
    } catch (e) {
      showAlert('Could not delete photo', e.message)
    }
  }

  async function saveName() {
    if (!nameInput.trim() || nameInput.trim() === name) { setEditingName(false); return }
    setSaving(true)
    const { error } = await supabase.from('profiles').update({ name: nameInput.trim() }).eq('id', user.id)
    setSaving(false)
    if (error) return showAlert('Error', error.message)
    setName(nameInput.trim())
    setEditingName(false)
  }

  async function saveCurrency(code) {
    setCurrency(code)
    setGlobalCurrency(code)
    setCurrencyModal(false)
    await supabase.from('profiles').update({ currency: code }).eq('id', user.id)
  }

  async function handleSignOut() {
    showAlert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: () => supabase.auth.signOut() },
    ])
  }

  const initials = name ? name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : '?'
  const selectedCurrency = CURRENCIES.find(c => c.code === currency) || CURRENCIES[0]

  if (loading) return (
    <View style={styles.loadingContainer}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  )

  return (
    <View style={[styles.container, { height: windowHeight }]}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>
        {/* Gradient header */}
        <LinearGradient
          colors={['#162840', '#1E3A55', '#162840']}
          locations={[0, 0.5, 1]}
          style={[styles.header, { paddingTop: insets.top + spacing.sm }]}
        >
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={24} color={colors.white} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Profile</Text>
          <View style={{ width: 36 }} />
        </LinearGradient>

        {/* Avatar + name */}
        <View style={styles.avatarSection}>
          <View style={styles.avatarWrapper}>
            <TouchableOpacity onPress={pickAvatar} activeOpacity={0.8}>
              {uploadingAvatar
                ? <View style={styles.avatarCircle}><ActivityIndicator color={colors.white} /></View>
                : avatarUrl
                  ? <Image source={{ uri: avatarUrl }} style={styles.avatarCircle} />
                  : <View style={styles.avatarCircle}><Text style={styles.avatarText}>{initials}</Text></View>
              }
            </TouchableOpacity>
            <TouchableOpacity onPress={pickAvatar} style={styles.avatarEditBadge}>
              <Ionicons name="camera" size={12} color={colors.white} />
            </TouchableOpacity>
            {avatarUrl && (
              <TouchableOpacity onPress={removeAvatar} style={styles.avatarRemoveBadge}>
                <Ionicons name="close" size={11} color={colors.white} />
              </TouchableOpacity>
            )}
          </View>

          {editingName ? (
            <View style={styles.nameEditRow}>
              <TextInput
                style={styles.nameInput}
                value={nameInput}
                onChangeText={setNameInput}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={saveName}
                placeholder="Your name"
                placeholderTextColor={colors.textMuted}
              />
              <TouchableOpacity onPress={saveName} style={styles.saveNameBtn} disabled={saving}>
                {saving
                  ? <ActivityIndicator size="small" color={colors.white} />
                  : <Ionicons name="checkmark" size={18} color={colors.white} />
                }
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={styles.nameRow} onPress={() => { setNameInput(name); setEditingName(true) }}>
              <Text style={styles.profileName}>{name}</Text>
              <Ionicons name="pencil-outline" size={15} color={colors.textMuted} />
            </TouchableOpacity>
          )}
          <Text style={styles.profileEmail}>{email}</Text>
        </View>

        <View style={styles.content}>

        {/* Stats */}
        <View style={styles.statsCard}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{stats.groups}</Text>
            <Text style={styles.statLabel}>Groups</Text>
          </View>
          <View style={styles.statSep} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{stats.friends}</Text>
            <Text style={styles.statLabel}>Friends</Text>
          </View>
          <View style={styles.statSep} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{stats.expenses}</Text>
            <Text style={styles.statLabel}>Expenses</Text>
          </View>
        </View>

        {/* Preferences */}
        <Text style={styles.sectionLabel}>Preferences</Text>
        <View style={styles.menuCard}>
          <TouchableOpacity style={styles.menuRow} onPress={() => setCurrencyModal(true)}>
            <View style={[styles.menuIcon, { backgroundColor: 'rgba(124,58,237,0.18)' }]}>
              <Ionicons name="card-outline" size={17} color="#A78BFA" />
            </View>
            <Text style={styles.menuLabel}>Default Currency</Text>
            <View style={styles.menuValueRow}>
              <Text style={styles.menuValue}>{selectedCurrency.code} {selectedCurrency.symbol}</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </View>
          </TouchableOpacity>
          <View style={styles.menuDivider} />
          <TouchableOpacity style={styles.menuRow}>
            <View style={[styles.menuIcon, { backgroundColor: 'rgba(234,179,8,0.18)' }]}>
              <Ionicons name="notifications-outline" size={17} color="#FCD34D" />
            </View>
            <Text style={styles.menuLabel}>Notifications</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        {/* About */}
        <Text style={styles.sectionLabel}>About</Text>
        <View style={styles.aboutCard}>
          <View style={styles.aboutAppRow}>
            <SplitzlyLogo size={44} />
            <View style={{ flex: 1 }}>
              <Text style={styles.aboutAppName}>Splitzly</Text>
              <Text style={styles.aboutAppTagline}>Split expenses. Stay friends.</Text>
            </View>
            <Text style={styles.aboutAppVersion}>v1.0.0</Text>
          </View>
          <Text style={styles.aboutDesc}>
            Splitzly helps you split bills and track shared expenses with friends and groups — no spreadsheets, no awkward reminders. Built with ❤️ to make money between friends simple.
          </Text>
        </View>

        <View style={styles.menuCard}>
          <TouchableOpacity style={styles.menuRow} onPress={() => Linking.openURL('https://splitzly.app/rate')}>
            <View style={[styles.menuIcon, { backgroundColor: 'rgba(234,179,8,0.18)' }]}>
              <Ionicons name="star-outline" size={17} color="#FCD34D" />
            </View>
            <Text style={styles.menuLabel}>Rate Splitzly</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </TouchableOpacity>
          <View style={styles.menuDivider} />
          <TouchableOpacity style={styles.menuRow} onPress={() => Linking.openURL('https://splitzly.app/privacy')}>
            <View style={[styles.menuIcon, { backgroundColor: colors.primaryLight }]}>
              <Ionicons name="shield-checkmark-outline" size={17} color={colors.primary} />
            </View>
            <Text style={styles.menuLabel}>Privacy Policy</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </TouchableOpacity>
          <View style={styles.menuDivider} />
          <TouchableOpacity style={styles.menuRow} onPress={() => Linking.openURL('https://splitzly.app/terms')}>
            <View style={[styles.menuIcon, { backgroundColor: colors.accentLight }]}>
              <Ionicons name="document-text-outline" size={17} color={colors.accent} />
            </View>
            <Text style={styles.menuLabel}>Terms of Service</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </TouchableOpacity>
          <View style={styles.menuDivider} />
          <TouchableOpacity style={styles.menuRow} onPress={() => Linking.openURL('mailto:hello@splitzly.app')}>
            <View style={[styles.menuIcon, { backgroundColor: 'rgba(236,72,153,0.18)' }]}>
              <Ionicons name="mail-outline" size={17} color="#F472B6" />
            </View>
            <Text style={styles.menuLabel}>Contact Us</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        {/* Sign out — subtle at the bottom */}
        <TouchableOpacity style={styles.replayBtn} onPress={async () => {
          await AsyncStorage.removeItem('onboarding_done')
          showAlert('Done', 'Relaunch the app to see the onboarding tour.')
        }}>
          <Ionicons name="play-circle-outline" size={16} color={colors.textMuted} />
          <Text style={styles.replayText}>Replay Onboarding</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut}>
          <Ionicons name="log-out-outline" size={16} color={colors.pending} />
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>

        <Text style={styles.footerText}>© {new Date().getFullYear()} Splitzly · v1.0.0</Text>
        </View>
      </ScrollView>

      {/* Currency Modal */}
      <Modal visible={currencyModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modal, { paddingBottom: insets.bottom + spacing.lg }]}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Default Currency</Text>
            <FlatList
              data={CURRENCIES}
              keyExtractor={c => c.code}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.currencyRow}
                  onPress={() => saveCurrency(item.code)}
                  activeOpacity={0.7}
                >
                  <View style={styles.currencySymbolBox}>
                    <Text style={styles.currencySymbol}>{item.symbol}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.currencyCode}>{item.code}</Text>
                    <Text style={styles.currencyName}>{item.name}</Text>
                  </View>
                  {currency === item.code && (
                    <Ionicons name="checkmark-circle" size={22} color={colors.primary} />
                  )}
                </TouchableOpacity>
              )}
              ItemSeparatorComponent={() => <View style={styles.currencySep} />}
            />
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setCurrencyModal(false)}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface, overflow: 'hidden' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingBottom: spacing.xxl + spacing.lg,
  },
  backBtn: { width: 36, height: 36, justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: colors.white },

  avatarSection: {
    alignItems: 'center',
    marginTop: -(spacing.xxl),
    marginBottom: spacing.md,
  },
  avatarWrapper: { position: 'relative' },
  avatarCircle: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: colors.primary,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 4, borderColor: colors.surface,
    ...shadow.md,
  },
  avatarText: { color: colors.white, fontSize: 28, fontWeight: '800' },
  avatarEditBadge: {
    position: 'absolute', bottom: 2, right: 2,
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: colors.accent,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: colors.surface,
  },
  avatarRemoveBadge: {
    position: 'absolute', top: 0, right: -2,
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: colors.pending,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: colors.surface,
  },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.sm },
  profileName: { fontSize: 20, fontWeight: '800', color: colors.text, letterSpacing: -0.3 },
  profileEmail: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  nameEditRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  nameInput: {
    fontSize: 18, fontWeight: '700', color: colors.text,
    borderBottomWidth: 2, borderBottomColor: colors.primary,
    paddingVertical: 4, paddingHorizontal: spacing.xs, minWidth: 120,
  },
  saveNameBtn: {
    width: 32, height: 32, borderRadius: radius.full,
    backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center',
  },

  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, maxWidth: 600, width: '100%', alignSelf: 'center' },

  statsCard: {
    flexDirection: 'row', backgroundColor: colors.background,
    borderRadius: radius.xl, padding: spacing.md,
    marginBottom: spacing.lg, ...shadow.sm,
  },
  statItem: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 22, fontWeight: '800', color: colors.primary },
  statLabel: { fontSize: 11, color: colors.textMuted, fontWeight: '500', marginTop: 2 },
  statSep: { width: 1, backgroundColor: colors.border, marginVertical: 4 },

  sectionLabel: { ...typography.caption, fontWeight: '700', marginBottom: spacing.sm, marginTop: spacing.xs, color: colors.textSecondary },

  menuCard: {
    backgroundColor: colors.background, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border,
    overflow: 'hidden', marginBottom: spacing.lg, ...shadow.sm,
  },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md },
  menuDivider: { height: 1, backgroundColor: colors.border, marginLeft: spacing.md + 34 + spacing.md },
  menuIcon: { width: 34, height: 34, borderRadius: radius.md, justifyContent: 'center', alignItems: 'center' },
  menuLabel: { flex: 1, fontSize: 15, color: colors.text, fontWeight: '500' },
  menuValueRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  menuValue: { fontSize: 14, color: colors.textMuted, fontWeight: '500' },

  replayBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, paddingVertical: spacing.md, marginBottom: spacing.xs },
  replayText: { fontSize: 14, fontWeight: '600', color: colors.textMuted },
  signOutBtn: {    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.sm, paddingVertical: spacing.sm,
    marginBottom: spacing.xs,
  },
  signOutText: { fontSize: 14, fontWeight: '600', color: colors.pending },
  version: { textAlign: 'center', fontSize: 12, color: colors.textMuted },

  // About
  aboutCard: {
    backgroundColor: colors.background, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border,
    overflow: 'hidden', marginBottom: spacing.lg, ...shadow.sm,
    padding: spacing.md,
  },
  aboutAppRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.sm },
  aboutAppName: { fontSize: 16, fontWeight: '800', color: colors.text },
  aboutAppTagline: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  aboutAppVersion: { fontSize: 12, fontWeight: '600', color: colors.textMuted },
  aboutDesc: { fontSize: 13, color: colors.textSecondary, lineHeight: 20 },
  footerText: { textAlign: 'center', fontSize: 12, color: colors.textMuted, marginBottom: spacing.lg },

  // Currency modal
  modalOverlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  modal: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.xxl, borderTopRightRadius: radius.xxl,
    padding: spacing.lg, maxHeight: '75%',
  },
  modalHandle: {
    width: 40, height: 4, borderRadius: radius.full,
    backgroundColor: colors.border, alignSelf: 'center', marginBottom: spacing.lg,
  },
  modalTitle: { ...typography.h3, marginBottom: spacing.md },
  currencyRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm + 2 },
  currencySymbolBox: {
    width: 40, height: 40, borderRadius: radius.md,
    backgroundColor: colors.primaryLight, justifyContent: 'center', alignItems: 'center',
  },
  currencySymbol: { fontSize: 16, fontWeight: '700', color: colors.primary },
  currencyCode: { fontSize: 15, fontWeight: '700', color: colors.text },
  currencyName: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  currencySep: { height: 1, backgroundColor: colors.border },
  cancelBtn: { padding: spacing.md, marginTop: spacing.sm },
  cancelText: { textAlign: 'center', color: colors.textSecondary, fontSize: 15, fontWeight: '600' },
})
