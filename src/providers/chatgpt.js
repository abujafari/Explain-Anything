/**
 * ChatGPT Cookie-based Provider
 * Uses session cookies from chat.openai.com / chatgpt.com
 */

const CHATGPT_DOMAINS = ['chat.openai.com', 'chatgpt.com', '.openai.com'];

// Available ChatGPT models
export const CHATGPT_MODELS = [
  { id: 'gpt-4o', name: 'GPT-4o' },
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
  { id: 'gpt-4.1', name: 'GPT-4.1' },
  { id: 'o3', name: 'o3' },
  { id: 'o4-mini', name: 'o4-mini' }
];

/**
 * Get ChatGPT session cookies
 * @returns {Promise<Object>} Cookie data
 */
async function getChatGPTCookies() {
  const cookies = {};
  
  for (const domain of CHATGPT_DOMAINS) {
    try {
      const domainCookies = await chrome.cookies.getAll({ domain });
      for (const cookie of domainCookies) {
        cookies[cookie.name] = cookie.value;
      }
    } catch (e) {
      console.warn(`Failed to get cookies for ${domain}:`, e);
    }
  }
  
  return cookies;
}

/**
 * Get access token from ChatGPT session
 * @returns {Promise<string|null>}
 */
async function getAccessToken() {
  try {
    const cookies = await getChatGPTCookies();
    const cookieHeader = Object.entries(cookies)
      .map(([name, value]) => `${name}=${value}`)
      .join('; ');
    
    const response = await fetch('https://chatgpt.com/api/auth/session', {
      headers: {
        'Cookie': cookieHeader,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    
    if (!response.ok) {
      // Try alternate domain
      const altResponse = await fetch('https://chat.openai.com/api/auth/session', {
        headers: {
          'Cookie': cookieHeader,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });
      
      if (!altResponse.ok) return null;
      
      const altData = await altResponse.json();
      return altData.accessToken || null;
    }
    
    const data = await response.json();
    return data.accessToken || null;
  } catch (e) {
    console.error('Failed to get ChatGPT access token:', e);
    return null;
  }
}

/**
 * Check if user is logged into ChatGPT
 * @returns {Promise<boolean>}
 */
export async function isChatGPTLoggedIn() {
  const token = await getAccessToken();
  return !!token;
}

/**
 * Send a request to ChatGPT
 * @param {Object} params - Request parameters
 * @param {string} params.model - Model ID
 * @param {string} params.systemPrompt - System prompt
 * @param {string} params.userMessage - User message
 * @returns {Promise<{content: string} | {error: string}>}
 */
export async function sendChatGPTRequest({ model, systemPrompt, userMessage }) {
  try {
    const accessToken = await getAccessToken();
    
    if (!accessToken) {
      return { 
        error: 'Not logged into ChatGPT. Please log in at chatgpt.com first.' 
      };
    }

    const cookies = await getChatGPTCookies();
    const cookieHeader = Object.entries(cookies)
      .map(([name, value]) => `${name}=${value}`)
      .join('; ');

    // Create a new conversation
    const conversationId = crypto.randomUUID();
    const messageId = crypto.randomUUID();
    const parentId = crypto.randomUUID();

    // Combine system prompt with user message
    const fullMessage = systemPrompt 
      ? `Instructions: ${systemPrompt}\n\n${userMessage}`
      : userMessage;

    const payload = {
      action: 'next',
      messages: [
        {
          id: messageId,
          author: { role: 'user' },
          content: {
            content_type: 'text',
            parts: [fullMessage]
          }
        }
      ],
      parent_message_id: parentId,
      model: model || 'gpt-4o',
      timezone_offset_min: new Date().getTimezoneOffset(),
      suggestions: [],
      history_and_training_disabled: true,
      conversation_mode: { kind: 'primary_assistant' },
      force_paragen: false,
      force_rate_limit: false
    };

    const response = await fetch('https://chatgpt.com/backend-api/conversation', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
        'Cookie': cookieHeader,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/event-stream',
        'Origin': 'https://chatgpt.com',
        'Referer': 'https://chatgpt.com/'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        return { error: 'Session expired. Please refresh chatgpt.com and try again.' };
      }
      if (response.status === 429) {
        return { error: 'Rate limit exceeded. Please try again later.' };
      }
      return { error: `ChatGPT API error: ${response.status}` };
    }

    // Parse streaming response
    const text = await response.text();
    const content = parseChatGPTResponse(text);
    
    if (!content) {
      return { error: 'Could not parse ChatGPT response. The API format may have changed.' };
    }

    return { content };
  } catch (error) {
    console.error('ChatGPT request failed:', error);
    return { error: `ChatGPT error: ${error.message}` };
  }
}

/**
 * Parse ChatGPT streaming response
 * @param {string} text - Raw SSE response text
 * @returns {string|null}
 */
function parseChatGPTResponse(text) {
  try {
    let fullContent = '';
    const lines = text.split('\n');
    
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      
      const data = line.slice(6).trim();
      if (data === '[DONE]') break;
      
      try {
        const parsed = JSON.parse(data);
        
        // Get content from the message
        if (parsed.message?.content?.parts) {
          const parts = parsed.message.content.parts;
          if (parts.length > 0) {
            fullContent = parts.join('');
          }
        }
      } catch (e) {
        // Continue to next line
      }
    }
    
    return fullContent || null;
  } catch (error) {
    console.error('Failed to parse ChatGPT response:', error);
    return null;
  }
}

/**
 * Test ChatGPT connection
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function testChatGPTConnection() {
  const token = await getAccessToken();
  
  if (!token) {
    return { 
      success: false, 
      error: 'Not logged into ChatGPT. Please log in at chatgpt.com' 
    };
  }
  
  return { success: true };
}

