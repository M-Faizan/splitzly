import { useEffect, useState } from 'react'
import { Platform } from 'react-native'
import NetInfo from '@react-native-community/netinfo'

export function useNetworkStatus() {
  const [isConnected, setIsConnected] = useState(true)

  useEffect(() => {
    if (Platform.OS === 'web') {
      const update = () => setIsConnected(navigator.onLine)
      update()
      window.addEventListener('online', update)
      window.addEventListener('offline', update)
      return () => {
        window.removeEventListener('online', update)
        window.removeEventListener('offline', update)
      }
    }

    const unsubscribe = NetInfo.addEventListener(state => {
      setIsConnected(state.isConnected !== false)
    })
    return unsubscribe
  }, [])

  return isConnected
}
