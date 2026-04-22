const http = require('http')
const https = require('https')
const os = require('os')
const fs = require('fs')
const path = require('path')

const API_KEY = '8a0b6416-3ddd-46b7-a2d1-8ad957b12f69'
const PORT = 6656

// Auto-detect Wi-Fi IP
function getLocalIP() {
  const nets = os.networkInterfaces()
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) return net.address
    }
  }
  return 'localhost'
}

const ip = getLocalIP()
const baseUrl = `http://${ip}:${PORT}/anthropic/v1`

// Auto-update .env
const envPath = path.join(__dirname, '.env')
let env = fs.readFileSync(envPath, 'utf8')
env = env.replace(/EXPO_PUBLIC_CLAUDE_BASE_URL=.*/,  `EXPO_PUBLIC_CLAUDE_BASE_URL=${baseUrl}`)
fs.writeFileSync(envPath, env)
console.log(`✅ .env updated: EXPO_PUBLIC_CLAUDE_BASE_URL=${baseUrl}`)

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'content-type, authorization')
  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return }

  let body = ''
  req.on('data', chunk => body += chunk)
  req.on('end', () => {
    const options = {
      hostname: 'localhost',
      port: 6655,
      path: '/anthropic/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(body),
      },
    }
    const proxy = http.request(options, (proxyRes) => {
      res.writeHead(proxyRes.statusCode, { 'Content-Type': 'application/json' })
      proxyRes.pipe(res)
    })
    proxy.on('error', (e) => {
      res.writeHead(500)
      res.end(JSON.stringify({ error: e.message }))
    })
    proxy.write(body)
    proxy.end()
  })
})

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Claude proxy running on http://0.0.0.0:${PORT}`)
  console.log(`Restart Expo (npx expo start --clear) to apply the new IP`)
})
