import 'react-native-url-polyfill/auto'
import React from 'react'
import { View } from 'react-native'
import { AuthProvider } from './src/hooks/useAuth'
import { CurrencyProvider } from './src/hooks/useCurrency'
import AppNavigator from './src/navigation/AppNavigator'
import ErrorBoundary from './src/components/ErrorBoundary'
import OfflineBanner from './src/components/OfflineBanner'

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <CurrencyProvider>
          <View style={{ flex: 1 }}>
            <ErrorBoundary>
              <AppNavigator />
            </ErrorBoundary>
            <OfflineBanner />
          </View>
        </CurrencyProvider>
      </AuthProvider>
    </ErrorBoundary>
  )
}
