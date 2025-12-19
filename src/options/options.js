/**
 * Explain Anything - Options Page Script
 */

// Default system prompt
const DEFAULT_SYSTEM_PROMPT = `You are a helpful assistant that explains text clearly and concisely.
When explaining:
- Be clear and educational
- Use simple language when possible
- Provide context when helpful
- Format your response with markdown for readability
- Keep explanations focused and relevant`;

// DOM Elements
const elements = {
  language: document.getElementById('language'),
  model: document.getElementById('model'),
  modelSearch: document.getElementById('modelSearch'),
  modelList: document.getElementById('modelList'),
  modelStats: document.getElementById('modelStats'),
  filterFree: document.getElementById('filterFree'),
  sortModels: document.getElementById('sortModels'),
  refreshModels: document.getElementById('refreshModels'),
  selectedModel: document.getElementById('selectedModel'),
  selectedModelName: document.getElementById('selectedModelName'),
  selectedModelPrice: document.getElementById('selectedModelPrice'),
  systemPrompt: document.getElementById('systemPrompt'),
  openrouterApiKey: document.getElementById('openrouterApiKey'),
  openrouterApiKeySection: document.getElementById('openrouterApiKeySection'),
  geminiApiKey: document.getElementById('geminiApiKey'),
  geminiApiKeySection: document.getElementById('geminiApiKeySection'),
  testConnection: document.getElementById('testConnection'),
  connectionStatus: document.getElementById('connectionStatus'),
  resetPrompt: document.getElementById('resetPrompt'),
  saveSettings: document.getElementById('saveSettings'),
  saveStatus: document.getElementById('saveStatus')
};

// State
let currentSettings = {};
let allModels = [];
let filteredModels = [];

/**
 * Initialize the options page
 */
async function init() {
  await loadSettings();
  setupEventListeners();
  updateProviderUI();
}

/**
 * Load settings from storage
 */
async function loadSettings() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, (response) => {
      if (response?.settings) {
        currentSettings = response.settings;

        // Populate form
        elements.language.value = currentSettings.language || 'English';
        elements.systemPrompt.value = currentSettings.systemPrompt || DEFAULT_SYSTEM_PROMPT;
        elements.openrouterApiKey.value = currentSettings.openrouterApiKey || '';
        elements.geminiApiKey.value = currentSettings.geminiApiKey || '';
        elements.model.value = currentSettings.model || '';

        // Set provider radio
        const providerRadio = document.querySelector(`input[name="provider"][value="${currentSettings.provider}"]`);
        if (providerRadio) {
          providerRadio.checked = true;
        }

        // Load models for current provider
        loadModels(currentSettings.provider);
      }
      resolve();
    });
  });
}

/**
 * Load models for a provider
 */
async function loadModels(provider, forceRefresh = false) {
  const apiKey = getApiKeyForProvider(provider);

  // Show loading state
  elements.modelList.innerHTML = `
    <div class="model-loading">
      <div class="loading-spinner"></div>
      <span>Loading models...</span>
    </div>
  `;

  return new Promise((resolve) => {
    const messageType = forceRefresh ? 'REFRESH_MODELS' : 'GET_MODELS';
    chrome.runtime.sendMessage({
      type: messageType,
      payload: { provider, apiKey }
    }, (response) => {
      if (response?.models) {
        allModels = response.models;
        applyFiltersAndSort();
        updateSelectedModelDisplay();
      } else {
        elements.modelList.innerHTML = `
          <div class="model-error">
            <span>Failed to load models. ${response?.error || ''}</span>
            <button class="btn btn-text" onclick="loadModels('${provider}', true)">Retry</button>
          </div>
        `;
      }
      resolve();
    });
  });
}

/**
 * Apply filters and sorting to models
 */
function applyFiltersAndSort() {
  const searchTerm = elements.modelSearch.value.toLowerCase();
  const freeOnly = elements.filterFree.checked;
  const sortBy = elements.sortModels.value;

  // Filter
  filteredModels = allModels.filter(model => {
    const matchesSearch = !searchTerm ||
      model.name.toLowerCase().includes(searchTerm) ||
      model.id.toLowerCase().includes(searchTerm) ||
      (model.description && model.description.toLowerCase().includes(searchTerm));

    const matchesFree = !freeOnly || model.isFree;

    return matchesSearch && matchesFree;
  });

  // Sort
  switch (sortBy) {
    case 'name':
      filteredModels.sort((a, b) => a.name.localeCompare(b.name));
      break;
    case 'price-low':
      filteredModels.sort((a, b) => (a.pricing?.prompt || 0) - (b.pricing?.prompt || 0));
      break;
    case 'price-high':
      filteredModels.sort((a, b) => (b.pricing?.prompt || 0) - (a.pricing?.prompt || 0));
      break;
    case 'context':
      filteredModels.sort((a, b) => (b.contextLength || 0) - (a.contextLength || 0));
      break;
    default:
      // Default: free first, then by price
      filteredModels.sort((a, b) => {
        if (a.isFree && !b.isFree) return -1;
        if (!a.isFree && b.isFree) return 1;
        return (a.pricing?.prompt || 0) - (b.pricing?.prompt || 0);
      });
  }

  renderModels();
  updateModelStats();
}

/**
 * Render the model list
 */
function renderModels() {
  if (filteredModels.length === 0) {
    elements.modelList.innerHTML = `
      <div class="model-empty">
        <span>No models found matching your criteria</span>
      </div>
    `;
    return;
  }

  const currentModel = elements.model.value;

  elements.modelList.innerHTML = filteredModels.map(model => {
    const isSelected = model.id === currentModel;
    const priceDisplay = formatPrice(model);

    return `
      <div class="model-item ${isSelected ? 'selected' : ''}" data-model-id="${escapeHtml(model.id)}">
        <div class="model-info">
          <div class="model-name-row">
            <span class="model-name">${escapeHtml(model.name)}</span>
          </div>
          <span class="model-id">${escapeHtml(model.id)}</span>
        </div>
        <div class="model-meta">
          ${model.isFree ? '<span class="model-badge free">FREE</span>' : `<span class="model-price">${priceDisplay}</span>`}
          ${model.contextLength ? `<span class="model-context">${formatContextLength(model.contextLength)} ctx</span>` : ''}
        </div>
      </div>
    `;
  }).join('');

  // Add click handlers
  elements.modelList.querySelectorAll('.model-item').forEach(item => {
    item.addEventListener('click', () => {
      selectModel(item.dataset.modelId);
    });
  });
}

/**
 * Update model statistics display
 */
function updateModelStats() {
  const total = allModels.length;
  const shown = filteredModels.length;
  const freeCount = allModels.filter(m => m.isFree).length;

  elements.modelStats.innerHTML = `
    <span>Showing ${shown} of ${total} models</span>
    <span class="model-stats-separator">•</span>
    <span>${freeCount} free models available</span>
  `;
}

/**
 * Select a model
 */
function selectModel(modelId) {
  elements.model.value = modelId;

  // Update UI
  elements.modelList.querySelectorAll('.model-item').forEach(item => {
    item.classList.toggle('selected', item.dataset.modelId === modelId);
  });

  updateSelectedModelDisplay();
  hideSaveStatus();
}

/**
 * Update the selected model display
 */
function updateSelectedModelDisplay() {
  const modelId = elements.model.value;
  const model = allModels.find(m => m.id === modelId);

  if (model) {
    elements.selectedModel.classList.remove('hidden');
    elements.selectedModelName.textContent = model.name;
    elements.selectedModelPrice.textContent = formatPrice(model);
    elements.selectedModelPrice.className = `selected-price ${model.isFree ? 'free' : ''}`;
  } else if (modelId) {
    // Model not in list but we have an ID
    elements.selectedModel.classList.remove('hidden');
    elements.selectedModelName.textContent = modelId;
    elements.selectedModelPrice.textContent = '';
  } else {
    elements.selectedModel.classList.add('hidden');
  }
}

/**
 * Format price for display
 */
function formatPrice(model) {
  if (model.isFree) {
    return 'Free';
  }

  const prompt = model.pricing?.prompt || 0;
  const completion = model.pricing?.completion || 0;

  if (prompt === 0 && completion === 0) {
    return 'Free';
  }

  return `$${prompt.toFixed(2)}/$${completion.toFixed(2)} per 1M tokens`;
}

/**
 * Format context length for display
 */
function formatContextLength(length) {
  if (length >= 1000000) {
    return `${(length / 1000000).toFixed(1)}M`;
  }
  if (length >= 1000) {
    return `${(length / 1000).toFixed(0)}K`;
  }
  return length.toString();
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Set up event listeners
 */
function setupEventListeners() {
  // Provider change
  document.querySelectorAll('input[name="provider"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      updateProviderUI();
      loadModels(e.target.value);
      hideConnectionStatus();
    });
  });

  // Toggle API key visibility
  document.querySelectorAll('.toggle-api-key').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.dataset.target;
      const input = document.getElementById(targetId);
      if (input) {
        input.type = input.type === 'password' ? 'text' : 'password';
      }
    });
  });

  // Model search
  elements.modelSearch.addEventListener('input', debounce(applyFiltersAndSort, 200));

  // Filter and sort
  elements.filterFree.addEventListener('change', applyFiltersAndSort);
  elements.sortModels.addEventListener('change', applyFiltersAndSort);

  // Refresh models
  elements.refreshModels.addEventListener('click', () => {
    const provider = document.querySelector('input[name="provider"]:checked')?.value;
    elements.refreshModels.classList.add('refreshing');
    loadModels(provider, true).finally(() => {
      elements.refreshModels.classList.remove('refreshing');
    });
  });

  // Test connection
  elements.testConnection.addEventListener('click', testConnection);

  // Reset system prompt
  elements.resetPrompt.addEventListener('click', () => {
    elements.systemPrompt.value = DEFAULT_SYSTEM_PROMPT;
  });

  // Save settings
  elements.saveSettings.addEventListener('click', saveSettings);

  // Auto-hide status on input changes
  document.querySelectorAll('input, select, textarea').forEach(input => {
    input.addEventListener('input', hideSaveStatus);
  });
}

/**
 * Debounce function
 */
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Update UI based on selected provider
 */
function updateProviderUI() {
  const provider = document.querySelector('input[name="provider"]:checked')?.value;

  // Hide all API key sections
  elements.openrouterApiKeySection.classList.add('hidden');
  elements.geminiApiKeySection.classList.add('hidden');

  if (provider === 'openrouter') {
    elements.openrouterApiKeySection.classList.remove('hidden');
  } else if (provider === 'gemini') {
    elements.geminiApiKeySection.classList.remove('hidden');
  }
}

/**
 * Get the API key for the current provider
 */
function getApiKeyForProvider(provider) {
  if (provider === 'openrouter') {
    return elements.openrouterApiKey.value;
  } else if (provider === 'gemini') {
    return elements.geminiApiKey.value;
  }
  return '';
}

/**
 * Test connection to the selected provider
 */
async function testConnection() {
  const provider = document.querySelector('input[name="provider"]:checked')?.value;
  const apiKey = getApiKeyForProvider(provider);

  elements.testConnection.disabled = true;
  elements.testConnection.innerHTML = `
    <svg viewBox="0 0 24 24" class="spin"><path d="M12 4V2A10 10 0 0 0 2 12h2a8 8 0 0 1 8-8z" fill="currentColor"/></svg>
    Testing...
  `;

  try {
    const response = await new Promise((resolve) => {
      chrome.runtime.sendMessage({
        type: 'TEST_CONNECTION',
        payload: { provider, apiKey }
      }, resolve);
    });

    showConnectionStatus(response.success, response.error);

    // If successful, refresh models
    if (response.success) {
      loadModels(provider, true);
    }
  } catch (error) {
    showConnectionStatus(false, error.message);
  } finally {
    elements.testConnection.disabled = false;
    elements.testConnection.innerHTML = `
      <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
      Test Connection
    `;
  }
}

/**
 * Show connection status
 */
function showConnectionStatus(success, error) {
  elements.connectionStatus.classList.remove('hidden', 'success', 'error');
  elements.connectionStatus.classList.add(success ? 'success' : 'error');

  if (success) {
    elements.connectionStatus.innerHTML = `
      <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
      Connection successful!
    `;
  } else {
    elements.connectionStatus.innerHTML = `
      <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
      ${error || 'Connection failed'}
    `;
  }
}

/**
 * Hide connection status
 */
function hideConnectionStatus() {
  elements.connectionStatus.classList.add('hidden');
}

/**
 * Save settings
 */
async function saveSettings() {
  const provider = document.querySelector('input[name="provider"]:checked')?.value;

  const settings = {
    language: elements.language.value,
    provider: provider,
    model: elements.model.value,
    systemPrompt: elements.systemPrompt.value,
    openrouterApiKey: elements.openrouterApiKey.value,
    geminiApiKey: elements.geminiApiKey.value
  };

  elements.saveSettings.disabled = true;
  elements.saveSettings.innerHTML = `
    <svg viewBox="0 0 24 24" class="spin"><path d="M12 4V2A10 10 0 0 0 2 12h2a8 8 0 0 1 8-8z" fill="currentColor"/></svg>
    Saving...
  `;

  try {
    const response = await new Promise((resolve) => {
      chrome.runtime.sendMessage({
        type: 'SAVE_SETTINGS',
        payload: settings
      }, resolve);
    });

    if (response?.success) {
      showSaveStatus(true);
      currentSettings = settings;
    } else {
      showSaveStatus(false, response?.error);
    }
  } catch (error) {
    showSaveStatus(false, error.message);
  } finally {
    elements.saveSettings.disabled = false;
    elements.saveSettings.innerHTML = `
      <svg viewBox="0 0 24 24"><path d="M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z"/></svg>
      Save Settings
    `;
  }
}

/**
 * Show save status
 */
function showSaveStatus(success, error) {
  elements.saveStatus.classList.remove('hidden', 'success', 'error');
  elements.saveStatus.classList.add(success ? 'success' : 'error');

  if (success) {
    elements.saveStatus.innerHTML = `
      <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
      Settings saved!
    `;
  } else {
    elements.saveStatus.innerHTML = `
      <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
      ${error || 'Failed to save'}
    `;
  }

  // Auto-hide after 3 seconds
  setTimeout(hideSaveStatus, 3000);
}

/**
 * Hide save status
 */
function hideSaveStatus() {
  elements.saveStatus.classList.add('hidden');
}

// Add CSS for animations
const style = document.createElement('style');
style.textContent = `
  .spin {
    animation: spin 1s linear infinite;
  }
  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
`;
document.head.appendChild(style);

// Initialize
init();
