# Explain Anything - Chrome Extension

A Chrome extension that provides instant AI explanations for any selected text on web pages. Simply select text, click the popup icon, and get a clear explanation powered by your choice of LLM providers.

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![Manifest](https://img.shields.io/badge/manifest-v3-green)

## Features

- **Text Selection Detection**: Automatically detects when you select text on any webpage
- **Quick Access Popup**: Small icon appears near your selection for easy access
- **Rich Explanations**: Get detailed, markdown-formatted explanations
- **Multiple LLM Providers**:
  - **OpenRouter** (API Key) - Access to Claude, GPT-4, Gemini, Llama, and more
  - **Gemini** (Cookie Auth) - Use your existing Google Gemini session
  - **ChatGPT** (Cookie Auth) - Use your existing ChatGPT session
  - **Claude** (Cookie Auth) - Use your existing Claude session
- **Customizable**: Set your preferred language, model, and system prompt
- **Beautiful UI**: Clean, modern interface with markdown rendering and syntax highlighting

## Installation

### From Source (Developer Mode)

1. Clone or download this repository
2. Generate the icons:
   ```bash
   node scripts/generate-icons.js
   ```
3. Open Chrome and navigate to `chrome://extensions/`
4. Enable "Developer mode" in the top right
5. Click "Load unpacked" and select the extension directory
6. The extension is now installed!

### First-Time Setup

1. After installation, the settings page will open automatically
2. Choose your preferred LLM provider
3. For **OpenRouter**: Enter your API key from [openrouter.ai/keys](https://openrouter.ai/keys)
4. For **Cookie-based providers**: Make sure you're logged into the respective service (Gemini, ChatGPT, or Claude)
5. Select your preferred model and output language
6. Optionally customize the system prompt
7. Click "Save Settings"

## Usage

1. **Select Text**: Highlight any text on a webpage
2. **Click the Icon**: A small purple icon appears near your selection
3. **Get Explanation**: Click the icon to open the explanation modal
4. **Read & Copy**: View the formatted response, copy it if needed
5. **Close**: Click outside the modal or press Escape to close

## Settings

Access settings by:
- Right-clicking the extension icon → "Options"
- Or clicking the extension icon and selecting "Settings"

### Available Options

| Setting | Description |
|---------|-------------|
| **Language** | Output language for explanations (English, Spanish, French, etc.) |
| **Provider** | LLM service to use (OpenRouter, Gemini, ChatGPT, Claude) |
| **Model** | Specific AI model (varies by provider) |
| **System Prompt** | Custom instructions for how the AI should respond |
| **API Key** | Required only for OpenRouter |

## LLM Providers

### OpenRouter (Recommended)
- Requires API key from [openrouter.ai](https://openrouter.ai)
- Pay-per-use pricing
- Access to many models including Claude, GPT-4, Gemini, Llama, Mistral, etc.
- Most reliable option

### Gemini (Cookie Auth)
- Free with Google account
- Log in at [gemini.google.com](https://gemini.google.com)
- Uses your existing browser session

### ChatGPT (Cookie Auth)
- Works with free or Plus accounts
- Log in at [chatgpt.com](https://chatgpt.com)
- Uses your existing browser session

### Claude (Cookie Auth)
- Works with free or Pro accounts
- Log in at [claude.ai](https://claude.ai)
- Uses your existing browser session

**Note**: Cookie-based providers use reverse-engineered APIs and may break if the services update their interfaces.

## Permissions

The extension requires:
- `activeTab` - To detect text selection on the current page
- `storage` - To save your settings
- `cookies` - To read session cookies for cookie-based providers
- Host permissions for API endpoints

## Development

### Project Structure

```
explain-anything/
├── manifest.json           # Extension manifest (V3)
├── src/
│   ├── content/           # Content script (selection detection, popup)
│   ├── background/        # Service worker (API routing)
│   ├── options/           # Settings page
│   ├── providers/         # LLM provider implementations
│   └── lib/               # Shared utilities
├── assets/                # Icons
├── scripts/               # Build scripts
└── README.md
```

### Building Icons

```bash
node scripts/generate-icons.js
```

### Testing

1. Load the extension in developer mode
2. Navigate to any webpage
3. Select some text
4. Click the popup icon
5. Verify the explanation appears

## Troubleshooting

### "Not logged in" errors
- For cookie-based providers, make sure you're logged into the respective service
- Try refreshing the service's webpage and retry

### No popup appears
- Check if the extension is enabled in `chrome://extensions/`
- Reload the page you're trying to use it on
- Make sure you're selecting at least 2 characters

### API errors
- For OpenRouter: Verify your API key is correct and has credits
- For cookie-based: Try logging out and back in to the service

## Privacy

- Selected text is sent to your chosen LLM provider for processing
- Settings are stored locally in Chrome sync storage
- No data is collected by the extension itself
- Cookie-based auth uses only session cookies from the respective services

## License

MIT License - Feel free to modify and distribute.

## Contributing

Contributions are welcome! Please feel free to submit issues and pull requests.

