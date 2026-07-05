# COMPREHENSIVE DEEP-DIVE — PART 2: UI Components, CSS Architecture & Complete Flow

---

# 6. THE MAIN APPLICATION SHELL (App.jsx)

```jsx
function App() {
  return (
    <CryptoProvider>
      <div className="app">
        <header className="app-header">...</header>
        <HandshakePanel />
        <div className="section-divider">Encrypted Chat</div>
        <div className="chat-grid">
          <UserPanel userId="user1" />
          <UserPanel userId="user2" />
        </div>
        <div className="section-divider">Cryptographic Analysis</div>
        <CryptoInspector />
        <EncryptedViewPanel />
      </div>
      <PresentationControls />
    </CryptoProvider>
  );
}
```

**What this does:**

1. **`<CryptoProvider>`** wraps the entire application. This is a React Context Provider — it makes the global state (keys, messages, logs) available to every child component. Without this wrapper, no component could access the crypto state. Every component inside calls `useCrypto()` to read state and dispatch actions.

2. **`<div className="app">`** — The main container, centered with `max-width: 1360px` and using flexbox column layout with gaps between sections.

3. **`<header>`** — Shows the app title "End-to-End Encrypted Messenger" with a badge indicating it uses the Web Crypto API.

4. **`<HandshakePanel />`** — The RSA key exchange section. Shows a "Begin Handshake" button, then a step-by-step timeline, then the final key cards.

5. **`<div className="chat-grid">`** — A CSS Grid with two columns. Each column is a `<UserPanel>`, one for User 1 and one for User 2. They're identical components with different `userId` props.

6. **`<CryptoInspector />`** — The analysis panel with tabs for RSA Keys, Encryption, and Decryption. Shows step-by-step logs of every cryptographic operation.

7. **`<EncryptedViewPanel />`** — A table showing raw hex values (AES key, IV, wrapped key, ciphertext) for every message sent.

8. **`<PresentationControls />`** — A floating toolbar at the bottom of the screen for controlling animation speed and step-by-step mode. Note it's placed OUTSIDE the `.app` div but INSIDE the `<CryptoProvider>` — this is because it's `position: fixed` (floats independently of scroll) but still needs access to the crypto context.

---

# 7. THE HANDSHAKE PANEL COMPONENT (HandshakePanel.jsx)

This component visualizes the RSA key exchange process. It has three states:

## State 1: Idle (Before Handshake)
Shows a "Begin Handshake" button with a lightning bolt icon. If step-by-step mode is active, it shows "(Step-by-Step)" text on the button to indicate the handshake will pause between operations.

## State 2: Running (During Handshake)
Shows a vertical timeline of steps. Each step has:
- A **status indicator**: Either a spinning loading circle (in-progress) or a green checkmark (complete)
- A **label**: Describes the current operation (e.g., "User 1: Generating RSA-2048 key pair...")
- **Key data**: When a key is generated, shows the first 64 characters of the hex-encoded public key with a copy button
- **Detailed logs**: Shows the internal crypto engine logs (modulus, exponent, algorithm details)

The timeline uses a vertical line on the left side (CSS `border-left`) connecting all steps, with circular indicators positioned over the line. Completed steps turn the line green.

**In step mode:** A purple "Next Step" button appears with a pulsing border animation. The handshake is paused until the user clicks this button. A counter shows "Step X of ~7".

## State 3: Complete (After Handshake)
Shows two "key cards" side by side — one for User 1 (cyan colored) and one for User 2 (purple colored). Each card shows the user's avatar, name, and the first 64 characters of their public key with a copy button. Between the cards is an animated double-arrow SVG showing the bidirectional key exchange.

**Key technical details:**
- `const { waitingForStep, speed } = state.presentation;` — Destructures the presentation state to know if we should show the step button
- `const isIdle = handshake.status === 'idle';` — Computed booleans for conditional rendering
- The timeline `handshake.steps.map()` renders each step from the state array, which grows as `performHandshake()` dispatches `ADD_HANDSHAKE_STEP` actions

---

# 8. THE USER PANEL & CHAT SYSTEM (UserPanel.jsx)

Each User Panel is a self-contained chat interface. Two instances are rendered: one with `userId="user1"` and one with `userId="user2"`.

## The Component Structure

```jsx
export default function UserPanel({ userId }) {
  const { state, sendMessage, inspectMessage } = useCrypto();
  const [inputValue, setInputValue] = useState('');
  const [isSending, setIsSending] = useState(false);
```

**Local state:**
- `inputValue` — The text currently typed in the message input field
- `isSending` — Boolean to show a spinner while encryption is processing (prevents double-sends)

## The Header Section
Each panel header shows:
1. **Avatar** — "U1" or "U2" with color-coded background (cyan for User 1, purple for User 2)
2. **Name** — "User 1" or "User 2"
3. **Fingerprint** — The first 16 characters of the user's public key hex, formatted in groups of 4 (e.g., "3082 0122 300D 0609"). This mimics how real apps show key fingerprints for verification.
4. **Status badge** — Shows "Waiting" (grey) before handshake or "Encrypted" (green with pulsing dot) after handshake

## The Messages Area
- Before handshake: Shows a lock icon and "Complete the handshake to start messaging"
- After handshake, no messages: Shows a chat icon and "Send an encrypted message"
- With messages: Renders `<MessageBubble>` components for each message. Messages where `msg.from === userId` are "sent" (right-aligned, colored). Messages where `msg.to === userId` are "received" (left-aligned, white).

**Message filtering:** `state.messages.filter((m) => m.from === userId || m.to === userId)` — Each panel only shows messages that this user sent or received.

**Auto-scroll:** `useEffect` watches `userMessages.length` and scrolls to the bottom whenever a new message appears, using `scrollIntoView({ behavior: 'smooth' })`.

## The Input Area
- Disabled (greyed out, no pointer events) until the handshake is complete
- The input field has Enter-key handling: pressing Enter sends the message (unless Shift is held for multi-line)
- The send button shows a paper plane icon normally, or a spinner while encrypting
- The `handleSend` function: sets `isSending=true`, calls `sendMessage(userId, inputValue)` from context (which triggers the full encrypt+decrypt pipeline), clears the input, sets `isSending=false`

## Color Theming
The component uses dynamic CSS classes:
- `user-panel--cyan` / `user-panel--purple` — Changes the send button color and input focus ring color
- This is set by: `const userColor = isUser1 ? 'cyan' : 'purple';`

---

# 9. THE MESSAGE BUBBLE COMPONENT (MessageBubble.jsx)

A small, focused component that renders a single chat message.

```jsx
export default function MessageBubble({ message, isSender, onInspect }) {
  return (
    <div className={`msg-bubble ${isSender ? 'msg-bubble--sent' : 'msg-bubble--received'}`}>
      <div className="msg-bubble__content">
        <div className="msg-bubble__text">
          <svg className="msg-bubble__lock">...</svg>  {/* Lock icon */}
          <span>{isSender ? message.plaintext : message.decryptedPlaintext}</span>
        </div>
        <div className="msg-bubble__cipher">
          <code>{message.ciphertextHex.substring(0, 48)}...</code>
        </div>
      </div>
      <div className="msg-bubble__footer">
        <span className="msg-bubble__time">{message.timestamp}</span>
        <button onClick={() => onInspect(message)}>Inspect</button>
      </div>
    </div>
  );
}
```

**Key design decisions:**

1. **Sent vs Received display:** The sender sees their original `plaintext`. The receiver sees `decryptedPlaintext` — the result of the full encrypt→decrypt pipeline. In a real app, the sender would only have the plaintext and the receiver would only have the decrypted version.

2. **Ciphertext preview:** Below every message, the first 48 characters of the hex-encoded ciphertext are shown in a monospace font. This visually proves the message was encrypted — you can see the random-looking hex data.

3. **Lock icon:** Every message has a small lock icon to indicate it's encrypted.

4. **Inspect button:** Clicking "Inspect" on any message calls `onInspect(message)`, which updates the `inspectorLog` in the global state, and the Crypto Inspector panel shows the full breakdown for that specific message.

5. **Animation:** Messages slide in from below with a scale animation (`bubbleIn`), giving a smooth chat feel.

---

# 10. THE CRYPTO INSPECTOR COMPONENT (CryptoInspector.jsx)

This is the most detailed UI component. It has three tabs and shows the complete cryptographic breakdown.

## Tab 1: RSA Keys
Shows three expandable cards:
1. **User 1 — RSA-2048 Key Pair** — Shows: Modulus (n), Exponent (e), Algorithm (RSA-OAEP), Key Size (2048 bits), Hash (SHA-256), Public Key (SPKI hex)
2. **User 2 — RSA-2048 Key Pair** — Same fields for User 2
3. **Public Key Exchange** — Shows what was exchanged: User 1's key → User 2, User 2's key → User 1, and the exchange status

## Tab 2: Encryption
When a message has been sent or inspected:
1. **Message Info card** (highlighted in cyan) — Shows sender → recipient, plaintext, timestamp
2. **Encryption log cards** (numbered 1-4) — Each is expandable and shows:
   - Card 1: **AES Key Generation** — The generated 256-bit key in hex
   - Card 2: **IV Generation** — The 12-byte initialization vector in hex
   - Card 3: **Message Encryption (AES-256-GCM)** — Shows plaintext → UTF-8 bytes → encryption parameters → resulting ciphertext hex → ciphertext length
   - Card 4: **RSA Key Wrapping** — Shows the AES key being encrypted with recipient's RSA public key → resulting wrapped key hex
3. **Final Encrypted Output card** (highlighted in green) — Shows the complete output: ciphertext hex, AES key hex, IV hex, wrapped key hex

## Tab 3: Decryption
1. **Decryption log cards** (numbered 1-2):
   - Card 1: **RSA Key Unwrapping** — Shows the wrapped key being decrypted with the private key → recovered AES key hex
   - Card 2: **Message Decryption (AES-256-GCM)** — Shows ciphertext → decrypted bytes hex → recovered plaintext
2. **Recovered Plaintext card** (highlighted in green) — Shows the final decrypted message, the recovered AES key, and an integrity check (compares original plaintext with decrypted plaintext — "PASS" if they match)

## The InspectorField Sub-Component

```jsx
function InspectorField({ label, value, isLong = false }) {
  const [expanded, setExpanded] = useState(false);
  const displayValue = isLong && !expanded ? value.substring(0, 72) + '...' : value;
  // Renders: label, value (truncated if long), expand/collapse button, copy button
}
```

This is a reusable field that handles long hex values. Long values (>80 chars) are truncated with an "Expand" button. Every field has a Copy button.

---

# 11. THE ENCRYPTED DATA VIEW PANEL (EncryptedViewPanel.jsx)

A scrollable table showing raw cryptographic data for every message. Each row contains:

| Column | What It Shows |
|--------|--------------|
| # | Message number (sequential) |
| From | Sender badge (cyan or purple) |
| To | Recipient badge (cyan or purple) |
| AES-256 Key | First 24 chars of the session key hex + copy button |
| IV | The full 24-char IV hex + copy button |
| Wrapped AES Key (RSA) | First 24 chars of the RSA-encrypted key + copy button |
| Ciphertext | First 24 chars of the encrypted message hex + copy button |
| Plaintext | The original message text |

**Purpose:** This view lets you compare across messages. You can see that each message has a DIFFERENT AES key and IV (proving per-message key generation), while the ciphertext lengths vary with message length.

---

# 12. THE PRESENTATION CONTROLS COMPONENT (PresentationControls.jsx)

A floating bar pinned to the bottom of the screen with `position: fixed`.

```jsx
const SPEED_OPTIONS = [
  { key: 'instant', label: 'Instant' },   // 0ms delay
  { key: 'fast', label: '0.3s' },         // 300ms delay
  { key: 'normal', label: '0.6s' },       // 600ms delay (default)
  { key: 'slow', label: '2s' },           // 2000ms delay
  { key: 'step', label: 'Manual' },       // Waits for click
];
```

**Components:**
1. **Speed label** — "Speed" text (hidden on mobile)
2. **Speed buttons** — Five pill-shaped buttons, the active one highlighted in cyan
3. **Divider** — A thin vertical line
4. **Step-by-Step toggle** — A button with a dot indicator. When active (purple), the handshake requires manual advancement

**How speed control works internally:**
- Clicking a speed button calls `setSpeed(key)` which dispatches `SET_SPEED` to the reducer
- The reducer updates `state.presentation.speed` and sets `stepMode = true` if speed is 'step'
- When `performHandshake()` runs, it calls `waitForNext()` between each step
- `waitForNext()` checks the current speed and either waits for a timeout OR waits for the user to click "Next Step"

---

# 13. THE COPY BUTTON UTILITY (CopyButton.jsx)

A reusable button that copies text to the clipboard.

```jsx
export default function CopyButton({ text, label = 'Copy' }) {
  const handleCopy = async (e) => {
    e.stopPropagation();  // Prevent click from bubbling to parent (important!)
    try {
      await navigator.clipboard.writeText(text);  // Modern API
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);    // Reset after 1.5s
    } catch {
      // Fallback: create a hidden textarea, select it, use execCommand
    }
  };
}
```

**Key details:**
- `e.stopPropagation()` — Prevents the click from triggering parent click handlers (like the accordion toggle on inspector cards)
- **Primary method:** `navigator.clipboard.writeText()` — The modern async Clipboard API
- **Fallback method:** For older browsers, creates a temporary `<textarea>`, sets its value, selects the text, calls `document.execCommand('copy')`, then removes the textarea
- **Visual feedback:** Shows a checkmark and "Copied!" text for 1.5 seconds, with green styling

---

# 14. THE DESIGN SYSTEM (CSS Architecture)

## CSS Variables (Design Tokens)

The entire visual theme is defined through CSS custom properties in `:root`:

### Colors
- **Backgrounds:** `--bg-primary: #f8f9fc` (light grey page background), `--bg-secondary: #f1f3f8`
- **Surfaces:** `--surface-primary: #ffffff` (card backgrounds), `--surface-elevated: #f4f6fa` (slightly darker for headers/nested areas)
- **Borders:** `--border-subtle: #e2e5ed` (light borders), `--border-medium: #cdd2dc` (darker borders)
- **Text:** `--text-primary: #1a1d28` (near-black), `--text-secondary: #4a5068` (dark grey), `--text-tertiary: #8890a4` (light grey for labels)
- **Accents:** Cyan (#0891b2) for User 1 and primary actions, Purple (#7c3aed) for User 2 and step mode, Green (#059669) for success states, Amber (#d97706) for warnings, Red (#dc2626) for errors

### Typography
- **Sans-serif:** Inter with system font fallbacks — used for all body text and headings
- **Monospace:** JetBrains Mono with Fira Code fallback — used for all hex values, keys, and crypto data

### Spacing System
A consistent scale: 4px → 8px → 16px → 24px → 32px → 48px

### Shadows
Three levels of elevation: `--shadow-sm` (barely visible), `--shadow-md` (subtle), `--shadow-lg` (prominent, used for the floating presentation controls)

## Key Animations
1. **`pulse`** — The green dot in the header badge pulses opacity with a spreading box-shadow
2. **`slideUp`** — The presentation controls bar slides up from below when the page loads
3. **`stepFadeIn`** — Each handshake timeline step fades in and slides up
4. **`spin`** — The loading spinners rotate 360 degrees continuously
5. **`bubbleIn`** — Chat messages scale up and fade in
6. **`pulseBorder`** — The "Next Step" button's border pulses with a purple glow
7. **`arrowPulse`** — The key exchange arrow fades in and out
8. **`dotPulse`** — The encryption status dot pulses

---

# 15. HOW IT ALL WORKS TOGETHER — THE COMPLETE FLOW

## Flow 1: The RSA Handshake (Key Exchange)

```
User clicks "Begin Handshake"
    │
    ▼
HandshakePanel calls performHandshake() from CryptoContext
    │
    ▼
Step 1: CryptoContext dispatches 'SET_HANDSHAKE_STATUS' → status = 'generating-user1'
        CryptoContext dispatches 'ADD_HANDSHAKE_STEP' → "User 1: Generating RSA-2048..."
        HandshakePanel re-renders, shows step with spinner
    │
    ▼
Step 2: waitForNext() pauses (600ms delay or waits for manual click)
    │
    ▼
Step 3: cryptoEngine.generateRSAKeyPair('User 1') is called
        → crypto.subtle.generateKey() creates the RSA key pair
        → crypto.subtle.exportKey('jwk') extracts modulus and exponent
        → crypto.subtle.exportKey('spki') exports the key in binary format
        → arrayBufferToHex() converts to hex string
        → Returns: keyPair, publicKeyHex, jwk, logs
    │
    ▼
Step 4: CryptoContext dispatches 'SET_USER_KEYS' → stores User 1's keys in state
        CryptoContext dispatches 'ADD_HANDSHAKE_STEP' → "User 1: RSA-2048 key pair generated ✓"
        HandshakePanel re-renders, shows completed step with checkmark + key preview
    │
    ▼
Steps 5-8: Same process for User 2
    │
    ▼
Steps 9-10: "Exchanging public keys..." → "Public keys exchanged ✓"
    │
    ▼
Step 11: CryptoContext dispatches 'SET_HANDSHAKE_STATUS' → status = 'complete'
         HandshakePanel re-renders, shows key cards for both users
         UserPanels unlock — input fields become active, status changes to "Encrypted"
```

## Flow 2: Sending an Encrypted Message

```
User 1 types "Hello World" and presses Enter
    │
    ▼
UserPanel calls sendMessage('user1', 'Hello World') from CryptoContext
    │
    ▼
CryptoContext determines: sender = user1, recipient = user2
Gets User 2's public key (for encryption) and private key (for simulated decryption)
    │
    ▼
ENCRYPTION PIPELINE (fullEncrypt):
    │
    ├── 1. generateAESKey()
    │       → crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 })
    │       → Fresh 256-bit key, unique to THIS message
    │       → Exported to hex for display: e.g., "a3f8b2c1..."
    │
    ├── 2. generateIV()
    │       → crypto.getRandomValues(new Uint8Array(12))
    │       → 12 random bytes, e.g., "7d4e9f2a1b3c"
    │
    ├── 3. encryptMessage('Hello World', aesKey, iv)
    │       → TextEncoder converts "Hello World" to bytes [72, 101, 108, ...]
    │       → crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, data)
    │       → Output: ciphertext (message bytes + 16-byte auth tag)
    │       → Converted to hex: "8f3a2b..."
    │
    └── 4. wrapAESKey(aesKey, user2PublicKey)
            → crypto.subtle.wrapKey('raw', aesKey, user2PublicKey, { name: 'RSA-OAEP' })
            → The 32-byte AES key is encrypted with User 2's RSA public key
            → Output: 256 bytes of RSA-encrypted data
            → Converted to hex: "4a7f2e..."
    │
    ▼
DECRYPTION PIPELINE (fullDecrypt) — simulating User 2 receiving:
    │
    ├── 1. unwrapAESKey(wrappedKey, user2PrivateKey)
    │       → crypto.subtle.unwrapKey('raw', wrappedKey, privateKey, ...)
    │       → User 2's RSA private key decrypts the wrapped key
    │       → Recovers the original AES-256 key
    │
    └── 2. decryptMessage(ciphertext, recoveredAesKey, iv)
            → crypto.subtle.decrypt({ name: 'AES-GCM', iv }, aesKey, ciphertext)
            → GCM verifies the authentication tag (tamper check)
            → Decrypts the ciphertext back to bytes
            → TextDecoder converts bytes back to "Hello World"
    │
    ▼
CryptoContext dispatches:
    1. 'ADD_MESSAGE' → Full message object with all data and logs
    2. 'SET_INSPECTOR_LOG' → Updates the Crypto Inspector with this message's details
    3. 'ADD_ENCRYPTED_VIEW_ENTRY' → Adds a row to the Encrypted Data View table
    │
    ▼
All components re-render:
    - Both UserPanels show the new message bubble (sent on User 1's side, received on User 2's)
    - CryptoInspector shows the encryption/decryption logs
    - EncryptedViewPanel shows a new row with all hex values
```

## Flow 3: Inspecting a Message

```
User clicks "Inspect" on a message bubble
    │
    ▼
MessageBubble calls onInspect(message)
    │
    ▼
UserPanel passes this through as inspectMessage(message) from CryptoContext
    │
    ▼
CryptoContext dispatches 'SET_INSPECTOR_LOG' with that message's encryption and decryption logs
    │
    ▼
CryptoInspector re-renders with the selected message's full crypto breakdown
```

---

# CRYPTOGRAPHIC CONCEPTS SUMMARY

| Concept | What It Is | Where It's Used |
|---------|-----------|----------------|
| **RSA-2048** | Asymmetric encryption with 2048-bit keys | Key exchange (wrapping/unwrapping AES keys) |
| **RSA-OAEP** | RSA with Optimal Asymmetric Encryption Padding | Prevents certain attacks on RSA |
| **AES-256** | Symmetric encryption with 256-bit key | Encrypting actual message content |
| **AES-GCM** | AES in Galois/Counter Mode | Provides encryption + authentication in one operation |
| **IV (Initialization Vector)** | 12-byte random value | Ensures same plaintext produces different ciphertext each time |
| **Key Wrapping** | Encrypting one key with another key | Securely transmitting the AES key using RSA |
| **SPKI** | Subject Public Key Info format | Standard binary format for public keys |
| **JWK** | JSON Web Key format | Human-readable JSON format showing key components |
| **GCM Auth Tag** | 16-byte integrity checksum | Detects if ciphertext was tampered with |
| **Hybrid Cryptosystem** | RSA + AES used together | RSA for key transport, AES for data encryption |

---

# FILE MAP

| File | Purpose | Lines |
|------|---------|-------|
| `index.html` | HTML shell, meta tags, loads the app | 16 |
| `src/main.jsx` | React entry point, renders App in StrictMode | 11 |
| `src/App.jsx` | Main layout, assembles all panels | 53 |
| `src/App.css` | Minimal app-level overrides | 2 |
| `src/index.css` | Complete design system (variables, layout, animations) | 415 |
| `src/crypto/cryptoEngine.js` | All Web Crypto API functions | 354 |
| `src/context/CryptoContext.jsx` | Global state, reducer, handshake + message orchestration | 380 |
| `src/components/HandshakePanel.jsx` | RSA key exchange UI with timeline | 159 |
| `src/components/HandshakePanel.css` | Handshake panel styles | 308 |
| `src/components/UserPanel.jsx` | Chat interface for each user | 130 |
| `src/components/UserPanel.css` | Chat panel styles | 231 |
| `src/components/MessageBubble.jsx` | Individual message display | 31 |
| `src/components/MessageBubble.css` | Message bubble styles | 112 |
| `src/components/CryptoInspector.jsx` | Tabbed crypto analysis panel | 277 |
| `src/components/CryptoInspector.css` | Inspector styles | 266 |
| `src/components/EncryptedViewPanel.jsx` | Raw hex data table | 95 |
| `src/components/EncryptedViewPanel.css` | Table styles | 143 |
| `src/components/PresentationControls.jsx` | Floating speed/step controls | 46 |
| `src/components/CopyButton.jsx` | Clipboard copy utility | 46 |
| `src/components/CopyButton.css` | Copy button styles | 33 |

---

**END OF COMPREHENSIVE EXPLANATION**

You now have a complete, line-by-line understanding of every file, every function, every cryptographic operation, every React pattern, and every CSS design decision in this application. Give both Part 1 and Part 2 to Claude AI to convert into your final document.
