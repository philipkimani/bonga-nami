import { useState } from 'react'

interface ElevenLabsWebhookTool {
  type: "webhook"
  name: string
  description: string
  api_schema: {
    url: string
    method: string
    path_params_schema: Array<{ name: string; type: string; description?: string; required: boolean }>
    query_params_schema: Array<{ name: string; type: string; description?: string; required: boolean }>
    request_body_schema: object | null
    request_headers: Array<{ name: string; value: string }>
    auth_connection: string | null
  }
  response_timeout_secs: number
  dynamic_variables: { dynamic_variable_placeholders: Record<string, unknown> }
  assignments: Array<unknown>
  disable_interruptions: boolean
  force_pre_tool_speech: string
  tool_call_sound: string | null
  tool_call_sound_behavior: string
  execution_mode: string
}

interface GeneratorResponse {
  note: string
  generated_at: string
  source?: string
  version?: string
  tool_count: number
  tools: ElevenLabsWebhookTool[]
}

export default function ToolsSection() {
  const [inputMode, setInputMode] = useState<'url' | 'paste'>('url')
  const [openApiUrl, setOpenApiUrl] = useState('')
  const [openApiSpec, setOpenApiSpec] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<GeneratorResponse | null>(null)
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)
  const [copiedAll, setCopiedAll] = useState(false)

  const handleGenerate = async () => {
    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const token = localStorage.getItem('admin_token')
      const body: { openapi_url?: string; openapi_spec?: object; base_url?: string } = {}

      if (inputMode === 'url') {
        if (!openApiUrl.trim()) {
          throw new Error('Please enter an OpenAPI URL')
        }
        body.openapi_url = openApiUrl.trim()
      } else {
        if (!openApiSpec.trim()) {
          throw new Error('Please paste your OpenAPI specification')
        }
        try {
          body.openapi_spec = JSON.parse(openApiSpec)
        } catch {
          throw new Error('Invalid JSON. Please check your OpenAPI specification.')
        }
      }

      if (baseUrl.trim()) {
        body.base_url = baseUrl.trim()
      }

      const res = await fetch('/api/admin/generate-elevenlabs-tools', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const errData = await res.json()
        throw new Error(errData.error || 'Failed to generate tools')
      }

      const data = await res.json()
      setResult(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  const copyToClipboard = async (tool: ElevenLabsWebhookTool, index: number) => {
    const toolJson = JSON.stringify(tool, null, 2)
    await navigator.clipboard.writeText(toolJson)
    setCopiedIndex(index)
    setTimeout(() => setCopiedIndex(null), 2000)
  }

  const copyAllTools = async () => {
    if (!result) return
    const allJson = JSON.stringify(result.tools, null, 2)
    await navigator.clipboard.writeText(allJson)
    setCopiedAll(true)
    setTimeout(() => setCopiedAll(false), 2000)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-2xl shadow-sm border p-6">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 flex items-center justify-center">
            <span className="text-2xl">🔧</span>
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Tools Generator</h2>
            <p className="text-gray-500">Generate ElevenLabs tool definitions from your API</p>
          </div>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
          <h3 className="font-semibold text-amber-800 mb-2">📌 How it works</h3>
          <ol className="text-sm text-amber-700 space-y-1 list-decimal list-inside">
            <li>Provide your backend API's OpenAPI/Swagger specification</li>
            <li>We generate ElevenLabs-compatible tool definitions</li>
            <li>Copy the tools to your ElevenLabs Agent console</li>
            <li>Your AI assistant can now call your backend API!</li>
          </ol>
        </div>

        {/* Input Mode Toggle */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setInputMode('url')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              inputMode === 'url'
                ? 'bg-orange-500 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            From URL
          </button>
          <button
            onClick={() => setInputMode('paste')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              inputMode === 'paste'
                ? 'bg-orange-500 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            Paste JSON
          </button>
        </div>

        {/* Input Fields */}
        {inputMode === 'url' ? (
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              OpenAPI Specification URL
            </label>
            <input
              type="url"
              value={openApiUrl}
              onChange={(e) => setOpenApiUrl(e.target.value)}
              placeholder="https://api.yourcompany.com/openapi.json"
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent"
            />
            <p className="text-xs text-gray-500 mt-1">
              Most APIs expose their OpenAPI spec at /openapi.json or /swagger.json
            </p>
          </div>
        ) : (
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              OpenAPI Specification (JSON)
            </label>
            <textarea
              value={openApiSpec}
              onChange={(e) => setOpenApiSpec(e.target.value)}
              placeholder='{"openapi": "3.0.0", "info": {...}, "paths": {...}}'
              rows={8}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent font-mono text-sm"
            />
          </div>
        )}

        {/* Base URL Override */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Webhook Base URL (optional)
          </label>
          <input
            type="url"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://your-deployment.railway.app"
            className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent"
          />
          <p className="text-xs text-gray-500 mt-1">
            Override the server URL in generated webhooks. Leave empty to use URL from spec.
          </p>
        </div>

        {/* Generate Button */}
        <button
          onClick={handleGenerate}
          disabled={loading}
          className="w-full py-3 bg-gradient-to-r from-orange-500 to-amber-500 text-white font-semibold rounded-xl hover:from-orange-600 hover:to-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Generating...
            </span>
          ) : (
            '🔧 Generate ElevenLabs Tools'
          )}
        </button>

        {/* Error Display */}
        {error && (
          <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700">
            {error}
          </div>
        )}
      </div>

      {/* Results */}
      {result && (
        <div className="bg-white rounded-2xl shadow-sm border p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-xl font-bold text-gray-900">
                Generated {result.tool_count} Tools
              </h3>
              <p className="text-sm text-gray-500">
                Generated at {new Date(result.generated_at).toLocaleString()}
              </p>
            </div>
            <button
              onClick={copyAllTools}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                copiedAll
                  ? 'bg-green-500 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {copiedAll ? '✓ Copied All!' : '📋 Copy All Tools'}
            </button>
          </div>

          <div className="space-y-4">
            {result.tools.map((tool, index) => (
              <div
                key={tool.name}
                className="border border-gray-200 rounded-xl overflow-hidden"
              >
                <div className="bg-gray-50 px-4 py-3 flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-semibold text-gray-900">{tool.name}</h4>
                      <span className="px-2 py-0.5 bg-orange-100 text-orange-700 text-xs rounded-full">
                        {tool.api_schema.method}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500 mt-1">{tool.description}</p>
                    <p className="text-xs text-gray-400 mt-1 font-mono truncate max-w-lg">
                      {tool.api_schema.url}
                    </p>
                  </div>
                  <button
                    onClick={() => copyToClipboard(tool, index)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      copiedIndex === index
                        ? 'bg-green-500 text-white'
                        : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    {copiedIndex === index ? '✓ Copied!' : 'Copy JSON'}
                  </button>
                </div>
                <div className="p-4 bg-gray-900 text-gray-100">
                  <pre className="text-xs overflow-x-auto">
                    {JSON.stringify(tool, null, 2)}
                  </pre>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-xl">
            <h4 className="font-semibold text-blue-800 mb-2">📝 Next Steps</h4>
            <ol className="text-sm text-blue-700 space-y-1 list-decimal list-inside">
              <li>Open your ElevenLabs Agent console</li>
              <li>Go to the "Tools" tab</li>
              <li>Click "Add tool" → "Webhook"</li>
              <li>Copy the JSON for each tool above and paste it</li>
              <li>Update the URL to match your deployment</li>
              <li>Save and test your agent!</li>
            </ol>
          </div>
        </div>
      )}

      {/* Example Tools Section */}
      <div className="bg-white rounded-2xl shadow-sm border p-6">
        <h3 className="text-xl font-bold text-gray-900 mb-4">📚 Example Tool Templates</h3>
        <p className="text-gray-600 mb-4">
          Don't have an OpenAPI spec? Here are common tool patterns you can customize:
        </p>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[
            { icon: '📅', name: 'Booking & Reservations', file: 'booking-patterns.json' },
            { icon: '🛒', name: 'E-commerce', file: 'ecommerce-patterns.json' },
            { icon: '💳', name: 'Payments (M-Pesa)', file: 'payment-patterns.json' },
            { icon: '🎧', name: 'Customer Service', file: 'customer-service-patterns.json' },
            { icon: '📖', name: 'Knowledge Base', file: 'knowledge-patterns.json' },
          ].map((template) => (
            <a
              key={template.file}
              href={`https://github.com/ArtisanLabs/ruskins-ai-platform/blob/main/docs/tool-templates/${template.file}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 p-4 border border-gray-200 rounded-xl hover:border-orange-300 hover:bg-orange-50 transition-colors"
            >
              <span className="text-2xl">{template.icon}</span>
              <div>
                <h4 className="font-medium text-gray-900">{template.name}</h4>
                <p className="text-xs text-gray-500">{template.file}</p>
              </div>
            </a>
          ))}
        </div>
      </div>
    </div>
  )
}
