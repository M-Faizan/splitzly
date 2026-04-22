import React, { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, Alert, KeyboardAvoidingView, Platform,
  ActivityIndicator, StatusBar
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { supabase } from '../../lib/supabase'
import { colors, spacing, radius, shadow } from '../../constants/theme'
import SplitzlyLogo from '../../components/SplitzlyLogo'

export default function LoginScreen({ navigation }) {
  const insets = useSafeAreaInsets()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin() {
    if (!email || !password) return Alert.alert('Error', 'Please fill in all fields')
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (error) Alert.alert('Login Failed', error.message)
  }

  return (
    <LinearGradient
      colors={['#162840', '#1E3A55', '#162840']}
      locations={[0, 0.5, 1]}
      style={styles.container}
    >
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      {/* Subtle glow accents */}
      <View style={styles.glowTop} />
      <View style={styles.glowBottom} />

      <KeyboardAvoidingView
        style={styles.inner}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={[styles.content, { paddingTop: insets.top + spacing.xxl + spacing.xl }]}>

          {/* Logo + branding */}
          <View style={styles.logoWrap}>
            <SplitzlyLogo size={88} />
            <Text style={styles.appName}>Splitzly</Text>
            <Text style={styles.tagline}>Keep the friends, lose the debt.</Text>
          </View>

          {/* Form */}
          <View style={styles.form}>
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
                placeholder="Password"
                placeholderTextColor="rgba(255,255,255,0.28)"
                secureTextEntry
                returnKeyType="done"
                onSubmitEditing={handleLogin}
                value={password}
                onChangeText={setPassword}
              />
            </View>

            <TouchableOpacity style={[styles.loginBtn, (!email || !password) && { opacity: 0.4 }]} onPress={handleLogin} disabled={loading || !email || !password}>
              {loading
                ? <ActivityIndicator color={colors.white} />
                : <Text style={styles.loginBtnText}>Log In</Text>
              }
            </TouchableOpacity>

            <TouchableOpacity style={styles.forgotBtn}>
              <Text style={styles.forgotText}>Forgot password?</Text>
            </TouchableOpacity>
          </View>

          {/* Spacer */}
          <View style={{ flex: 1 }} />

          {/* Bottom — sign up */}
          <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.xl + spacing.lg }]}>
            <View style={styles.dividerRow}>
              <View style={styles.divider} />
              <Text style={styles.dividerText}>New to Splitzly?</Text>
              <View style={styles.divider} />
            </View>
            <TouchableOpacity
              style={styles.signupBtn}
              onPress={() => navigation.navigate('SignUp')}
            >
              <Text style={styles.signupBtnText}>Create an account</Text>
            </TouchableOpacity>
          </View>

        </View>
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
    flex: 1,
    paddingHorizontal: spacing.lg,
  },

  logoWrap: {
    alignItems: 'center',
    marginBottom: spacing.xl + spacing.sm,
  },
  appName: {
    fontSize: 38, fontWeight: '800', color: colors.white,
    letterSpacing: -1, marginTop: spacing.xs,
  },
  tagline: {
    fontSize: 13, color: 'rgba(255,255,255,0.5)',
    fontWeight: '500', marginTop: 5,
  },

  form: {
    width: '100%',
  },

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

  loginBtn: {
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
  loginBtnText: {
    color: colors.white, fontWeight: '800', fontSize: 16, letterSpacing: 0.3,
  },

  forgotBtn: {
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  forgotText: {
    fontSize: 13, color: 'rgba(255,255,255,0.45)', fontWeight: '500',
  },

  footer: {
    width: '100%',
    marginTop: spacing.lg,
  },
  dividerRow: {
    flexDirection: 'row', alignItems: 'center',
    gap: spacing.sm, marginBottom: spacing.md,
  },
  divider: { flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.1)' },
  dividerText: { fontSize: 12, color: 'rgba(255,255,255,0.35)', fontWeight: '500' },

  signupBtn: {
    alignSelf: 'center',
    width: '70%',
    alignItems: 'center',
    paddingVertical: spacing.md + 2,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  signupBtnText: {
    color: '#00E5D0', fontWeight: '700', fontSize: 15,
  },
})
