import React, { useRef, useState } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  Animated, Dimensions, Platform,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { colors, spacing, radius, shadow } from '../../constants/theme'
import SplitzlyLogo from '../../components/SplitzlyLogo'

const { width } = Dimensions.get('window')

const SLIDES = [
  {
    key: 'welcome',
    icon: null, // uses SplitzlyLogo
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

export default function OnboardingScreen({ onDone }) {
  const insets = useSafeAreaInsets()
  const [current, setCurrent] = useState(0)
  const scrollX = useRef(new Animated.Value(0)).current
  const flatRef = useRef(null)

  async function finish() {
    await AsyncStorage.setItem('onboarding_done', 'true')
    onDone()
  }

  function next() {
    if (current < SLIDES.length - 1) {
      flatRef.current?.scrollToIndex({ index: current + 1, animated: true })
      setCurrent(current + 1)
    } else {
      finish()
    }
  }

  const renderSlide = ({ item }) => (
    <View style={styles.slide}>
      {item.icon === null
        ? <View style={{ marginBottom: spacing.xl }}><SplitzlyLogo size={140} dark /></View>
        : (
          <View style={[styles.iconCircle, { backgroundColor: item.iconBg }]}>
            <Ionicons name={item.icon} size={64} color={colors.white} />
          </View>
        )
      }
      <Text style={styles.slideTitle}>{item.title}</Text>
      <Text style={styles.slideSubtitle}>{item.subtitle}</Text>
    </View>
  )

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
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
        style={styles.flatList}
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

      {/* Button */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.lg }]}>
        <TouchableOpacity
          style={[styles.nextBtn, { backgroundColor: SLIDES[current].accent }]}
          onPress={next}
          activeOpacity={0.85}
        >
          <Text style={styles.nextBtnText}>
            {current === SLIDES.length - 1 ? 'Get Started' : 'Next'}
          </Text>
          <Ionicons
            name={current === SLIDES.length - 1 ? 'checkmark' : 'arrow-forward'}
            size={18}
            color={colors.white}
          />
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },

  skipBtn: {
    position: 'absolute', top: 56, right: spacing.lg, zIndex: 10,
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
    backgroundColor: colors.surface, borderRadius: radius.full,
    borderWidth: 1, borderColor: colors.border,
  },
  skipText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },

  flatList: { flex: 1 },

  slide: {
    width,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl + spacing.md,
    paddingBottom: spacing.xxl,
  },
  iconCircle: {
    width: 140, height: 140, borderRadius: 70,
    justifyContent: 'center', alignItems: 'center',
    marginBottom: spacing.xl, ...shadow.md,
  },
  slideTitle: {
    fontSize: 28, fontWeight: '800', color: colors.text,
    textAlign: 'center', letterSpacing: -0.5, marginBottom: spacing.md,
  },
  slideSubtitle: {
    fontSize: 16, color: colors.textSecondary, textAlign: 'center',
    lineHeight: 24, fontWeight: '400',
  },

  dotsRow: {
    flexDirection: 'row', justifyContent: 'center',
    alignItems: 'center', gap: spacing.xs, marginBottom: spacing.lg,
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
