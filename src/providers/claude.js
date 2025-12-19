/**
 * Claude Cookie-based Provider
 * Uses session cookies from claude.ai
 */

const CLAUDE_DOMAIN = 'claude.ai';

// Available Claude models
export const CLAUDE_MODELS = [
  { id: 'claude-opus-4-5', name: 'Claude Opus 4.5' },
  { id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5' },
  { id: 'claude-opus-4', name: 'Claude Opus 4' },
  { id: 'claude-sonnet-4', name: 'Claude Sonnet 4' },
  { id: 'claude-3-7-sonnet', name: 'Claude 3.7 Sonnet' },
  { id: 'claude-3-5-sonnet', name: 'Claude 3.5 Sonnet' },
  { id: 'claude-3-5-haiku', name: 'Claude 3.5 Haiku' }
];

/**
 * Get Claude session cookies
 * @returns {Promise<Object>} Cookie data
 */
async function getClaudeCookies() {
  const cookies = {};
  
  try {
    const domainCookies = await chrome.cookies.getAll({ domain: CLAUDE_DOMAIN });
    for (const cookie of domainCookies) {
      cookies[cookie.name] = cookie.value;
    }
  } catch (e) {
    console.warn('Failed to get Claude cookies:', e);
  }
  
  return cookies;
}

/**
 * Build cookie header string
 * @param {Object} cookies - Cookie object
 * @returns {string}
 */
function buildCookieHeader(cookies) {
  return Object.entries(cookies)
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');
}

/**
 * Get organization ID from Claude session
 * @param {Object} cookies - Session cookies
 * @returns {Promise<string|null>}
 */
async function getOrganizationId(cookies) {
  try {
    const response = await fetch('https://claude.ai/api/organizations', {
      headers: {
        'Cookie': buildCookieHeader(cookies),
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    
    if (!response.ok) return null;
    
    const data = await response.json();
    
    // Return the first organization ID
    if (Array.isArray(data) && data.length > 0) {
      return data[0].uuid;
    }
    
    return null;
  } catch (e) {
    console.error('Failed to get Claude organization ID:', e);
    return null;
  }
}

/**
 * Check if user is logged into Claude
 * @returns {Promise<boolean>}
 */
export async function isClaudeLoggedIn() {
  const cookies = await getClaudeCookies();
  
  // Check for essential session cookie
  if (!cookies['sessionKey']) {
    return false;
  }
  
  // Verify by getting organization
  const orgId = await getOrganizationId(cookies);
  return !!orgId;
}

/**
 * Create a new conversation
 * @param {Object} cookies - Session cookies
 * @param {string} orgId - Organization ID
 * @returns {Promise<string|null>} Conversation ID
 */
async function createConversation(cookies, orgId) {
  try {
    const response = await fetch(`https://claude.ai/api/organizations/${orgId}/chat_conversations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': buildCookieHeader(cookies),
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Origin': 'https://claude.ai',
        'Referer': 'https://claude.ai/'
      },
      body: JSON.stringify({
        uuid: crypto.randomUUID(),
        name: ''
      })
    });
    
    if (!response.ok) return null;
    
    const data = await response.json();
    return data.uuid || null;
  } catch (e) {
    console.error('Failed to create Claude conversation:', e);
    return null;
  }
}

/**
 * Send a request to Claude
 * @param {Object} params - Request parameters
 * @param {string} params.model - Model ID
 * @param {string} params.systemPrompt - System prompt
 * @param {string} params.userMessage - User message
 * @returns {Promise<{content: string} | {error: string}>}
 */
export async function sendClaudeRequest({ model, systemPrompt, userMessage }) {
  try {
    const cookies = await getClaudeCookies();
    
    if (!cookies['sessionKey']) {
      return { 
        error: 'Not logged into Claude. Please log in at claude.ai first.' 
      };
    }

    const orgId = await getOrganizationId(cookies);
    if (!orgId) {
      return { 
        error: 'Could not get Claude organization. Please refresh claude.ai and try again.' 
      };
    }

    // Create a new conversation
    const conversationId = await createConversation(cookies, orgId);
    if (!conversationId) {
      return { 
        error: 'Could not create conversation. Please try again.' 
      };
    }

    // Combine system prompt with user message
    const fullMessage = systemPrompt 
      ? `Instructions: ${systemPrompt}\n\n${userMessage}`
      : userMessage;

    const payload = {
      completion: {
        prompt: fullMessage,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        model: model || 'claude-3-5-sonnet-20241022'
      },
      organization_uuid: orgId,
      conversation_uuid: conversationId,
      text: fullMessage,
      attachments: []
    };

    const response = await fetch('https://claude.ai/api/append_message', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': buildCookieHeader(cookies),
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/event-stream',
        'Origin': 'https://claude.ai',
        'Referer': 'https://claude.ai/'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        return { error: 'Session expired. Please refresh claude.ai and try again.' };
      }
      if (response.status === 429) {
        return { error: 'Rate limit exceeded. Please try again later.' };
      }
      return { error: `Claude API error: ${response.status}` };
    }

    // Parse streaming response
    const text = await response.text();
    const content = parseClaudeResponse(text);
    
    if (!content) {
      return { error: 'Could not parse Claude response. The API format may have changed.' };
    }

    return { content };
  } catch (error) {
    console.error('Claude request failed:', error);
    return { error: `Claude error: ${error.message}` };
  }
}

/**
 * Parse Claude streaming response
 * @param {string} text - Raw SSE response text
 * @returns {string|null}
 */
function parseClaudeResponse(text) {
  try {
    let fullContent = '';
    const lines = text.split('\n');
    
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      
      const data = line.slice(6).trim();
      if (!data) continue;
      
      try {
        const parsed = JSON.parse(data);
        
        // Handle different event types
        if (parsed.completion) {
          fullContent += parsed.completion;
        } else if (parsed.type === 'completion' && parsed.text) {
          fullContent += parsed.text;
        }
      } catch (e) {
        // Continue to next line
      }
    }
    
    return fullContent || null;
  } catch (error) {
    console.error('Failed to parse Claude response:', error);
    return null;
  }
}

/**
 * Test Claude connection
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function testClaudeConnection() {
  const cookies = await getClaudeCookies();
  
  if (!cookies['sessionKey']) {
    return { 
      success: false, 
      error: 'Not logged into Claude. Please log in at claude.ai' 
    };
  }
  
  const orgId = await getOrganizationId(cookies);
  
  if (!orgId) {
    return { 
      success: false, 
      error: 'Could not verify Claude session. Please refresh claude.ai' 
    };
  }
  
  return { success: true };
}

