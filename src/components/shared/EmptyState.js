import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { colors, spacing } from '../../constants/theme'

export default function EmptyState({ icon = 'ellipse-outline', message = 'Nothing here yet' }) {
  return (
    <View style={styles.container}>
      <Ionicons name={icon} size={48} color={colors.textMuted} style={styles.icon} />
      <Text style={styles.message}>{message}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xxl },
  icon: { marginBottom: spacing.md, opacity: 0.5 },
  message: { fontSize: 14, color: colors.textMuted, textAlign: 'center' },
})
