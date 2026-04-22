import React from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'

export default class ErrorBoundary extends React.Component {
  state = { hasError: false, error: null }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught:', error, info)
  }

  render() {
    if (!this.state.hasError) return this.props.children
    return (
      <View style={styles.container}>
        <Ionicons name="alert-circle-outline" size={64} color="#00C9B1" />
        <Text style={styles.title}>Something went wrong</Text>
        <Text style={styles.message}>
          {this.state.error?.message || 'An unexpected error occurred.'}
        </Text>
        <TouchableOpacity
          style={styles.btn}
          onPress={() => this.setState({ hasError: false, error: null })}
        >
          <Text style={styles.btnText}>Try Again</Text>
        </TouchableOpacity>
      </View>
    )
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1, backgroundColor: '#0F1F33',
    alignItems: 'center', justifyContent: 'center', padding: 32,
  },
  title: {
    fontSize: 22, fontWeight: '800', color: '#FFFFFF',
    marginTop: 20, marginBottom: 10, letterSpacing: -0.5,
  },
  message: {
    fontSize: 14, color: 'rgba(255,255,255,0.5)',
    textAlign: 'center', lineHeight: 22, marginBottom: 32,
  },
  btn: {
    backgroundColor: '#00C9B1', borderRadius: 50,
    paddingVertical: 14, paddingHorizontal: 40,
  },
  btnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },
})
