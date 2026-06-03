# Google Keep Popup Extension

A fast, lightweight, and elegantly designed Chrome Extension (Manifest V3) that allows you to view, filter, and create Google Keep notes directly from a browser popup without having to open the Google Keep website.

## Key Features

- **Instant Access**: View all your pinned and regular notes in a beautifully designed masonry layout.
- **Rich Text Support**: Parses markdown-like syntax including headings, bold/italic, lists, links, and interactive checkboxes.
- **Real-time Search**: Blazing fast client-side filtering by note title and content.
- **Dark/Light Mode**: Seamless theme switching with persistent user preferences.
- **Privacy-focused**: Connects directly to Google Keep's internal endpoints using your existing browser session. No third-party servers involved.

---

## Tech Stack

- **Platform**: Chrome Extensions API (Manifest V3)
- **Frontend**: Vanilla JavaScript (ES6+), HTML5
- **Styling**: Tailwind CSS v4
- **Typography**: Local Inter font (bypasses CSP restrictions)
- **Utilities**: Python (Pillow) for programmatic icon generation

---

## Prerequisites

To build and develop this extension locally, you need:

- **Node.js** (v18 or higher) for compiling Tailwind CSS.
- **Python 3** (with `Pillow` library) if you want to regenerate the extension icons.
- A Chromium-based browser (Chrome, Edge, Brave).

---

## Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/yourusername/google-keep-popup.git
cd google-keep-popup
```

### 2. Generate Icons (Optional)

The icons are generated programmatically using a Python script. If you need to rebuild them:

```bash
pip install Pillow
python create_icons.py
```

### 3. Compile Tailwind CSS

To build the CSS for the popup interface:

```bash
# Compile once
npx @tailwindcss/cli -i popup/input.css -o popup/popup.css

# Or watch for changes during development
npx @tailwindcss/cli -i popup/input.css -o popup/popup.css --watch
```

### 4. Load the Extension in Chrome

1. Open your browser and navigate to `chrome://extensions/`.
2. Enable **Developer mode** (toggle in the top right corner).
3. Click **Load unpacked** and select the `google-keep-popup` directory.
4. Pin the extension to your toolbar for easy access!

---

## Architecture

### Directory Structure

```text
├── background.js          # Service Worker: Handles API requests & network rules
├── manifest.json          # MV3 Extension configuration
├── create_icons.py        # Python script to generate icons
├── icons/                 # Extension icons (16x16, 48x48, 128x128)
└── popup/
    ├── popup.html         # Main UI layout
    ├── popup.js           # UI logic, state management, and Rich Text parsing
    ├── input.css          # Tailwind CSS entry file
    ├── popup.css          # Compiled CSS (git-ignored ideally)
    └── fonts/
        └── Inter.woff2    # Local font file
```

### Request Lifecycle

Since Google Keep doesn't offer a public REST API for personal accounts, this extension intelligently piggybacks on the active web session:

1. **Authentication**: The extension relies on your active Google session. If you are logged into Google, it works.
2. **Network Interception**: `declarativeNetRequest` modifies outgoing requests to `keep.google.com` to inject the necessary `Cookie` headers from the browser.
3. **Data Fetching**: The Service Worker (`background.js`) fetches the internal Keep JSON payload (`https://keep.google.com/`).
4. **Data Extraction**: The raw HTML/JSON response is parsed using Regex to extract the internal node arrays containing notes, colors, and timestamps.
5. **UI Rendering**: `popup.js` receives the sanitized data array and renders it into the DOM, applying the Markdown/Rich Text parser.

### Key Components

**Service Worker (`background.js`)**
Maintains the ephemeral background state. It sets up the `declarativeNetRequest` rules to bypass CORS and properly send session cookies. It processes `FETCH_KEEP_DATA`, `CREATE_NOTE`, and `DELETE_NOTE` messages from the popup.

**Rich Text Parser (`popup.js`)**
A custom, lightweight regex-based parser that safely escapes HTML to prevent XSS, and translates Markdown patterns (`#`, `**`, `[x]`) into styled HTML elements.

**Real-time Filter (`popup.js`)**
Keeps the entire note list in memory (`allNotesData`) and re-renders the grid instantly on `input` events from the search bar.

---

## Permissions Breakdown

The extension requires the following permissions in `manifest.json`:

| Permission | Reason |
|------------|--------|
| `storage`  | Saving user preferences (e.g., Light/Dark mode). |
| `activeTab`| Required for basic popup interactions. |
| `cookies`  | Reading session cookies to authenticate API requests to Google Keep. |
| `declarativeNetRequest` | Modifying network headers (injecting cookies into `fetch` requests). |
| `host_permissions` | `*://*.google.com/*` - To make requests to Google's backend. |

---

## Deployment (Chrome Web Store)

To pack the extension for production:

1. Ensure the CSS is fully built: `npx @tailwindcss/cli -i popup/input.css -o popup/popup.css --minify`
2. Remove any unnecessary files (like `.git`, `create_icons.py`, `input.css`).
3. Zip the directory.
4. Upload the `.zip` file to the [Chrome Developer Dashboard](https://chrome.google.com/webstore/devconsole).

---

## Troubleshooting

### "Vui lòng đăng nhập Google Keep" Error
If you see this error, your session might have expired. Open `https://keep.google.com` in a new tab, ensure you are logged in, and then refresh the extension.

### Icons are showing as default puzzle piece
Chrome strictly validates PNG sizes. Ensure you run `python create_icons.py` to generate the exact 16x16, 48x48, and 128x128 pixel dimensions rather than relying on CSS scaling.

### Styles are missing
Ensure Tailwind CSS has been compiled. Check if `popup/popup.css` exists and is linked correctly in `popup/popup.html`.
