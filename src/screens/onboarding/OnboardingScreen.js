import React, { useRef, useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  Animated, useWindowDimensions,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { colors, spacing, radius, shadow } from '../../constants/theme'
import SplitzlyLogo from '../../components/SplitzlyLogo'

const SLIDES = [
  {
    key: 'welcome',
    icon: null,
    iconBg: colors.primary,
    title: 'Welcome to Splitzly',
    subtitle: 'The easiest way to split bills and track shared expenses with friends.',
    accent: colors.accent,
  },
  {
    key: 'groups',
    icon: 'people',
    iconBg: '#3B5BDB',
    title: 'Create Groups',
    subtitle: 'Organize expenses by trip, flat, or any occasion. Add friends and track who owes what.',
    accent: '#3B5BDB',
  },
  {
    key: 'expenses',
    icon: 'receipt',
    iconBg: '#0CA678',
    title: 'Add Expenses',
    subtitle: 'Log shared expenses in seconds. Split equally or set custom amounts for each person.',
    accent: '#0CA678',
  },
  {
    key: 'settle',
    icon: 'checkmark-circle',
    iconBg: colors.accent,
    title: 'Settle Up',
    subtitle: 'See exactly who owes you and how much. Mark payments as settled with one tap.',
    accent: colors.accent,
  },
  {
    key: 'scanner',
    icon: 'scan',
    iconBg: '#E8590C',
    title: 'Scan Receipts',
    subtitle: 'Point your camera at any receipt. AI instantly reads the total, items, and category — no typing needed.',
    accent: '#E8590C',
  },
]

const SLIDE_HEIGHT = 340

export default function OnboardingScreen({ onDone }) {
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const [current, setCurrent] = useState(0)
  const scrollX = useRef(new Animated.Value(0)).current
  const flatRef = useRef(null)

  const renderSlide = useCallback(({ item }) => (
    <View style={[styles.slide, { width, height: SLIDE_HEIGHT }]}>
      {item.icon === null
        ? <View style={styles.logoWrap}><SplitzlyLogo size={110} dark /></View>
        : (
          <View style={[styles.iconCircle, { backgroundColor: item.iconBg }]}>
            <Ionicons name={item.icon} size={56} color={colors.white} />
          </View>
        )
      }
      <Text style={styles.slideTitle}>{item.title}</Text>
      <Text style={styles.slideSubtitle}>{item.subtitle}</Text>
    </View>
  ), [width])

  async function finish() {
    await AsyncStorage.setItem('onboarding_done', 'true')
    onDone()
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {/* Skip */}
      <TouchableOpacity style={styles.skipBtn} onPress={finish}>
        <Text style={styles.skipText}>Skip</Text>
      </TouchableOpacity>

      {/* Slides */}
      <Animated.FlatList
        ref={flatRef}
        data={SLIDES}
        keyExtractor={i => i.key}
        renderItem={renderSlide}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], { useNativeDriver: false })}
        onMomentumScrollEnd={e => {
          const idx = Math.round(e.nativeEvent.contentOffset.x / width)
          setCurrent(idx)
        }}
        getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
        style={{ height: SLIDE_HEIGHT, flexGrow: 0 }}
      />

      {/* Dots */}
      <View style={styles.dotsRow}>
        {SLIDES.map((_, i) => {
          const inputRange = [(i - 1) * width, i * width, (i + 1) * width]
          const dotWidth = scrollX.interpolate({ inputRange, outputRange: [8, 24, 8], extrapolate: 'clamp' })
          const opacity = scrollX.interpolate({ inputRange, outputRange: [0.35, 1, 0.35], extrapolate: 'clamp' })
          return (
            <Animated.View
              key={i}
              style={[styles.dot, { width: dotWidth, opacity, backgroundColor: SLIDES[current].accent }]}
            />
          )
        })}
      </View>

      {/* Only show Get Started on last slide */}
      <View style={styles.footer}>
        {current === SLIDES.length - 1 && (
          <TouchableOpacity
            style={[styles.nextBtn, { backgroundColor: SLIDES[current].accent }]}
            onPress={finish}
            activeOpacity={0.85}
          >
            <Text style={styles.nextBtnText}>Get Started</Text>
            <Ionicons name="checkmark" size={18} color={colors.white} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    maxWidth: 480,
    width: '100%',
    alignSelf: 'center',
  },

  skipBtn: {
    alignSelf: 'flex-end',
    marginRight: spacing.lg,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
    backgroundColor: colors.surface, borderRadius: radius.full,
    borderWidth: 1, borderColor: colors.border,
  },
  skipText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },

  slide: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl + spacing.md,
  },
  logoWrap: { marginBottom: spacing.lg },
  iconCircle: {
    width: 120, height: 120, borderRadius: 60,
    justifyContent: 'center', alignItems: 'center',
    marginBottom: spacing.lg, ...shadow.md,
  },
  slideTitle: {
    fontSize: 26, fontWeight: '800', color: colors.text,
    textAlign: 'center', letterSpacing: -0.5, marginBottom: spacing.sm,
  },
  slideSubtitle: {
    fontSize: 15, color: colors.textSecondary, textAlign: 'center',
    lineHeight: 22, fontWeight: '400',
  },

  dotsRow: {
    flexDirection: 'row', justifyContent: 'center',
    alignItems: 'center', gap: spacing.xs,
    marginTop: spacing.xl, marginBottom: spacing.lg,
  },
  dot: { height: 8, borderRadius: radius.full },

  footer: { paddingHorizontal: spacing.lg },
  nextBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.sm, paddingVertical: spacing.md + 2,
    borderRadius: radius.xl, ...shadow.md,
  },
  nextBtnText: { color: colors.white, fontSize: 17, fontWeight: '700' },
})
