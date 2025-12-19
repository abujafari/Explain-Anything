/**
 * OpenRouter API Provider
 * Uses API key authentication
 */

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models';

// Fallback models if API fetch fails
const FALLBACK_MODELS = [
  { id: 'anthropic/claude-sonnet-4', name: 'Claude Sonnet 4', pricing: { prompt: 3, completion: 15 }, isFree: false },
  { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini', pricing: { prompt: 0.15, completion: 0.6 }, isFree: false },
  { id: 'google/gemini-2.0-flash-exp:free', name: 'Gemini 2.0 Flash (Free)', pricing: { prompt: 0, completion: 0 }, isFree: true }
];

// Cached models
let cachedModels = null;

/**
 * Send a request to OpenRouter API
 * @param {Object} params - Request parameters
 * @param {string} params.apiKey - OpenRouter API key
 * @param {string} params.model - Model ID to use
 * @param {string} params.systemPrompt - System prompt
 * @param {string} params.userMessage - User message
 * @param {Function} [onChunk] - Optional callback for streaming chunks
 * @returns {Promise<{content: string} | {error: string}>}
 */
export async function sendOpenRouterRequest({ apiKey, model, systemPrompt, userMessage }, onChunk) {
  if (!apiKey) {
    return { error: 'OpenRouter API key is not configured. Please set it in the extension settings.' };
  }

  const isStreaming = typeof onChunk === 'function';

  // Debug: Log request details
  console.log('[OpenRouter] Making request to:', OPENROUTER_API_URL);
  console.log('[OpenRouter] Model:', model);
  console.log('[OpenRouter] API Key present:', !!apiKey, 'length:', apiKey?.length);

  try {
    const requestBody = {
      model: model || 'anthropic/claude-3.5-sonnet',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage }
      ],
      max_tokens: 2048,
      temperature: 0.7,
      stream: isStreaming
    };

    const response = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      mode: 'cors',
      credentials: 'omit',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://explain-anything.extension',
        'X-Title': 'Explain Anything'
      },
      body: JSON.stringify(requestBody)
    });

    console.log('[OpenRouter] Response status:', response.status);

    if (!response.ok) {
      let errorData = {};
      try {
        errorData = await response.json();
      } catch (e) {
        // If response is not JSON, use empty object
      }
      
      // Extract error information according to OpenRouter API error format
      // ErrorResponse: { code: number, message: string, metadata?: Record<string, unknown> }
      const error = errorData.error || {};
      const errorCode = error.code || response.status;
      const errorMessage = error.message || errorData.message || `API error: ${response.status}`;
      
      // Provide user-friendly error messages based on status code
      if (response.status === 401) {
        return { error: 'Invalid API key. Please check your OpenRouter API key in settings.' };
      }
      if (response.status === 402) {
        return { error: 'Insufficient credits. Please add credits to your OpenRouter account.' };
      }
      if (response.status === 429) {
        return { error: 'Rate limit exceeded. Please try again in a moment.' };
      }
      if (response.status === 400) {
        return { error: `Invalid request: ${errorMessage}` };
      }
      if (response.status >= 500) {
        return { error: `Server error: ${errorMessage}. Please try again later.` };
      }
      
      return { error: errorMessage };
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
        const lines = buffer.split('\n');
        
        // Keep the last partial line in the buffer
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmedLine = line.trim();
          
          // Skip empty lines
          if (!trimmedLine) continue;
          
          // Skip SSE comments (lines starting with ':') - these are keep-alive messages
          if (trimmedLine.startsWith(':')) continue;
          
          // Handle end of stream
          if (trimmedLine === 'data: [DONE]') continue;

          // Parse data lines
          if (trimmedLine.startsWith('data: ')) {
            try {
              const data = JSON.parse(trimmedLine.substring(6));
              
              // Check for errors in streaming response
              if (data.error) {
                const errorMsg = data.error.message || `API error: ${data.error.code || 'unknown'}`;
                return { error: errorMsg };
              }
              
              // Handle usage object (comes at the end with empty choices array)
              if (data.usage && (!data.choices || data.choices.length === 0)) {
                // This is the final usage message, we can ignore it or use it for stats
                continue;
              }
              
              // Extract content from delta
              const content = data.choices?.[0]?.delta?.content;
              if (content) {
                fullContent += content;
                onChunk(content);
              }
              
              // Check for finish reason
              const finishReason = data.choices?.[0]?.finish_reason;
              if (finishReason && finishReason !== null) {
                // Stream is complete
                if (finishReason === 'length') {
                  console.warn('[OpenRouter] Response truncated due to max_tokens limit');
                } else if (finishReason === 'content_filter') {
                  console.warn('[OpenRouter] Response filtered by content policy');
                }
              }
            } catch (e) {
              // Ignore JSON parse errors for malformed chunks (may be partial data)
              console.warn('[OpenRouter] Error parsing streaming chunk:', e, trimmedLine);
            }
          }
        }
      }
      
      // Process any remaining data in the buffer
      if (buffer.trim()) {
        const trimmedBuffer = buffer.trim();
        
        // Skip comments and empty lines
        if (trimmedBuffer && !trimmedBuffer.startsWith(':') && trimmedBuffer !== 'data: [DONE]') {
          if (trimmedBuffer.startsWith('data: ')) {
            try {
              const data = JSON.parse(trimmedBuffer.substring(6));
              const content = data.choices?.[0]?.delta?.content || '';
              if (content) {
                fullContent += content;
                onChunk(content);
              }
            } catch (e) {
              // Final partial line might not be valid JSON - ignore
            }
          }
        }
      }

      return { content: fullContent };
    } else {
      const data = await response.json();
      
      // Check for errors in non-streaming response
      if (data.error) {
        const errorMsg = data.error.message || `API error: ${data.error.code || 'unknown'}`;
        return { error: errorMsg };
      }
      
      // Validate response structure
      if (!data.choices || !Array.isArray(data.choices) || data.choices.length === 0) {
        return { error: 'Invalid response format: no choices received from API.' };
      }
      
      const choice = data.choices[0];
      
      // Check for errors in choice
      if (choice.error) {
        const errorMsg = choice.error.message || `API error: ${choice.error.code || 'unknown'}`;
        return { error: errorMsg };
      }
      
      // Extract content from message
      const content = choice.message?.content;
      
      if (content === null || content === undefined) {
        // Check finish reason to provide better error message
        const finishReason = choice.finish_reason;
        if (finishReason === 'length') {
          return { error: 'Response was truncated due to max_tokens limit. Try increasing max_tokens in settings.' };
        }
        if (finishReason === 'content_filter') {
          return { error: 'Response was filtered by content policy. Please try a different prompt.' };
        }
        return { error: 'No response content received from API.' };
      }

      return { content };
    }
  } catch (error) {
    console.error('[OpenRouter] Request failed:', error);
    console.error('[OpenRouter] Error name:', error.name);
    console.error('[OpenRouter] Error message:', error.message);
    console.error('[OpenRouter] Error stack:', error.stack);
    
    // Provide more specific error messages based on error type
    let errorMessage = 'Network error: ';
    
    if (error.name === 'TypeError' && error.message === 'Failed to fetch') {
      // This specific error often means CORS issue or network blocked
      errorMessage += 'Unable to connect to OpenRouter API. This may be caused by: 1) Network/firewall blocking the request, 2) Ad blocker interference, or 3) Extension permissions issue. Try disabling ad blockers and reloading the extension.';
    } else if (error.name === 'TypeError' && error.message.includes('NetworkError')) {
      errorMessage += 'Network request failed. Please check your internet connection.';
    } else if (error.name === 'AbortError') {
      errorMessage += 'Request timed out. Please try again.';
    } else if (error.message) {
      errorMessage += error.message;
    } else {
      errorMessage += 'An unexpected error occurred. Please try again.';
    }
    
    return { error: errorMessage };
  }
}

/**
 * Test the OpenRouter API connection
 * @param {string} apiKey - API key to test
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function testOpenRouterConnection(apiKey) {
  if (!apiKey) {
    return { success: false, error: 'API key is required' };
  }

  console.log('[OpenRouter] Testing connection to:', OPENROUTER_MODELS_URL);

  try {
    const response = await fetch(OPENROUTER_MODELS_URL, {
      method: 'GET',
      mode: 'cors',
      credentials: 'omit',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://explain-anything.extension'
      }
    });

    console.log('[OpenRouter] Test connection response:', response.status);

    if (response.ok) {
      return { success: true };
    }

    if (response.status === 401) {
      return { success: false, error: 'Invalid API key' };
    }

    return { success: false, error: `API error: ${response.status}` };
  } catch (error) {
    console.error('[OpenRouter] Test connection failed:', error);
    let errorMessage = 'Connection failed: ';
    
    if (error.name === 'TypeError' && error.message === 'Failed to fetch') {
      errorMessage += 'Unable to connect to OpenRouter API. This may be caused by a firewall, ad blocker, or network issue.';
    } else if (error.message) {
      errorMessage += error.message;
    } else {
      errorMessage += 'An unexpected error occurred.';
    }
    
    return { success: false, error: errorMessage };
  }
}

/**
 * Fetch available models from OpenRouter API
 * @param {string} apiKey - Optional API key for authenticated requests
 * @param {boolean} forceRefresh - Force refresh cached models
 * @returns {Promise<Array>} Array of model objects
 */
export async function fetchOpenRouterModels(apiKey, forceRefresh = false) {
  if (cachedModels && !forceRefresh) {
    return cachedModels;
  }

  console.log('[OpenRouter] Fetching models from:', OPENROUTER_MODELS_URL);

  try {
    const headers = {
      'HTTP-Referer': 'https://explain-anything.extension'
    };
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const response = await fetch(OPENROUTER_MODELS_URL, { 
      method: 'GET',
      mode: 'cors',
      credentials: 'omit',
      headers
    });

    console.log('[OpenRouter] Models fetch response:', response.status);

    if (!response.ok) {
      console.error('[OpenRouter] Failed to fetch models:', response.status);
      return FALLBACK_MODELS;
    }

    const data = await response.json();

    if (!data.data || !Array.isArray(data.data)) {
      return FALLBACK_MODELS;
    }

    // Transform API response to our model format
    cachedModels = data.data
      .filter(model => model.id) // Ensure model has an ID
      .map(model => {
        const promptPrice = parseFloat(model.pricing?.prompt || 0) * 1000000; // Convert to per million tokens
        const completionPrice = parseFloat(model.pricing?.completion || 0) * 1000000;
        const isFree = promptPrice === 0 && completionPrice === 0;

        return {
          id: model.id,
          name: model.name || model.id,
          description: model.description || '',
          contextLength: model.context_length || 0,
          pricing: {
            prompt: promptPrice,
            completion: completionPrice
          },
          isFree,
          provider: model.id.split('/')[0] || 'unknown'
        };
      })
      .sort((a, b) => {
        // Sort: free first, then by prompt price
        if (a.isFree && !b.isFree) return -1;
        if (!a.isFree && b.isFree) return 1;
        return a.pricing.prompt - b.pricing.prompt;
      });

    return cachedModels;
  } catch (error) {
    console.error('[OpenRouter] Error fetching models:', error);
    return FALLBACK_MODELS;
  }
}

/**
 * Get cached models or fallback
 * @returns {Array} Array of model objects
 */
export function getOpenRouterModels() {
  return cachedModels || FALLBACK_MODELS;
}

