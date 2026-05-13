import { Platform } from 'react-native'
import * as ImagePicker from 'expo-image-picker'

function pickImageWeb() {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = (e) => {
      const file = e.target.files?.[0]
      if (!file) { resolve(null); return }
      const uri = URL.createObjectURL(file)
      resolve({ uri, mimeType: file.type })
    }
    input.oncancel = () => resolve(null)
    input.click()
  })
}

export async function pickImage() {
  if (Platform.OS === 'web') {
    return pickImageWeb()
  }
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
  if (status !== 'granted') return null
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.7,
  })
  if (result.canceled) return null
  return { uri: result.assets[0].uri, mimeType: result.assets[0].mimeType }
}
