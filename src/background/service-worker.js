/**
 * Explain Anything - Background Service Worker
 * Routes requests to the appropriate LLM provider
 */

import { sendOpenRouterRequest, testOpenRouterConnection, fetchOpenRouterModels, getOpenRouterModels } from '../providers/openrouter.js';
import { sendGeminiRequest, testGeminiConnection, fetchGeminiModels, getGeminiModels } from '../providers/gemini.js';

// Default settings
const DEFAULT_SETTINGS = {
  provider: 'openrouter',
  model: 'anthropic/claude-sonnet-4',
  language: 'English',
  systemPrompt: `You are a helpful assistant that explains text clearly and concisely.
When explaining:
- Be clear and educational
- Use simple language when possible
- Provide context when helpful
- Format your response with markdown for readability
- Keep explanations focused and relevant`,
  openrouterApiKey: '',
  geminiApiKey: ''
};

// Provider configurations
const PROVIDERS = {
  openrouter: {
    name: 'OpenRouter',
    requiresApiKey: true,
    send: sendOpenRouterRequest,
    fetchModels: fetchOpenRouterModels,
    getModels: getOpenRouterModels
  },
  gemini: {
    name: 'Gemini',
    requiresApiKey: true,
    send: sendGeminiRequest,
    fetchModels: fetchGeminiModels,
    getModels: getGeminiModels
  }
};

const TRANSLATOR_SYSTEM_PROMPT = "You are a friendly translator and language coach. Keep responses concise, accurate, and follow the requested format exactly.";

/**
 * Get current settings from storage
 * @returns {Promise<Object>}
 */
async function getSettings() {
  const result = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  return { ...DEFAULT_SETTINGS, ...result };
}

/**
 * Build the user message with context
 * @param {Object} payload - Message payload
 * @returns {string}
 */
function buildUserMessage(payload, language) {
  const { text, contextBefore, pageTitle, pageUrl } = payload;
  
  let message = '';
  
  // Add page context
  if (pageTitle) {
    message += `Page: "${pageTitle}"\n`;
  }
  
  // Add surrounding context
  if (contextBefore) {
    message += `\nPreceding text: "...${contextBefore}"\n`;
  }
  
  // Add the selected text
  message += `\n**Selected text to explain:**\n"${text}"`;
  
  // Add language instruction
  message += `\n\nRespond ONLY in ${language}. Do not switch languages.`;
  
  return message;
}

/**
 * Build the translation user message
 * @param {Object} payload - Message payload
 * @param {string} language - Target language
 * @returns {string}
 */
function buildTranslateUserMessage(payload, language) {
  const { text, contextBefore, pageTitle, pageUrl, mode = 'translation' } = payload;

  const contextLines = [];
  if (pageTitle) contextLines.push(`Page: "${pageTitle}"`);
  if (pageUrl) contextLines.push(`URL: ${pageUrl}`);
  if (contextBefore) contextLines.push(`Preceding text: "...${contextBefore}"`);

  const contextBlock = contextLines.length
    ? `

Context to stay accurate:
${contextLines.join('\n')}`
    : '';

  switch (mode) {
    case 'idioms':
      return `You are coaching a learner to sound natural in ${language}.${contextBlock}

Source text:
"${text}"

Share 3-5 idiomatic or culturally natural ways to express this idea in ${language}. For each, include a short tone tag (e.g., formal, casual, playful) and one brief example (max 12 words). Keep everything in ${language}, concise, and easy to study.`;

    case 'similar':
      return `You are helping a learner find interchangeable phrases in ${language}.${contextBlock}

Source text:
"${text}"

List 4-6 similar phrases or synonyms in ${language}. For each item, add a one-line note about nuance or when to use it, plus a tiny example sentence. Keep the focus on practical language learning and avoid English.`;

    case 'learning':
      return `Give a quick mini-lesson in ${language}.${contextBlock}

Source text:
"${text}"

Provide:
- Key vocabulary with short meanings.
- 1-2 grammar or structure cues.
- One micro practice prompt the learner can answer.

Be concise, encouraging, and stay entirely in ${language}.`;

    case 'translation':
    default:
      return `Translate the following text into ${language}.${contextBlock}

Source text:
"${text}"

Respond with ONLY the translated text in ${language}. No labels, no quotes, no Markdown, no explanations, and no extra sentences.`;
  }
}

/**
 * Handle translation request
 * @param {Object} payload - Request payload
 * @param {Function} sendResponse - Response callback
 */
async function handleTranslateRequest(payload, sendResponse) {
  try {
    const settings = await getSettings();
    const provider = PROVIDERS[settings.provider];
    
    if (!provider) {
      sendResponse({ error: `Unknown provider: ${settings.provider}` });
      return;
    }

    // Build the user message for translation
    const userMessage = buildTranslateUserMessage(payload, settings.language);
    
    // Build request parameters
    const requestParams = {
      model: settings.model,
      // Use a specific system prompt for translation if needed, or default
      systemPrompt: TRANSLATOR_SYSTEM_PROMPT,
      userMessage
    };
    
    // Add API key for providers that need it
    if (settings.provider === 'openrouter') {
      requestParams.apiKey = settings.openrouterApiKey;
    } else if (settings.provider === 'gemini') {
      requestParams.apiKey = settings.geminiApiKey;
    }

    // Send request to provider
    const result = await provider.send(requestParams);
    sendResponse(result);
  } catch (error) {
    console.error('Translate request failed:', error);
    sendResponse({ error: error.message });
  }
}

/**
 * Handle explanation request
 * @param {Object} payload - Request payload
 * @param {Function} sendResponse - Response callback
 */
async function handleExplainRequest(payload, sendResponse) {
  try {
    const settings = await getSettings();
    const provider = PROVIDERS[settings.provider];
    
    if (!provider) {
      sendResponse({ error: `Unknown provider: ${settings.provider}` });
      return;
    }

    // Build the user message with context
    const userMessage = buildUserMessage(payload, settings.language);
    
    // Build request parameters
    const requestParams = {
      model: settings.model,
      systemPrompt: settings.systemPrompt,
      userMessage
    };
    
    // Add API key for providers that need it
    if (settings.provider === 'openrouter') {
      requestParams.apiKey = settings.openrouterApiKey;
    } else if (settings.provider === 'gemini') {
      requestParams.apiKey = settings.geminiApiKey;
    }

    // Send request to provider
    const result = await provider.send(requestParams);
    sendResponse(result);
  } catch (error) {
    console.error('Explain request failed:', error);
    sendResponse({ error: error.message });
  }
}

/**
 * Handle streaming request via Port
 * @param {chrome.runtime.Port} port 
 */
async function handleStreamRequest(port) {
  port.onMessage.addListener(async (message) => {
    const { type, payload } = message;
    
    if (type === 'EXPLAIN_TEXT_STREAM' || type === 'TRANSLATE_TEXT_STREAM') {
      try {
        const settings = await getSettings();
        const provider = PROVIDERS[settings.provider];
        
        if (!provider) {
          port.postMessage({ error: `Unknown provider: ${settings.provider}` });
          return;
        }

        const isTranslate = type === 'TRANSLATE_TEXT_STREAM';
        const userMessage = isTranslate 
          ? buildTranslateUserMessage(payload, settings.language)
          : buildUserMessage(payload, settings.language);
        
        const systemPrompt = isTranslate
          ? TRANSLATOR_SYSTEM_PROMPT
          : settings.systemPrompt;

        const requestParams = {
          model: settings.model,
          systemPrompt,
          userMessage
        };
        
        if (settings.provider === 'openrouter') {
          requestParams.apiKey = settings.openrouterApiKey;
        } else if (settings.provider === 'gemini') {
          requestParams.apiKey = settings.geminiApiKey;
        }

        let hasStreamedContent = false;

        // Send streaming request
        const result = await provider.send(requestParams, (chunk) => {
          hasStreamedContent = true;
          port.postMessage({ type: 'CHUNK', content: chunk });
        });

        if (result?.error) {
          port.postMessage({ error: result.error });
          return;
        }

        if (!hasStreamedContent && result?.content) {
          port.postMessage({ type: 'CHUNK', content: result.content });
        }

        port.postMessage({ type: 'DONE' });
      } catch (error) {
        console.error('Streaming request failed:', error);
        port.postMessage({ error: error.message });
      } finally {
        // We don't necessarily want to disconnect immediately if the user wants to retry
        // but for now, the flow is one-shot per port connection usually
      }
    }
  });
}

/**
 * Handle get settings request
 * @param {Function} sendResponse - Response callback
 */
async function handleGetSettings(sendResponse) {
  try {
    const settings = await getSettings();
    sendResponse({ settings, providers: PROVIDERS });
  } catch (error) {
    sendResponse({ error: error.message });
  }
}

/**
 * Handle save settings request
 * @param {Object} newSettings - New settings to save
 * @param {Function} sendResponse - Response callback
 */
async function handleSaveSettings(newSettings, sendResponse) {
  try {
    await chrome.storage.sync.set(newSettings);
    sendResponse({ success: true });
  } catch (error) {
    sendResponse({ error: error.message });
  }
}

/**
 * Handle test connection request
 * @param {string} provider - Provider to test
 * @param {string} apiKey - API key
 * @param {Function} sendResponse - Response callback
 */
async function handleTestConnection(provider, apiKey, sendResponse) {
  try {
    let result;

    switch (provider) {
      case 'openrouter':
        result = await testOpenRouterConnection(apiKey);
        break;
      case 'gemini':
        result = await testGeminiConnection(apiKey);
        break;
      default:
        result = { success: false, error: 'Unknown provider' };
    }

    sendResponse(result);
  } catch (error) {
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * Handle get models request
 * @param {string} provider - Provider name
 * @param {string} apiKey - API key for fetching
 * @param {Function} sendResponse - Response callback
 */
async function handleGetModels(provider, apiKey, sendResponse) {
  const providerConfig = PROVIDERS[provider];

  if (!providerConfig) {
    sendResponse({ error: 'Unknown provider' });
    return;
  }

  try {
    const models = await providerConfig.fetchModels(apiKey);
    sendResponse({ models });
  } catch (error) {
    sendResponse({ error: error.message, models: providerConfig.getModels() });
  }
}

/**
 * Handle refresh models request
 * @param {string} provider - Provider name
 * @param {string} apiKey - API key for fetching
 * @param {Function} sendResponse - Response callback
 */
async function handleRefreshModels(provider, apiKey, sendResponse) {
  const providerConfig = PROVIDERS[provider];

  if (!providerConfig) {
    sendResponse({ error: 'Unknown provider' });
    return;
  }

  try {
    const models = await providerConfig.fetchModels(apiKey, true); // Force refresh
    sendResponse({ models });
  } catch (error) {
    sendResponse({ error: error.message, models: providerConfig.getModels() });
  }
}

// Message listener
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const { type, payload } = message;

  switch (type) {
    case 'EXPLAIN_TEXT':
      handleExplainRequest(payload, sendResponse);
      return true;

    case 'TRANSLATE_TEXT':
      handleTranslateRequest(payload, sendResponse);
      return true;

    case 'GET_SETTINGS':
      handleGetSettings(sendResponse);
      return true;

    case 'SAVE_SETTINGS':
      handleSaveSettings(payload, sendResponse);
      return true;

    case 'TEST_CONNECTION':
      handleTestConnection(payload.provider, payload.apiKey, sendResponse);
      return true;

    case 'GET_MODELS':
      handleGetModels(payload.provider, payload.apiKey, sendResponse);
      return true;

    case 'REFRESH_MODELS':
      handleRefreshModels(payload.provider, payload.apiKey, sendResponse);
      return true;

    default:
      sendResponse({ error: 'Unknown message type' });
      return false;
  }
});

// Port connection listener for streaming
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'explain-anything-stream') {
    handleStreamRequest(port);
  }
});

// Installation handler
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    // Open options page on first install
    chrome.runtime.openOptionsPage();
  }
});

// Open options page when extension icon is clicked
chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage();
});

console.log('Explain Anything: Service worker loaded');

