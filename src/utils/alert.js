import { Alert, Platform } from 'react-native'

export function showAlert(title, message, buttons) {
  if (Platform.OS === 'web') {
    const text = message ? `${title}\n\n${message}` : title
    if (buttons) {
      const confirmBtn = buttons.find(b => b.style !== 'cancel')
      const cancelBtn = buttons.find(b => b.style === 'cancel')
      if (confirmBtn && cancelBtn) {
        if (window.confirm(text)) confirmBtn.onPress?.()
        else cancelBtn.onPress?.()
        return
      }
    }
    window.alert(text)
    buttons?.find(b => b.style !== 'cancel')?.onPress?.()
  } else {
    Alert.alert(title, message, buttons)
  }
}
