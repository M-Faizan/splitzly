import React, { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, Alert, KeyboardAvoidingView, Platform,
  ActivityIndicator, ScrollView, StatusBar
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { supabase } from '../../lib/supabase'
import { colors, spacing, radius, shadow } from '../../constants/theme'
import SplitzlyLogo from '../../components/SplitzlyLogo'

export default function SignUpScreen({ navigation }) {
  const insets = useSafeAreaInsets()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSignUp() {
    if (!name || !email || !password) return Alert.alert('Error', 'Please fill in all fields')
    if (password.length < 6) return Alert.alert('Error', 'Password must be at least 6 characters')
    setLoading(true)

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name } }
    })
    if (error) { setLoading(false); return Alert.alert('Sign Up Failed', error.message) }

    if (data.user) {
      const { error: profileError } = await supabase
        .from('profiles')
        .upsert({ id: data.user.id, name, email: email.toLowerCase().trim() })
      if (profileError) console.log('Profile error:', profileError.message)
    }

    setLoading(false)
  }

  return (
    <LinearGradient
      colors={['#162840', '#1E3A55', '#162840']}
      locations={[0, 0.5, 1]}
      style={styles.container}
    >
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      <View style={styles.glowTop} />
      <View style={styles.glowBottom} />

      <KeyboardAvoidingView
        style={styles.inner}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.xl }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Logo + branding */}
          <View style={styles.logoWrap}>
            <SplitzlyLogo size={88} />
            <Text style={styles.appName}>Splitzly</Text>
            <Text style={styles.tagline}>Keep the friends, lose the debt.</Text>
          </View>

          {/* Form */}
          <View style={styles.form}>
            <View style={styles.inputWrap}>
              <Ionicons name="person-outline" size={18} color="rgba(255,255,255,0.4)" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Full name"
                placeholderTextColor="rgba(255,255,255,0.28)"
                returnKeyType="next"
                value={name}
                onChangeText={setName}
              />
            </View>

            <View style={styles.inputWrap}>
              <Ionicons name="mail-outline" size={18} color="rgba(255,255,255,0.4)" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Email address"
                placeholderTextColor="rgba(255,255,255,0.28)"
                autoCapitalize="none"
                keyboardType="email-address"
                returnKeyType="next"
                value={email}
                onChangeText={setEmail}
              />
            </View>

            <View style={styles.inputWrap}>
              <Ionicons name="lock-closed-outline" size={18} color="rgba(255,255,255,0.4)" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Password (min. 6 characters)"
                placeholderTextColor="rgba(255,255,255,0.28)"
                secureTextEntry
                returnKeyType="done"
                onSubmitEditing={handleSignUp}
                value={password}
                onChangeText={setPassword}
              />
            </View>

            <TouchableOpacity style={[styles.signupBtn, (!name || !email || !password) && { opacity: 0.4 }]} onPress={handleSignUp} disabled={loading || !name || !email || !password}>
              {loading
                ? <ActivityIndicator color={colors.white} />
                : <Text style={styles.signupBtnText}>Create Account</Text>
              }
            </TouchableOpacity>

            <Text style={styles.terms}>
              By signing up you agree to our{' '}
              <Text style={styles.termsLink}>Terms of Service</Text>
              {' '}and{' '}
              <Text style={styles.termsLink}>Privacy Policy</Text>
            </Text>
          </View>

          {/* Footer */}
          <View style={{ flex: 1 }} />
          <View style={styles.footer}>
            <View style={styles.dividerRow}>
              <View style={styles.divider} />
              <Text style={styles.dividerText}>Already have an account?</Text>
              <View style={styles.divider} />
            </View>
            <TouchableOpacity
              style={styles.loginBtn}
              onPress={() => navigation.navigate('Login')}
            >
              <Text style={styles.loginBtnText}>Log In</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  glowTop: {
    position: 'absolute', top: -140, left: -100,
    width: 240, height: 240, borderRadius: 120,
    backgroundColor: 'rgba(0,229,208,0.09)',
    transform: [{ scaleX: 1.5 }],
  },
  glowBottom: {
    position: 'absolute', bottom: -100, right: -80,
    width: 200, height: 200, borderRadius: 100,
    backgroundColor: 'rgba(0,229,208,0.07)',
    transform: [{ scaleX: 1.4 }],
  },

  inner: { flex: 1 },
  content: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
  },

  logoWrap: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  appName: {
    fontSize: 38, fontWeight: '800', color: colors.white,
    letterSpacing: -1, marginTop: spacing.xs,
  },
  tagline: {
    fontSize: 13, color: 'rgba(255,255,255,0.5)',
    fontWeight: '500', marginTop: 5,
  },

  form: { width: '100%' },

  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  inputIcon: { marginRight: spacing.sm },
  input: {
    flex: 1,
    fontSize: 15,
    color: colors.white,
    paddingVertical: spacing.md + 2,
  },

  signupBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingVertical: spacing.md + 2,
    paddingHorizontal: spacing.xxl,
    alignSelf: 'center',
    width: '70%',
    alignItems: 'center',
    marginTop: spacing.sm,
    ...shadow.md,
  },
  signupBtnText: {
    color: colors.white, fontWeight: '800', fontSize: 16, letterSpacing: 0.3,
  },

  terms: {
    fontSize: 11, color: 'rgba(255,255,255,0.35)',
    textAlign: 'center', marginTop: spacing.md, lineHeight: 16,
  },
  termsLink: { color: 'rgba(0,229,208,0.7)', fontWeight: '600' },

  footer: {
    width: '100%',
    marginTop: spacing.xl + spacing.lg,
    paddingBottom: spacing.lg,
  },
  dividerRow: {
    flexDirection: 'row', alignItems: 'center',
    gap: spacing.sm, marginBottom: spacing.md,
  },
  divider: { flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.1)' },
  dividerText: { fontSize: 12, color: 'rgba(255,255,255,0.35)', fontWeight: '500' },

  loginBtn: {
    alignSelf: 'center',
    width: '70%',
    alignItems: 'center',
    paddingVertical: spacing.md + 2,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  loginBtnText: {
    color: '#00E5D0', fontWeight: '700', fontSize: 15,
  },
})
