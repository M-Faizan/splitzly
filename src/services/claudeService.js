import { CATEGORIES } from '../constants/app'

const MODEL = 'claude-haiku-4-5-20251001'

function getHeaders() {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${process.env.EXPO_PUBLIC_CLAUDE_API_KEY}`,
    'anthropic-version': '2023-06-01',
  }
}

export async function detectCategory(description) {
  if (!description || description.trim().length < 3) return null
  const res = await fetch(`${process.env.EXPO_PUBLIC_CLAUDE_BASE_URL}/messages`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 20,
      messages: [{
        role: 'user',
        content: `What expense category best fits "${description}"? Reply with one word only, exactly one of: Food, Rent, Utilities, Transport, Entertainment, Other`,
      }],
    }),
  })
  const data = await res.json()
  const detected = data?.content?.[0]?.text?.trim()
  return CATEGORIES.includes(detected) ? detected : null
}

export async function scanReceipt(base64, mediaType = 'image/jpeg') {
  const res = await fetch(`${process.env.EXPO_PUBLIC_CLAUDE_BASE_URL}/messages`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
          {
            type: 'text',
            text: 'Extract from this receipt: total amount (number only), a short description (merchant name or type, max 4 words), category (one of: Food, Rent, Utilities, Transport, Entertainment, Other), date (ISO format YYYY-MM-DD or null), and items (array of {name, amount} for each line item). Reply with JSON only: {"amount": 12.50, "description": "Pizza Palace", "category": "Food", "date": "2026-04-21", "items": [{"name": "Pizza", "amount": 8.00}]}',
          },
        ],
      }],
    }),
  })
  const data = await res.json()
  const text = data.content?.[0]?.text
  if (!text) throw new Error('No response from Claude')
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('No JSON in response')
  return JSON.parse(match[0])
}
