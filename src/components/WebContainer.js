import React from 'react'
import { View, Platform, StyleSheet } from 'react-native'

export default function WebContainer({ children, style }) {
  if (Platform.OS !== 'web') return <>{children}</>
  return <View style={[styles.wrap, style]}>{children}</View>
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    maxWidth: 600,
    width: '100%',
    alignSelf: 'center',
  },
})
