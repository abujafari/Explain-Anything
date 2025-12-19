/**
 * Explain Anything - Content Script
 * Handles text selection detection, mini popup display, and response modal
 */

(function() {
  'use strict';

  // Prevent multiple injections
  if (window.__explainAnythingLoaded) return;
  window.__explainAnythingLoaded = true;

  // Load Google Fonts dynamically
  function loadFonts() {
    if (document.getElementById('ea-google-fonts')) return;

    const link = document.createElement('link');
    link.id = 'ea-google-fonts';
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Vazirmatn:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap';
    document.head.appendChild(link);
  }

  // Load fonts immediately
  loadFonts();

  // State
  let miniPopup = null;
  let modalOverlay = null;
  let currentSelection = null;
  let isDragging = false;
  let dragOffset = { x: 0, y: 0 };
  let activeRequestPort = null;
  let activeTab = 'translation';

  const TRANSLATE_TABS = [
    { id: 'translation', label: 'Translation', hint: 'Just the meaning' },
    { id: 'idioms', label: 'Idioms & Nuance', hint: 'Sound natural' },
    { id: 'similar', label: 'Similar Phrases', hint: 'Swap-in options' },
    { id: 'learning', label: 'Study Notes', hint: 'Quick coaching' }
  ];

  // Icons as SVG strings
  const ICONS = {
    explain: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.21 1.79-4 4-4s4 1.79 4 4c0 .88-.36 1.68-.93 2.25z"/></svg>`,
    translate: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12.87 15.07l-2.54-2.51.03-.03c1.74-1.94 2.98-4.17 3.71-6.53H17V4h-7V2H8v2H1v1.99h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04zM18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12zm-2.62 7l1.62-4.33L19.12 17h-3.24z"/></svg>`,
    close: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>`,
    copy: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>`,
    error: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>`,
    check: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>`
  };

  /**
   * Get the context around the selected text
   */
  function getSelectionContext() {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return null;

    const selectedText = selection.toString().trim();
    if (!selectedText || selectedText.length < 2) return null;

    const range = selection.getRangeAt(0);
    const pageTitle = document.title;
    
    // Get text before selection for context
    let contextBefore = '';
    try {
      const container = range.startContainer;
      let node = container;
      
      // Walk up to find a block-level element
      while (node && node !== document.body) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          const display = window.getComputedStyle(node).display;
          if (['block', 'flex', 'grid', 'table'].includes(display)) {
            break;
          }
        }
        node = node.parentNode;
      }
      
      if (node && node.textContent) {
        const fullText = node.textContent;
        const selectionStart = fullText.indexOf(selectedText);
        if (selectionStart > 0) {
          contextBefore = fullText.substring(Math.max(0, selectionStart - 200), selectionStart).trim();
        }
      }
    } catch (e) {
      console.warn('Explain Anything: Could not get context', e);
    }

    // Get position for popup
    const rect = range.getBoundingClientRect();
    
    return {
      text: selectedText,
      contextBefore,
      pageTitle,
      position: {
        x: rect.right + window.scrollX,
        y: rect.top + window.scrollY - 10
      }
    };
  }

  /**
   * Create and show the mini popup
   */
  function showMiniPopup(context) {
    hideMiniPopup();
    
    currentSelection = context;
    
    miniPopup = document.createElement('div');
    miniPopup.className = 'ea-mini-popup-container';
    miniPopup.style.left = `${context.position.x + 10}px`;
    miniPopup.style.top = `${context.position.y}px`;
    
    const explainBtn = document.createElement('button');
    explainBtn.className = 'ea-mini-popup-btn';
    explainBtn.innerHTML = ICONS.explain;
    explainBtn.title = 'Explain this text';
    explainBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      showResponseModal('explain');
    });

    const translateBtn = document.createElement('button');
    translateBtn.className = 'ea-mini-popup-btn';
    translateBtn.innerHTML = ICONS.translate;
    translateBtn.title = 'Translate this text';
    translateBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      showResponseModal('translate');
    });

    miniPopup.appendChild(explainBtn);
    miniPopup.appendChild(translateBtn);
    
    document.body.appendChild(miniPopup);
  }

  /**
   * Hide the mini popup
   */
  function hideMiniPopup() {
    if (miniPopup) {
      miniPopup.remove();
      miniPopup = null;
    }
  }

  /**
   * Create and show the response modal
   */
  function showResponseModal(type = 'explain') {
    hideResponseModal();
    
    modalOverlay = document.createElement('div');
    modalOverlay.className = 'ea-modal-overlay';
    
    const modal = document.createElement('div');
    modal.className = 'ea-modal';
    
    // Truncate selected text for display
    const displayText = currentSelection.text.length > 150
      ? currentSelection.text.substring(0, 150) + '...'
      : currentSelection.text;

    // Detect if selected text is RTL
    const selectedTextDir = detectTextDirection(currentSelection.text);
    const isRTL = selectedTextDir === 'rtl';

    const title = type === 'explain' ? 'Explain Anything' : 'Translate';
    const icon = type === 'explain' ? ICONS.explain : ICONS.translate;

    if (type === 'translate') {
      activeTab = 'translation';
    } else {
      activeTab = null;
    }

    const tabBarHtml = type === 'translate'
      ? `<div class="ea-tab-bar">
          ${TRANSLATE_TABS.map(tab => `
            <button class="ea-tab-btn ${tab.id === activeTab ? 'active' : ''}" data-tab="${tab.id}">
              <span class="ea-tab-label">${tab.label}</span>
              <span class="ea-tab-hint">${tab.hint}</span>
            </button>
          `).join('')}
        </div>`
      : '';

    const loadingText = getLoadingText(type, activeTab);

    modal.innerHTML = `
      <div class="ea-modal-header">
        <div class="ea-modal-title">
          ${icon}
          <span>${title}</span>
        </div>
        <div class="ea-modal-actions">
          <button class="ea-modal-btn ea-copy-btn" title="Copy response">
            ${ICONS.copy}
          </button>
          <button class="ea-modal-btn ea-close-btn" title="Close">
            ${ICONS.close}
          </button>
        </div>
      </div>
      <div class="ea-modal-content">
        <div class="ea-selected-text ${isRTL ? 'rtl' : ''}">
          <div class="ea-selected-label">Selected Text</div>
          <div class="ea-selected-content" dir="${selectedTextDir}">${escapeHtml(displayText)}</div>
        </div>
        ${tabBarHtml}
        <div class="ea-response-container">
          ${renderLoading(loadingText)}
        </div>
      </div>
    `;
    
    modalOverlay.appendChild(modal);
    document.body.appendChild(modalOverlay);
    
    // Event listeners
    modal.querySelector('.ea-close-btn').addEventListener('click', hideResponseModal);
    modal.querySelector('.ea-copy-btn').addEventListener('click', copyResponse);
    modalOverlay.addEventListener('click', (e) => {
      if (e.target === modalOverlay) hideResponseModal();
    });

    if (type === 'translate') {
      modal.querySelectorAll('.ea-tab-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          const tabId = btn.dataset.tab;
          if (tabId === activeTab) return;
          setActiveTab(tabId);
          showLoadingState(type, tabId);
          requestAIResponse(type, tabId);
        });
      });
    }
    
    // Dragging functionality
    const header = modal.querySelector('.ea-modal-header');
    header.addEventListener('mousedown', startDrag);
    
    // Close on Escape
    document.addEventListener('keydown', handleEscape);
    
    // Hide mini popup and request explanation
    hideMiniPopup();
    requestAIResponse(type, activeTab);
  }

  /**
   * Hide the response modal
   */
  function hideResponseModal() {
    if (modalOverlay) {
      modalOverlay.remove();
      modalOverlay = null;
    }
    cleanupActivePort();
    document.removeEventListener('keydown', handleEscape);
    document.removeEventListener('mousemove', drag);
    document.removeEventListener('mouseup', stopDrag);
  }

  /**
   * Handle Escape key
   */
  function handleEscape(e) {
    if (e.key === 'Escape') {
      hideResponseModal();
    }
  }

  /**
   * Dragging handlers
   */
  function startDrag(e) {
    if (e.target.closest('.ea-modal-btn')) return;
    
    isDragging = true;
    const modal = modalOverlay.querySelector('.ea-modal');
    const rect = modal.getBoundingClientRect();
    dragOffset.x = e.clientX - rect.left;
    dragOffset.y = e.clientY - rect.top;
    
    modal.style.transition = 'none';
    
    document.addEventListener('mousemove', drag);
    document.addEventListener('mouseup', stopDrag);
  }

  function drag(e) {
    if (!isDragging) return;
    
    const modal = modalOverlay.querySelector('.ea-modal');
    modal.style.position = 'fixed';
    modal.style.left = `${e.clientX - dragOffset.x}px`;
    modal.style.top = `${e.clientY - dragOffset.y}px`;
    modal.style.transform = 'none';
  }

  function stopDrag() {
    isDragging = false;
    const modal = modalOverlay?.querySelector('.ea-modal');
    if (modal) {
      modal.style.transition = '';
    }
    document.removeEventListener('mousemove', drag);
    document.removeEventListener('mouseup', stopDrag);
  }

  /**
   * Copy response to clipboard
   */
  async function copyResponse() {
    const responseEl = modalOverlay?.querySelector('.ea-response');
    if (!responseEl) return;
    
    const copyBtn = modalOverlay.querySelector('.ea-copy-btn');
    
    try {
      await navigator.clipboard.writeText(responseEl.textContent);
      copyBtn.innerHTML = ICONS.check;
      copyBtn.style.background = 'rgba(34, 197, 94, 0.3)';
      
      setTimeout(() => {
        copyBtn.innerHTML = ICONS.copy;
        copyBtn.style.background = '';
      }, 2000);
    } catch (e) {
      console.error('Failed to copy:', e);
    }
  }

  /**
   * Check if extension context is still valid
   */
  function isExtensionContextValid() {
    try {
      return chrome.runtime && !!chrome.runtime.id;
    } catch (e) {
      return false;
    }
  }

  /**
   * Show extension reload message
   */
  function showReloadMessage() {
    const container = modalOverlay?.querySelector('.ea-response-container');
    if (!container) return;

    container.innerHTML = `
      <div class="ea-error">
        <div class="ea-error-icon">${ICONS.error}</div>
        <div class="ea-error-cause">Extension Updated</div>
        <div class="ea-error-message">Please refresh this page to continue using Explain Anything.</div>
        <button class="ea-retry-btn" onclick="location.reload()">Refresh Page</button>
      </div>
    `;
  }

  function setActiveTab(tabId) {
    activeTab = tabId;
    modalOverlay?.querySelectorAll('.ea-tab-btn').forEach((btn) => {
      const isActive = btn.dataset.tab === tabId;
      btn.classList.toggle('active', isActive);
    });
  }

  function getTranslateTab(tabId) {
    return TRANSLATE_TABS.find((tab) => tab.id === tabId) || TRANSLATE_TABS[0];
  }

  function getLoadingText(type, tabId) {
    if (type === 'translate') {
      const tab = getTranslateTab(tabId);
      switch (tab.id) {
        case 'idioms':
          return 'Getting idioms & nuance...';
        case 'similar':
          return 'Finding similar phrases...';
        case 'learning':
          return 'Building study notes...';
        default:
          return 'Getting translation...';
      }
    }
    return type === 'translate' ? 'Getting translation...' : 'Getting explanation...';
  }

  function getResponseLabel(type, tabId) {
    if (type === 'translate') {
      return getTranslateTab(tabId).label.toLowerCase();
    }
    return type === 'translate' ? 'translation' : 'explanation';
  }

  function renderLoading(text) {
    return `
      <div class="ea-loading">
        <div class="ea-loading-spinner"></div>
        <div class="ea-loading-text">${text}</div>
      </div>
    `;
  }

  function showLoadingState(type, tabId) {
    const container = modalOverlay?.querySelector('.ea-response-container');
    if (container) {
      container.innerHTML = renderLoading(getLoadingText(type, tabId));
    }
  }

  function cleanupActivePort() {
    if (activeRequestPort) {
      try {
        activeRequestPort.disconnect();
      } catch (e) {
        console.warn('Could not disconnect port', e);
      }
      activeRequestPort = null;
    }
  }

  /**
   * Request explanation or translation from background script using streaming
   */
  function requestAIResponse(type, tabId = null) {
    if (!isExtensionContextValid()) {
      showReloadMessage();
      return;
    }

    const container = modalOverlay?.querySelector('.ea-response-container');
    if (container) {
      // Show loading state initially
      showLoadingState(type, tabId);
    }

    const messageType = type === 'translate' ? 'TRANSLATE_TEXT_STREAM' : 'EXPLAIN_TEXT_STREAM';
    cleanupActivePort();
    
    try {
      const port = chrome.runtime.connect({ name: 'explain-anything-stream' });
      activeRequestPort = port;
      let fullContent = '';
      let isFirstChunk = true;

      port.onMessage.addListener((msg) => {
        if (port !== activeRequestPort || !modalOverlay) return;

        if (msg.error) {
          // Show error immediately instead of loading
          showErrorState(msg.error, type, tabId);
          cleanupActivePort();
          return;
        }

        if (msg.type === 'CHUNK') {
          if (isFirstChunk && container) {
            container.innerHTML = `<div class="ea-response"></div>`;
            isFirstChunk = false;
          }
          
          fullContent += msg.content;
          const responseEl = container?.querySelector('.ea-response');
          
          // Parse markdown and display
          let html = parseMarkdown(fullContent);
          // Apply text direction detection
          html = applyTextDirection(html);
          
          if (responseEl) {
            responseEl.innerHTML = html;
            
            // Optional: Scroll to bottom
            const modalContent = modalOverlay.querySelector('.ea-modal-content');
            if (modalContent) {
              modalContent.scrollTop = modalContent.scrollHeight;
            }
          }
        }

        if (msg.type === 'DONE') {
          // Final highlighting
          const responseEl = container?.querySelector('.ea-response');
          if (responseEl) {
            responseEl.querySelectorAll('pre code').forEach(block => {
              highlightCode(block);
            });
          }
          cleanupActivePort();
        }
      });

      const payload = {
        text: currentSelection.text,
        contextBefore: currentSelection.contextBefore,
        pageTitle: currentSelection.pageTitle,
        pageUrl: window.location.href
      };

      if (type === 'translate') {
        payload.mode = tabId || 'translation';
      }

      port.postMessage({
        type: messageType,
        payload
      });

      port.onDisconnect.addListener(() => {
        if (port !== activeRequestPort) return;
        if (chrome.runtime.lastError) {
          console.warn('Port disconnected with error:', chrome.runtime.lastError);
          // If we haven't received any content, show error instead of loading
          if (isFirstChunk) {
            const errorMsg = chrome.runtime.lastError.message || 'Connection lost. Please refresh the page and try again.';
            showErrorState(errorMsg, type, tabId);
          }
        }
        activeRequestPort = null;
      });

    } catch (e) {
      console.error('Streaming request failed:', e);
      const errorMsg = e.message || 'Failed to connect. Please refresh the page and try again.';
      showErrorState(errorMsg, type, tabId);
    }
  }

  /**
   * Parse error message to extract cause and message
   * @param {string} errorText - Full error text
   * @returns {{cause: string, message: string}}
   */
  function parseError(errorText) {
    const defaultError = { cause: 'Unknown error', message: 'An unexpected error occurred.' };

    if (!errorText) {
      return defaultError;
    }

    // Handle structured error objects
    if (typeof errorText === 'object') {
      const cause = typeof errorText.cause === 'string'
        ? errorText.cause.trim()
        : typeof errorText.code === 'string'
          ? errorText.code.trim()
          : 'Error';

      let message = '';
      if (typeof errorText.message === 'string') {
        message = errorText.message.trim();
      } else if (typeof errorText.error === 'string') {
        message = errorText.error.trim();
      } else {
        try {
          message = JSON.stringify(errorText);
        } catch (e) {
          message = '';
        }
      }

      return {
        cause: cause || 'Error',
        message: message || defaultError.message
      };
    }

    const normalizedText = String(errorText).trim();
    if (!normalizedText) {
      return defaultError;
    }

    // Try to extract cause from common patterns
    const colonMatch = normalizedText.match(/^([^:]+):\s*(.+)$/);
    if (colonMatch) {
      return {
        cause: colonMatch[1].trim(),
        message: colonMatch[2].trim()
      };
    }

    // Try to extract from period-separated sentences
    const periodMatch = normalizedText.match(/^([^.]+\.[^.]*?)\s+(.+)$/);
    if (periodMatch && periodMatch[2].length > 10) {
      return {
        cause: periodMatch[1].trim(),
        message: periodMatch[2].trim()
      };
    }

    // If no clear separation, use the whole text as message and infer cause
    let cause = 'Error';
    if (normalizedText.toLowerCase().includes('api key')) {
      cause = 'API Key Error';
    } else if (normalizedText.toLowerCase().includes('network') || normalizedText.toLowerCase().includes('connection')) {
      cause = 'Network Error';
    } else if (normalizedText.toLowerCase().includes('rate limit')) {
      cause = 'Rate Limit';
    } else if (normalizedText.toLowerCase().includes('timeout')) {
      cause = 'Timeout';
    } else if (normalizedText.toLowerCase().includes('invalid')) {
      cause = 'Invalid Request';
    }

    return {
      cause,
      message: normalizedText
    };
  }

  /**
   * Render error state with cause and message
   */
  function renderError(errorText, responseLabel, loadingText, type, tabId) {
    const { cause, message } = parseError(errorText);
    
    return `
      <div class="ea-error">
        <div class="ea-error-icon">${ICONS.error}</div>
        <div class="ea-error-cause">${escapeHtml(cause)}</div>
        <div class="ea-error-message">${escapeHtml(message)}</div>
        <button class="ea-retry-btn">Try Again</button>
      </div>
    `;
  }

  /**
   * Show error state immediately (replacing loading)
   */
  function showErrorState(errorText, type, tabId) {
    const container = modalOverlay?.querySelector('.ea-response-container');
    if (!container) return;
    
    const responseLabel = getResponseLabel(type, tabId);
    const loadingText = getLoadingText(type, tabId);
    
    container.innerHTML = renderError(errorText, responseLabel, loadingText, type, tabId);
    
    const retryBtn = container.querySelector('.ea-retry-btn');
    if (retryBtn) {
      retryBtn.addEventListener('click', () => {
        container.innerHTML = renderLoading(loadingText);
        requestAIResponse(type, tabId);
      });
    }
  }

  /**
   * Handle the AI response
   */
  function handleAIResponse(response, type, tabId) {
    const container = modalOverlay?.querySelector('.ea-response-container');
    if (!container) return;
    const responseLabel = getResponseLabel(type, tabId);
    const loadingText = getLoadingText(type, tabId);
    
    if (response?.error) {
      showErrorState(response.error, type, tabId);
    } else if (response?.content) {
      // Parse markdown and display
      let html = parseMarkdown(response.content);

      // Apply text direction detection
      html = applyTextDirection(html);

      container.innerHTML = `<div class="ea-response">${html}</div>`;

      // Apply syntax highlighting to code blocks
      container.querySelectorAll('pre code').forEach(block => {
        highlightCode(block);
      });
    } else {
      showErrorState('No response received. Please check your settings and try again.', type, tabId);
    }
  }

  /**
   * Simple markdown parser
   */
  function parseMarkdown(text) {
    if (!text) return '';
    
    let html = escapeHtml(text);
    
    // Code blocks
    html = html.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, lang, code) => {
      return `<pre><code class="language-${lang || 'plaintext'}">${code.trim()}</code></pre>`;
    });
    
    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    
    // Bold
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    
    // Italic
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    
    // Headers
    html = html.replace(/^#### (.+)$/gm, '<h4>$1</h4>');
    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
    
    // Blockquotes
    html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');
    
    // Unordered lists
    html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');
    
    // Ordered lists
    html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');
    
    // Links
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    
    // Horizontal rules
    html = html.replace(/^---$/gm, '<hr>');
    
    // Tables - must be processed before paragraphs
    // Pattern matches: header row | separator row | data rows (with or without trailing newline)
    html = html.replace(/(\|[^\n]*\|\n\|[:\-| ]+\|\n(?:\|[^\n]*\|(?:\n|$))+)/g, (match) => {
      const lines = match.trim().split('\n').filter(line => line.trim());
      if (lines.length < 2) return match;
      
      // Check if second line is a separator (contains dashes/colons)
      const isSeparator = (line) => /^[\s|:\-]+$/.test(line);
      let separatorIndex = -1;
      
      // Find separator row
      for (let i = 1; i < lines.length; i++) {
        if (isSeparator(lines[i])) {
          separatorIndex = i;
          break;
        }
      }
      
      // If no separator found, not a valid table
      if (separatorIndex === -1) return match;
      
      // Helper function to parse a table row
      const parseRow = (line) => {
        const cells = line.split('|').map(cell => cell.trim());
        // Remove empty cells from start/end (from leading/trailing pipes)
        if (cells[0] === '') cells.shift();
        if (cells[cells.length - 1] === '') cells.pop();
        return cells;
      };
      
      // Parse header row
      const headerCells = parseRow(lines[0]);
      const headerHtml = '<tr>' + headerCells.map(cell => `<th>${cell}</th>`).join('') + '</tr>';
      
      // Parse data rows (skip separator row)
      const dataRows = lines.slice(separatorIndex + 1).map(line => {
        const cells = parseRow(line);
        return '<tr>' + cells.map(cell => `<td>${cell}</td>`).join('') + '</tr>';
      }).join('');
      
      return '<table>' + headerHtml + dataRows + '</table>';
    });
    
    // Paragraphs
    html = html.replace(/\n\n/g, '</p><p>');
    html = '<p>' + html + '</p>';
    
    // Clean up empty paragraphs
    html = html.replace(/<p>\s*<\/p>/g, '');
    html = html.replace(/<p>\s*(<h[1-4]>)/g, '$1');
    html = html.replace(/(<\/h[1-4]>)\s*<\/p>/g, '$1');
    html = html.replace(/<p>\s*(<ul>)/g, '$1');
    html = html.replace(/(<\/ul>)\s*<\/p>/g, '$1');
    html = html.replace(/<p>\s*(<pre>)/g, '$1');
    html = html.replace(/(<\/pre>)\s*<\/p>/g, '$1');
    html = html.replace(/<p>\s*(<blockquote>)/g, '$1');
    html = html.replace(/(<\/blockquote>)\s*<\/p>/g, '$1');
    html = html.replace(/<p>\s*(<hr>)/g, '$1');
    html = html.replace(/(<hr>)\s*<\/p>/g, '$1');
    html = html.replace(/<p>\s*(<table>)/g, '$1');
    html = html.replace(/(<\/table>)\s*<\/p>/g, '$1');
    
    return html;
  }

  /**
   * Simple syntax highlighting
   */
  function highlightCode(block) {
    let code = block.textContent;
    const lang = block.className.replace('language-', '');
    
    // Keywords for common languages
    const keywords = {
      javascript: /\b(const|let|var|function|return|if|else|for|while|class|extends|import|export|from|async|await|try|catch|throw|new|this|typeof|instanceof)\b/g,
      python: /\b(def|class|if|else|elif|for|while|return|import|from|as|try|except|raise|with|lambda|yield|async|await|True|False|None)\b/g,
      typescript: /\b(const|let|var|function|return|if|else|for|while|class|extends|import|export|from|async|await|try|catch|throw|new|this|typeof|instanceof|interface|type|enum|implements|private|public|protected)\b/g,
      java: /\b(public|private|protected|class|interface|extends|implements|return|if|else|for|while|new|this|static|final|void|int|String|boolean)\b/g,
      css: /\b(color|background|margin|padding|border|display|flex|grid|position|width|height|font|text)\b/g
    };
    
    // Strings
    code = code.replace(/(["'`])(?:(?!\1)[^\\]|\\.)*\1/g, '<span class="hljs-string">$&</span>');
    
    // Comments
    code = code.replace(/(\/\/.*$|\/\*[\s\S]*?\*\/|#.*$)/gm, '<span class="hljs-comment">$&</span>');
    
    // Keywords
    const keywordPattern = keywords[lang] || keywords.javascript;
    code = code.replace(keywordPattern, '<span class="hljs-keyword">$&</span>');
    
    // Numbers
    code = code.replace(/\b(\d+\.?\d*)\b/g, '<span class="hljs-number">$1</span>');
    
    // Functions
    code = code.replace(/\b([a-zA-Z_]\w*)\s*\(/g, '<span class="hljs-function">$1</span>(');
    
    block.innerHTML = code;
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
   * Check if a word contains RTL characters (Persian, Arabic, Hebrew, etc.)
   */
  function isRTLWord(word) {
    // RTL Unicode ranges: Arabic, Hebrew, Persian, Urdu, etc.
    const rtlPattern = /[\u0591-\u07FF\u200F\u202B\u202E\uFB1D-\uFDFD\uFE70-\uFEFC]/;
    return rtlPattern.test(word);
  }

  /**
   * Detect the dominant direction of text based on word count
   * Returns 'rtl' if more than 50% of words are RTL
   */
  function detectTextDirection(text) {
    if (!text) return 'ltr';

    // Split text into words (split on whitespace and punctuation)
    const words = text.split(/[\s\.,;:!?\-\(\)\[\]{}'"<>\/\\]+/).filter(w => w.length > 0);

    if (words.length === 0) return 'ltr';

    // Count RTL and LTR words
    let rtlWordCount = 0;
    let ltrWordCount = 0;

    words.forEach(word => {
      if (isRTLWord(word)) {
        rtlWordCount++;
      } else if (/[A-Za-z]/.test(word)) {
        ltrWordCount++;
      }
      // Numbers and other characters don't count
    });

    const totalDirectionalWords = rtlWordCount + ltrWordCount;

    // If no directional words found, default to LTR
    if (totalDirectionalWords === 0) return 'ltr';

    // RTL if more than 50% of words are RTL
    return (rtlWordCount / totalDirectionalWords) > 0.5 ? 'rtl' : 'ltr';
  }

  /**
   * Apply direction attributes to HTML elements based on text content
   */
  function applyTextDirection(html) {
    // For streaming performance, we'll use a simpler approach
    // We can wrap the html in a div and use dir="auto" for basic support
    // or just let the CSS handle it if we set unicode-bidi: plaintext
    
    // The current CSS already has:
    // .ea-response p, .ea-response li, etc { unicode-bidi: plaintext; text-align: start; }
    // which handles most RTL cases automatically without needing to detect and set dir="rtl"
    
    // However, for explicit font changes, we still might want it.
    // Let's keep it simple for now as the CSS handles the alignment.
    return html;
  }

  /**
   * Handle text selection
   */
  function handleSelection(e) {
    // Ignore if clicking inside our UI
    if (e.target.closest('.ea-mini-popup, .ea-modal-overlay')) {
      return;
    }
    
    // Small delay to let selection complete
    setTimeout(() => {
      const context = getSelectionContext();
      
      if (context && context.text.length >= 2) {
        showMiniPopup(context);
      } else {
        hideMiniPopup();
      }
    }, 10);
  }

  /**
   * Handle clicks outside selection
   */
  function handleClick(e) {
    // Don't hide if clicking our UI
    if (e.target.closest('.ea-mini-popup, .ea-modal-overlay')) {
      return;
    }
    
    // Hide popup if clicking elsewhere and no selection
    const selection = window.getSelection();
    if (!selection || selection.toString().trim().length < 2) {
      hideMiniPopup();
    }
  }

  // Initialize event listeners
  document.addEventListener('mouseup', handleSelection);
  document.addEventListener('mousedown', handleClick);
  
  // Handle keyboard selection (Shift+Arrow keys)
  document.addEventListener('keyup', (e) => {
    if (e.shiftKey) {
      handleSelection(e);
    }
  });

  console.log('Explain Anything: Content script loaded');
})();

