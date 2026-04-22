import React, { useEffect, useState, useCallback } from 'react'
import { View, Text } from 'react-native'
import { NavigationContainer } from '@react-navigation/native'
import { createStackNavigator } from '@react-navigation/stack'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { Ionicons } from '@expo/vector-icons'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { colors } from '../constants/theme'

import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'

import LoginScreen from '../screens/auth/LoginScreen'
import SignUpScreen from '../screens/auth/SignUpScreen'
import HomeScreen from '../screens/main/HomeScreen'
import FriendsScreen from '../screens/main/FriendsScreen'
import GroupsScreen from '../screens/main/GroupsScreen'
import GroupDetailScreen from '../screens/main/GroupDetailScreen'
import AddExpenseScreen from '../screens/main/AddExpenseScreen'
import SettleUpScreen from '../screens/main/SettleUpScreen'
import ExpenseDetailScreen from '../screens/main/ExpenseDetailScreen'
import ProfileScreen from '../screens/main/ProfileScreen'
import OnboardingScreen from '../screens/onboarding/OnboardingScreen'
import MessagesScreen from '../screens/main/MessagesScreen'
import ChatScreen from '../screens/main/ChatScreen'

const Stack = createStackNavigator()
const Tab = createBottomTabNavigator()

const screenOptions = {
  headerTintColor: colors.primary,
  headerStyle: { backgroundColor: '#162840' },
  headerShadowVisible: false,
  headerBackTitle: '',
  headerTitleStyle: { color: colors.white, fontWeight: '700', fontSize: 17 },
}

function MainTabs({ unreadCount }) {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: {
          paddingBottom: 8, height: 60,
          backgroundColor: colors.tabBarBg,
          borderTopColor: colors.border,
        },
        tabBarIcon: ({ color, size, focused }) => {
          const icons = {
            Home: focused ? 'home' : 'home-outline',
            Friends: focused ? 'people' : 'people-outline',
            Groups: focused ? 'albums' : 'albums-outline',
            Messages: focused ? 'chatbubbles' : 'chatbubbles-outline',
          }
          if (route.name === 'Messages' && unreadCount > 0) {
            return (
              <View>
                <Ionicons name={icons[route.name]} size={size} color={color} />
                <View style={{
                  position: 'absolute', top: -4, right: -6,
                  backgroundColor: colors.pending, borderRadius: 99,
                  minWidth: 16, height: 16, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 3,
                }}>
                  <Text style={{ fontSize: 9, fontWeight: '800', color: '#fff' }}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
                </View>
              </View>
            )
          }
          return <Ionicons name={icons[route.name]} size={size} color={color} />
        }
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Friends" component={FriendsScreen} />
      <Tab.Screen name="Groups" component={GroupsScreen} />
      <Tab.Screen name="Messages" component={MessagesScreen} />
    </Tab.Navigator>
  )
}

export default function AppNavigator() {
  const { user, loading } = useAuth()
  const [onboardingDone, setOnboardingDone] = useState(null)
  const [unreadCount, setUnreadCount] = useState(0)

  const fetchUnread = useCallback(async () => {
    if (!user) return
    const { count } = await supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('to_user_id', user.id)
      .eq('read', false)
    setUnreadCount(count || 0)
  }, [user])

  useEffect(() => {
    if (user) {
      AsyncStorage.getItem('onboarding_done').then(val => {
        setOnboardingDone(val === 'true')
      })
    }
  }, [user])

  useEffect(() => {
    if (!user) return
    fetchUnread()
    const channel = supabase
      .channel('messages-badge')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `to_user_id=eq.${user.id}` },
        () => fetchUnread()
      )
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: `to_user_id=eq.${user.id}` },
        () => fetchUnread()
      )
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [user])

  if (loading) return null
  if (user && onboardingDone === null) return null

  return (
    <NavigationContainer onStateChange={fetchUnread}>
      <Stack.Navigator screenOptions={{ headerShown: false, ...screenOptions }}>
        {user ? (
          onboardingDone === false ? (
            <Stack.Screen name="Onboarding">
              {() => <OnboardingScreen onDone={() => setOnboardingDone(true)} />}
            </Stack.Screen>
          ) : (
            <>
              <Stack.Screen name="MainTabs">
                {() => <MainTabs unreadCount={unreadCount} />}
              </Stack.Screen>
              <Stack.Screen name="GroupDetail" component={GroupDetailScreen} options={{ headerShown: true }} />
              <Stack.Screen name="AddExpense" component={AddExpenseScreen} options={{ headerShown: true, title: 'Add Expense' }} />
              <Stack.Screen name="SettleUp" component={SettleUpScreen} options={{ headerShown: true, title: 'Settle Up' }} />
              <Stack.Screen name="ExpenseDetail" component={ExpenseDetailScreen} options={{ headerShown: true, title: 'Expense Detail' }} />
              <Stack.Screen name="Profile" component={ProfileScreen} options={{ headerShown: false }} />
              <Stack.Screen name="Chat" component={ChatScreen} options={{ headerShown: true }} />
            </>
          )
        ) : (
          <>
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="SignUp" component={SignUpScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  )
}
