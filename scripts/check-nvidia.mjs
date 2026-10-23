import { readFile } from 'node:fs/promises'

// Sends a synthetic connection check only. No customer or financial data is sent.
const local = await readFile('.env.edge.local', 'utf8').catch(() => '')
const key = process.env.NVIDIA_API_KEY || local.match(/^NVIDIA_API_KEY=(.+)$/m)?.[1]?.trim()
if (!key) throw new Error('Set NVIDIA_API_KEY in the process or ignored .env.edge.local file.')
const response = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
  method: 'POST',
  headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: 'openai/gpt-oss-20b',
    messages: [{ role: 'user', content: 'Call check_connection with status OK.' }],
    tools: [{ type: 'function', function: { name: 'check_connection', description: 'Synthetic connection test; no business action.', parameters: { type: 'object', properties: { status: { type: 'string', enum: ['OK'] } }, required: ['status'], additionalProperties: false } } }],
    tool_choice: 'auto',
    reasoning_effort: 'low', max_tokens: 512, stream: false,
  }),
  signal: AbortSignal.timeout(90_000),
})
const payload = await response.json().catch(() => ({}))
const call = payload.choices?.[0]?.message?.tool_calls?.find((item) => item.function?.name === 'check_connection')
const passed = response.ok && !!call && JSON.parse(call.function.arguments).status === 'OK'
console.log(JSON.stringify({ status: response.status, model: payload.model, toolCallingPassed: passed }))
if (!passed) process.exitCode = 1
