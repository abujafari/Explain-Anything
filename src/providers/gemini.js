/**
 * Gemini API Provider
 * Uses Google AI Studio API key (free tier available)
 * Get your API key at: https://aistudio.google.com/app/apikey
 */

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

// Fallback models if API fetch fails
const FALLBACK_MODELS = [
  { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', isFree: true },
  { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', isFree: true },
  { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', isFree: true }
];

// Cached models
let cachedModels = null;

/**
 * Send a request to Gemini API
 * @param {Object} params - Request parameters
 * @param {string} params.model - Model ID
 * @param {string} params.systemPrompt - System prompt
 * @param {string} params.userMessage - User message
 * @param {string} params.apiKey - Gemini API key
 * @param {Function} [onChunk] - Optional callback for streaming chunks
 * @returns {Promise<{content: string} | {error: string}>}
 */
export async function sendGeminiRequest({ model, systemPrompt, userMessage, apiKey }, onChunk) {
  if (!apiKey) {
    return {
      error: 'Gemini API key is not configured. Get a free API key at aistudio.google.com/app/apikey'
    };
  }

  const isStreaming = typeof onChunk === 'function';

  try {
    const modelId = model || 'gemini-2.0-flash';
    const method = isStreaming ? 'streamGenerateContent' : 'generateContent';

    // Build the request payload
    const payload = {
      contents: [
        {
          role: 'user',
          parts: [{ text: userMessage }]
        }
      ],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 2048
      }
    };

    // Add system instruction if provided
    if (systemPrompt) {
      payload.systemInstruction = {
        parts: [{ text: systemPrompt }]
      };
    }

    const response = await fetch(
      `${GEMINI_API_BASE}/${modelId}:${method}?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('[Gemini] API error:', errorData);

      if (response.status === 400) {
        return { error: errorData.error?.message || 'Invalid request. Check your API key and model.' };
      }
      if (response.status === 401 || response.status === 403) {
        return { error: 'Invalid API key. Please check your Gemini API key in settings.' };
      }
      if (response.status === 429) {
        return { error: 'Rate limit exceeded. Please try again later.' };
      }
      return { error: errorData.error?.message || `Gemini API error: ${response.status}` };
    }

    if (isStreaming) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullContent = '';
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        
        // Gemini's streamGenerateContent returns a JSON array that grows.
        // Chunks look like: 
        // [
        //   {...}
        //   ,
        //   {...}
        // ]
        // We can try to extract each {...} block.
        
        let braceCount = 0;
        let startIdx = -1;
        let inString = false;
        let escaped = false;

        for (let i = 0; i < buffer.length; i++) {
          const char = buffer[i];

          if (escaped) {
            escaped = false;
            continue;
          }

          if (char === '\\') {
            escaped = true;
            continue;
          }

          if (char === '"') {
            inString = !inString;
            continue;
          }

          if (!inString) {
            if (char === '{') {
              if (braceCount === 0) startIdx = i;
              braceCount++;
            } else if (char === '}') {
              braceCount--;
              if (braceCount === 0 && startIdx !== -1) {
                const jsonStr = buffer.substring(startIdx, i + 1);
                try {
                  const data = JSON.parse(jsonStr);
                  const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
                  if (content) {
                    fullContent += content;
                    onChunk(content);
                  }
                } catch (e) {
                  console.error('Error parsing Gemini chunk:', e);
                }
                // Keep everything after this object in the buffer
                buffer = buffer.substring(i + 1);
                i = -1; // Restart loop for remaining buffer
              }
            }
          }
        }
      }

      return { content: fullContent };
    } else {
      const data = await response.json();

      // Extract the response text
      const content = data.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!content) {
        console.error('[Gemini] No content in response:', data);
        return { error: 'No response content received from Gemini.' };
      }

      return { content };
    }
  } catch (error) {
    console.error('[Gemini] Request failed:', error);
    return { error: `Gemini error: ${error.message}` };
  }
}

/**
 * Test Gemini API connection
 * @param {string} apiKey - API key to test
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function testGeminiConnection(apiKey) {
  if (!apiKey) {
    return {
      success: false,
      error: 'API key is required. Get a free key at aistudio.google.com/app/apikey'
    };
  }

  try {
    // Test with a simple request to list models
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
    );

    if (response.ok) {
      return { success: true };
    }

    if (response.status === 401 || response.status === 403) {
      return { success: false, error: 'Invalid API key' };
    }

    return { success: false, error: `API error: ${response.status}` };
  } catch (error) {
    return { success: false, error: `Connection failed: ${error.message}` };
  }
}

/**
 * Fetch available models from Gemini API
 * @param {string} apiKey - API key for authenticated requests
 * @param {boolean} forceRefresh - Force refresh cached models
 * @returns {Promise<Array>} Array of model objects
 */
export async function fetchGeminiModels(apiKey, forceRefresh = false) {
  if (cachedModels && !forceRefresh) {
    return cachedModels;
  }

  if (!apiKey) {
    return FALLBACK_MODELS;
  }

  try {
    const response = await fetch(`${GEMINI_API_BASE}?key=${apiKey}`);

    if (!response.ok) {
      console.error('[Gemini] Failed to fetch models:', response.status);
      return FALLBACK_MODELS;
    }

    const data = await response.json();

    if (!data.models || !Array.isArray(data.models)) {
      return FALLBACK_MODELS;
    }

    // Filter to only include generateContent-capable models
    cachedModels = data.models
      .filter(model => {
        const methods = model.supportedGenerationMethods || [];
        return methods.includes('generateContent');
      })
      .map(model => {
        // Extract model name from full path (e.g., "models/gemini-1.5-pro" -> "gemini-1.5-pro")
        const id = model.name.replace('models/', '');
        return {
          id,
          name: model.displayName || id,
          description: model.description || '',
          contextLength: model.inputTokenLimit || 0,
          isFree: true, // Gemini API has free tier
          provider: 'google'
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    return cachedModels;
  } catch (error) {
    console.error('[Gemini] Error fetching models:', error);
    return FALLBACK_MODELS;
  }
}

/**
 * Get cached models or fallback
 * @returns {Array} Array of model objects
 */
export function getGeminiModels() {
  return cachedModels || FALLBACK_MODELS;
}

