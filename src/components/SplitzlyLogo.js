import React from 'react'
import { Image, View } from 'react-native'

const logoImg = require('../../assets/logo.png')

export default function SplitzlyLogo({ size = 88, dark = false }) {
  return (
    <View style={{ width: size, height: size, justifyContent: 'center', alignItems: 'center' }}>
      <Image
        source={logoImg}
        style={{ width: size, height: size }}
        resizeMode="contain"
      />
    </View>
  )
}
