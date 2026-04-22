import React, { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'

const CURRENCY_SYMBOLS = {
  USD: '$', EUR: '€', GBP: '£', AED: 'د.إ', SAR: '﷼',
  INR: '₹', JPY: '¥', CAD: 'CA$', AUD: 'A$', CHF: 'CHF',
  SGD: 'S$', TRY: '₺',
}

const CurrencyContext = createContext({ currency: 'USD', fmt: (n) => `$${parseFloat(n).toFixed(2)}` })

export function CurrencyProvider({ children }) {
  const { user } = useAuth()
  const [currency, setCurrency] = useState('USD')

  useEffect(() => {
    if (!user) return
    supabase.from('profiles').select('currency').eq('id', user.id).single()
      .then(({ data }) => { if (data?.currency) setCurrency(data.currency) })
  }, [user])

  const symbol = CURRENCY_SYMBOLS[currency] || currency
  const fmt = (amount) => `${symbol}${parseFloat(amount || 0).toFixed(2)}`

  return (
    <CurrencyContext.Provider value={{ currency, setCurrency, fmt, symbol }}>
      {children}
    </CurrencyContext.Provider>
  )
}

export const useCurrency = () => useContext(CurrencyContext)
