# Explain Anything - Chrome Extension

A Chrome extension that provides instant AI explanations and translations for any selected text on web pages. Designed with a minimal, modern black-and-white aesthetic, it integrates seamlessly into your browsing experience.

![Version](https://img.shields.io/badge/version-1.1.0-black)
![Manifest](https://img.shields.io/badge/manifest-v3-black)

## Features

- **Text Selection Detection**: Automatically detects when you select text on any webpage.
- **Dual Action Popup**: A minimal black pill appears near your selection offering two options:
  - **Explain**: Get clear, educational explanations with context.
  - **Translate**: Get detailed translations with examples, idioms, and usage context.
- **Rich AI Responses**:
  - Markdown formatting.
  - Syntax highlighting for code.
  - RTL (Right-to-Left) text support for languages like Arabic, Persian, and Hebrew.
- **Supported LLM Providers**:
  - **OpenRouter** (API Key) - Access Claude, GPT-4, Llama 3, and more.
  - **Gemini** (API Key) - Use Google's Gemini models (Free tier available).
- **Modern Minimal UI**: sleek black & white interface inspired by modern design systems (shadcn/ui).
- **Customizable**: Configure your preferred language, model, and system prompts.

## Installation

### From Source (Developer Mode)

1. Clone or download this repository.
2. Generate the icons (requires Node.js):
   ```bash
   node scripts/generate-icons.js
   ```
3. Open Chrome and navigate to `chrome://extensions/`.
4. Enable **"Developer mode"** in the top right corner.
5. Click **"Load unpacked"** and select the extension directory (`explain-anything`).
6. The extension is now installed!

### Configuration

1. After installation, the settings page should open automatically. (If not, click the extension icon and select "Settings").
2. **Select a Provider**:
   - **OpenRouter**: Great for accessing a wide variety of models. Get a key at [openrouter.ai/keys](https://openrouter.ai/keys).
   - **Gemini**: Excellent free tier options. Get a key at [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey).
3. **Enter API Key**: Paste your key into the corresponding field.
4. **Select Model**: Choose the AI model you want to use (e.g., `gemini-1.5-flash`, `anthropic/claude-3-haiku`).
5. **Set Language**: Choose the language you want the AI to respond in.
6. Click **"Save Settings"**.

## Usage

1. **Select Text**: Highlight any text on a webpage.
2. **Choose Action**: A small black popup will appear next to your cursor with two icons:
   - **Left Icon (Sparkles)**: Explain the selected text.
   - **Right Icon (Translate)**: Translate the selected text.
3. **View Result**: A clean modal will open displaying the AI's response.
4. **Copy**: Click the copy icon to save the response to your clipboard.
5. **Close**: Click the close icon (X), click outside the modal, or press `Esc`.

## Project Structure

```
explain-anything/
├── manifest.json           # Extension manifest (V3)
├── src/
│   ├── content/           # Content script (UI, selection logic)
│   ├── background/        # Service worker (API handling)
│   ├── options/           # Settings page
│   └── providers/         # API integrations (Gemini, OpenRouter)
├── assets/                # Icons
├── scripts/               # Utility scripts
└── README.md
```

## Privacy

- **No Data Collection**: The extension does not collect or track your browsing data.
- **Direct Communication**: Selected text is sent directly from your browser to your chosen LLM provider (OpenRouter or Google) solely for the purpose of generating the response.
- **Local Storage**: Your API keys and settings are stored locally in your browser's sync storage.

## License

MIT License - Feel free to modify and distribute.