import React from 'react'
import { View, Text, Image, StyleSheet } from 'react-native'
import { AVATAR_COLORS } from '../../constants/app'
import { radius } from '../../constants/theme'

export default function Avatar({ name = '', avatarUrl, size = 32, colorIndex = 0 }) {
  const colorStyle = AVATAR_COLORS[colorIndex % AVATAR_COLORS.length]
  const initial = name?.[0]?.toUpperCase() || '?'
  const fontSize = size * 0.38

  if (avatarUrl) {
    return <Image source={{ uri: avatarUrl }} style={[styles.base, { width: size, height: size, borderRadius: size / 2 }]} />
  }

  return (
    <View style={[styles.base, { width: size, height: size, borderRadius: size / 2, backgroundColor: colorStyle.bg }]}>
      <Text style={[styles.initial, { color: colorStyle.text, fontSize }]}>{initial}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  base: { justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  initial: { fontWeight: '800' },
})
