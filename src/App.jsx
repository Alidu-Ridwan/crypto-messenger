import { useState, useRef, useEffect } from "react";

// ── Crypto helpers ──────────────────────────────────────────────────────────
const toHex = buf =>
  Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
const peek   = (h, n = 12) => (h ? h.slice(0, n) + "···" : "—");
const finger = h => (h ? `${h.slice(0,4)} ${h.slice(4,8)} ··· ${h.slice(-4)}` : "—");

async function genKeyPair() {
  const kp = await crypto.subtle.generateKey(
    { name:"RSA-OAEP", modulusLength:2048, publicExponent:new Uint8Array([1,0,1]), hash:"SHA-256" },
    true, ["wrapKey","unwrapKey"]
  );
  const spki = await crypto.subtle.exportKey("spki", kp.publicKey);
  return { kp, pubHex: toHex(spki) };
}

async function encryptMessage(text, pubKey) {
  const sk    = await crypto.subtle.generateKey({ name:"AES-GCM", length:256 }, true, ["encrypt","decrypt"]);
  const rawSk = await crypto.subtle.exportKey("raw", sk);
  const salt  = crypto.getRandomValues(new Uint8Array(12));
  const ct    = await crypto.subtle.encrypt({ name:"AES-GCM", iv:salt }, sk, new TextEncoder().encode(text));
  const lk    = await crypto.subtle.wrapKey("raw", sk, pubKey, { name:"RSA-OAEP" });
  return {
    skHex:   toHex(rawSk),
    saltHex: toHex(salt.buffer),
    ctHex:   toHex(ct),
    lkHex:   toHex(lk),
    _salt: salt, _ct: new Uint8Array(ct), _lk: new Uint8Array(lk),
  };
}

async function decryptMessage(ct, lk, salt, privKey) {
  const sk = await crypto.subtle.unwrapKey(
    "raw", lk, privKey,
    { name:"RSA-OAEP" },
    { name:"AES-GCM", length:256 },
    false, ["decrypt"]
  );
  return new TextDecoder().decode(
    await crypto.subtle.decrypt({ name:"AES-GCM", iv:salt }, sk, ct)
  );
}

// ── Design tokens ───────────────────────────────────────────────────────────
const TEAL   = "#0d9488";
const PURPLE = "#7c3aed";
const BORDER = "#e2e8f0";
const MUTED  = "#64748b";
const TEXT   = "#1e293b";
const GREEN  = "#059669";
const MONO   = "'JetBrains Mono','Fira Code',monospace";
const SANS   = "system-ui,-apple-system,sans-serif";

const USER = {
  u1: { color:TEAL,   bg:"#f0fdfa", name:"User 1", init:"U1" },
  u2: { color:PURPLE, bg:"#faf5ff", name:"User 2", init:"U2" },
};

const STEP_MSG = [
  "",
  "User 1: Generating RSA-2048 key pair…",
  "User 2: Generating RSA-2048 key pair…",
  "✓ Both key pairs generated",
  "Exchanging public keys over the channel…",
  "✓ Secure channel established!",
];

// ── Root ────────────────────────────────────────────────────────────────────
export default function App() {
  const [phase, setPhase] = useState("idle");
  const [hStep, setHStep] = useState(0);
  const [u1,    setU1]    = useState({ kp:null, pubHex:"" });
  const [u2,    setU2]    = useState({ kp:null, pubHex:"" });
  const [msgs,  setMsgs]  = useState([]);
  const [story, setStory] = useState(null);
  const [inp1,  setInp1]  = useState("");
  const [inp2,  setInp2]  = useState("");
  const [busy,  setBusy]  = useState(false);

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  const doHandshake = async () => {
    setPhase("running"); setHStep(1); await sleep(400);
    const r1 = await genKeyPair(); setU1(r1); setHStep(2); await sleep(300);
    const r2 = await genKeyPair(); setU2(r2); setHStep(3); await sleep(400);
    setHStep(4); await sleep(700);
    setHStep(5); await sleep(500);
    setPhase("ready");
  };

  const doSend = async from => {
    if (busy) return;
    const text = (from === "u1" ? inp1 : inp2).trim();
    if (!text) return;
    setBusy(true);
    const recip = from === "u1" ? u2 : u1;
    try {
      const enc   = await encryptMessage(text, recip.kp.publicKey);
      const plain = await decryptMessage(enc._ct, enc._lk, enc._salt, recip.kp.privateKey);
      setStory({ text, plain, ...enc });
      setMsgs(prev => [
        ...prev,
        { id:Date.now(), from, to:from==="u1"?"u2":"u1", text, plain, ...enc },
      ]);
      from === "u1" ? setInp1("") : setInp2("");
    } catch(e) { console.error(e); }
    setBusy(false);
  };

  if (phase !== "ready") {
    return <HandshakeView phase={phase} hStep={hStep} u1={u1} u2={u2} onStart={doHandshake} />;
  }
  return (
    <ChatView
      u1={u1} u2={u2} msgs={msgs} story={story}
      inp1={inp1} inp2={inp2}
      setInp1={setInp1} setInp2={setInp2}
      onSend={doSend} busy={busy}
    />
  );
}

// ── Handshake screen ────────────────────────────────────────────────────────
function HandshakeView({ phase, hStep, u1, u2, onStart }) {
  const exchanged = hStep >= 4;
  const done      = hStep === 5;

  return (
    <div style={{ fontFamily:SANS, padding:"1.5rem 1rem", maxWidth:580, margin:"0 auto" }}>
      <div style={{ textAlign:"center", marginBottom:"1.75rem" }}>
        <div style={{ fontSize:44, marginBottom:10 }}>🔐</div>
        <h1 style={{ fontSize:22, fontWeight:600, margin:"0 0 6px", color:TEXT }}>
          E2E Encrypted Messenger
        </h1>
        <p style={{ color:MUTED, fontSize:13, margin:0 }}>
          RSA-2048 key exchange · AES-256-GCM encryption · Web Crypto API
        </p>
      </div>

      <div style={{ display:"flex", gap:10, alignItems:"center", marginBottom:20 }}>
        <KeyCard uid="u1" data={u1} hStep={hStep} />
        <div style={{ flex:1, display:"flex", flexDirection:"column", gap:10 }}>
          {[
            { label:"public key →", color:TEAL,   side:"right" },
            { label:"← public key", color:PURPLE, side:"left"  },
          ].map(({ label, color, side }) => (
            <div key={label} style={{ display:"flex", alignItems:"center", gap:4 }}>
              {side === "left" && (
                <div style={{ flex:1, height:2, borderRadius:1, background:exchanged?color:BORDER, transition:"background .5s .3s" }} />
              )}
              <span style={{ fontSize:10, whiteSpace:"nowrap", fontWeight:500, color:exchanged?color:MUTED, transition:"color .5s" }}>
                {label}
              </span>
              {side === "right" && (
                <div style={{ flex:1, height:2, borderRadius:1, background:exchanged?color:BORDER, transition:"background .5s" }} />
              )}
            </div>
          ))}
        </div>
        <KeyCard uid="u2" data={u2} hStep={hStep} />
      </div>

      {hStep > 0 && (
        <div style={{
          display:"flex", alignItems:"center", gap:8,
          padding:"10px 14px", borderRadius:8,
          background: done ? "#ecfdf5" : "#f8fafc",
          border:`1px solid ${done ? "#6ee7b7" : BORDER}`,
          marginBottom:14, fontSize:13,
          color: done ? "#065f46" : TEXT,
          transition:"all .4s",
        }}>
          <span>{done ? "✅" : "⏳"}</span>
          <span>{STEP_MSG[hStep]}</span>
        </div>
      )}

      <div style={{
        padding:"12px 14px", borderRadius:8,
        background:"#eff6ff", border:"1px solid #bfdbfe",
        fontSize:12, color:"#1e40af", lineHeight:1.65, marginBottom:18,
      }}>
        <strong>What is the handshake?</strong>&nbsp;
        Each user runs the RSA-2048 algorithm to generate two linked keys — a{" "}
        <em>public key</em> (shared openly) and a <em>private key</em> (kept secret forever).
        They swap public keys so messages can be encrypted for only the intended recipient.
        No password needed — the math guarantees it.
      </div>

      {phase === "idle" && (
        <button onClick={onStart} style={{
          width:"100%", padding:"12px 0",
          background:TEAL, color:"#fff", border:"none",
          borderRadius:8, fontSize:14, fontWeight:600, cursor:"pointer",
        }}>
          Begin Secure Handshake
        </button>
      )}
      {done && (
        <div style={{ textAlign:"center", color:GREEN, fontWeight:500, fontSize:14, padding:8 }}>
          ✓ Opening chat…
        </div>
      )}
    </div>
  );
}

function KeyCard({ uid, data, hStep }) {
  const { color, bg, name } = USER[uid];
  const ready   = Boolean(data.pubHex);
  const genStep = uid === "u1" ? 1 : 2;
  const isGen   = hStep === genStep && !ready;

  return (
    <div style={{
      flex:1, borderRadius:12, padding:14,
      border:`1.5px solid ${ready ? color : BORDER}`,
      background: ready ? bg : "#fff",
      transition:"all .4s", minWidth:120,
    }}>
      <div style={{
        width:36, height:36, borderRadius:"50%",
        background:color, color:"#fff",
        fontSize:13, fontWeight:600,
        display:"flex", alignItems:"center", justifyContent:"center", marginBottom:10,
      }}>
        {USER[uid].init}
      </div>
      <div style={{ fontSize:13, fontWeight:500, color:TEXT, marginBottom:5 }}>{name}</div>
      {!ready ? (
        <div style={{ fontSize:11, color:MUTED, fontFamily:MONO }}>
          {isGen ? "generating…" : "waiting…"}
        </div>
      ) : (
        <>
          <div style={{ fontSize:9, color:MUTED, marginBottom:3, textTransform:"uppercase", letterSpacing:"0.06em" }}>
            RSA fingerprint
          </div>
          <div style={{ fontFamily:MONO, fontSize:10, color, marginBottom:7, wordBreak:"break-all" }}>
            {finger(data.pubHex)}
          </div>
          <span style={{ fontSize:10, fontWeight:500, color, background:color+"22", padding:"2px 7px", borderRadius:4 }}>
            ✓ ready
          </span>
        </>
      )}
    </div>
  );
}

// ── Chat screen ─────────────────────────────────────────────────────────────
function ChatView({ u1, u2, msgs, story, inp1, inp2, setInp1, setInp2, onSend, busy }) {
  return (
    <div style={{ fontFamily:SANS, maxWidth:780, margin:"0 auto", padding:"1rem" }}>
      <div style={{
        display:"flex", alignItems:"center", justifyContent:"space-between",
        padding:"8px 14px", borderRadius:8,
        border:`1px solid ${BORDER}`, background:"#fff", marginBottom:12,
      }}>
        <span style={{ fontSize:14, fontWeight:600, color:TEXT }}>🔐 E2E Encrypted Messenger</span>
        <span style={{ fontSize:12, color:GREEN, display:"flex", alignItems:"center", gap:5 }}>
          <span style={{ width:7, height:7, borderRadius:"50%", background:GREEN, display:"inline-block" }} />
          Channel secured
        </span>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:10 }}>
        <ChatPanel uid="u1" data={u1} msgs={msgs} inp={inp1} setInp={setInp1} onSend={onSend} busy={busy} />
        <ChatPanel uid="u2" data={u2} msgs={msgs} inp={inp2} setInp={setInp2} onSend={onSend} busy={busy} />
      </div>

      {story ? (
        <>
          <StoryPanel s={story} />
          <HumanizedInspector s={story} />
        </>
      ) : (
        <div style={{
          textAlign:"center", padding:"20px",
          borderRadius:10, border:`1px dashed ${BORDER}`,
          color:MUTED, fontSize:12,
        }}>
          Send a message to see the full encryption process visualised here
        </div>
      )}
    </div>
  );
}

function ChatPanel({ uid, data, msgs, inp, setInp, onSend, busy }) {
  const { color, bg, name } = USER[uid];
  const endRef = useRef(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior:"smooth" }); }, [msgs]);
  const canSend = inp.trim() && !busy;

  return (
    <div style={{ borderRadius:12, border:`1px solid ${BORDER}`, background:"#fff", overflow:"hidden" }}>
      <div style={{
        padding:"10px 12px", borderBottom:`1px solid ${BORDER}`,
        background:bg, display:"flex", alignItems:"center", gap:8,
      }}>
        <div style={{
          width:28, height:28, borderRadius:"50%",
          background:color, color:"#fff",
          fontSize:11, fontWeight:600,
          display:"flex", alignItems:"center", justifyContent:"center",
        }}>
          {USER[uid].init}
        </div>
        <div>
          <div style={{ fontSize:12, fontWeight:600, color:TEXT }}>{name}</div>
          <div style={{ fontSize:9, fontFamily:MONO, color:MUTED }}>{finger(data.pubHex)}</div>
        </div>
        <div style={{ marginLeft:"auto", fontSize:10, color:GREEN, display:"flex", alignItems:"center", gap:4 }}>
          <span style={{ width:5, height:5, borderRadius:"50%", background:GREEN, display:"inline-block" }} />
          encrypted
        </div>
      </div>

      <div style={{ height:230, overflowY:"auto", padding:10, display:"flex", flexDirection:"column", gap:8 }}>
        {msgs.length === 0 && (
          <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", color:MUTED, fontSize:12 }}>
            No messages yet
          </div>
        )}
        {msgs.map(msg => {
          const sent = msg.from === uid;
          return (
            <div key={msg.id} style={{ display:"flex", flexDirection:"column", alignItems:sent?"flex-end":"flex-start" }}>
              <div style={{
                padding:"7px 11px", maxWidth:"85%", fontSize:13,
                borderRadius: sent ? "10px 10px 2px 10px" : "10px 10px 10px 2px",
                background: sent ? color : "#f1f5f9",
                color: sent ? "#fff" : TEXT,
              }}>
                {sent ? msg.text : msg.plain}
              </div>
              <div style={{ fontFamily:MONO, fontSize:9, color:MUTED, marginTop:2 }}>
                🔒 {peek(msg.ctHex, 10)}
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      <div style={{ padding:"8px 10px", borderTop:`1px solid ${BORDER}`, display:"flex", gap:6 }}>
        <input
          value={inp}
          onChange={e => setInp(e.target.value)}
          onKeyDown={e => e.key === "Enter" && !e.shiftKey && onSend(uid)}
          placeholder={`Type as ${name}…`}
          style={{
            flex:1, border:`1px solid ${BORDER}`, borderRadius:6,
            padding:"6px 9px", fontSize:12, outline:"none", fontFamily:SANS,
          }}
        />
        <button
          onClick={() => onSend(uid)}
          disabled={!canSend}
          style={{
            padding:"6px 12px", borderRadius:6, border:"none",
            fontSize:12, fontWeight:600, cursor:canSend?"pointer":"default",
            background: canSend ? color : "#e2e8f0",
            color:       canSend ? "#fff" : MUTED,
            transition:"background .2s",
          }}
        >
          Send
        </button>
      </div>
    </div>
  );
}

function StoryPanel({ s }) {
  const cards = [
    { icon:"✉️", label:"Original message",         desc:"Plain text — readable by anyone",                                                                  val:`"${s.text}"`,   color:"#0369a1", bg:"#e0f2fe" },
    { icon:"🔑", label:"AES-256-GCM encrypts it",  desc:"A unique session key scrambles the message. A random salt makes every encryption different.",         val:peek(s.ctHex),   sub:`Session key: ${peek(s.skHex,8)}  ·  Salt: ${s.saltHex.slice(0,8)}···`, color:"#b45309", bg:"#fef3c7" },
    { icon:"📦", label:"RSA-2048 locks the key",   desc:"Recipient's public key locks the session key. Only their private key can unlock it.",                  val:peek(s.lkHex),   color:PURPLE, bg:"#f5f3ff" },
    { icon:"✅", label:"Recipient decrypts",        desc:"Private key → session key → original message recovered.",                                             val:`"${s.plain}"`,  color:GREEN,  bg:"#ecfdf5" },
  ];

  return (
    <div style={{ borderRadius:12, border:`1px solid ${BORDER}`, background:"#fff", padding:14 }}>
      <div style={{ fontSize:11, fontWeight:700, color:MUTED, marginBottom:12, textTransform:"uppercase", letterSpacing:"0.07em" }}>
        🔍 What just happened — quick overview
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(145px,1fr))", gap:8, marginBottom:12 }}>
        {cards.map((c, i) => (
          <div key={i} style={{ borderRadius:8, padding:11, background:c.bg, border:`1px solid ${c.color}33` }}>
            <div style={{ fontSize:22, marginBottom:7 }}>{c.icon}</div>
            <div style={{ fontSize:11, fontWeight:700, color:c.color, marginBottom:4, lineHeight:1.3 }}>{i+1}. {c.label}</div>
            <div style={{ fontSize:10, color:MUTED, marginBottom:8, lineHeight:1.55 }}>{c.desc}</div>
            <div style={{ fontFamily:MONO, fontSize:10, color:c.color, fontWeight:600, wordBreak:"break-all" }}>{c.val}</div>
            {c.sub && <div style={{ fontFamily:MONO, fontSize:9, color:MUTED, marginTop:4, lineHeight:1.4 }}>{c.sub}</div>}
          </div>
        ))}
      </div>
      <div style={{ fontSize:10, color:MUTED, background:"#f8fafc", borderRadius:6, padding:"6px 10px", fontFamily:MONO }}>
        Algorithm: <strong style={{ color:TEXT }}>RSA-OAEP-2048 + AES-256-GCM</strong>
        &nbsp;·&nbsp;Zero external libraries&nbsp;·&nbsp;Native Web Crypto API
      </div>
    </div>
  );
}

function HumanizedInspector({ s }) {
  const [open, setOpen] = useState(false);

  const steps = [
    { icon:"🎲", title:"A one-time session key is created",     body:`Every single message gets its own freshly-generated secret key called a session key. This 256-bit key is completely random and will never be reused. Think of it like creating a unique combination lock that only exists for one delivery — once used, it's gone forever.`,                                                                                                                                                                                                            tag:`Session key: ${peek(s.skHex)}`,         algo:"AES-256 key generation",                      color:"#b45309", bg:"#fffbeb" },
    { icon:"🧂", title:"A random salt (IV) is added",           body:`A 12-byte random value called an Initialization Vector — or salt — is generated before encryption. Its job: make sure that even if you send the exact same message twice, it encrypts to completely different ciphertext each time. Without the salt, patterns could appear in the encrypted data and leak information.`,                                                                                                                                                                  tag:`Salt: ${s.saltHex.slice(0,16)}···`,     algo:"Cryptographically Secure Random (CSPRNG)",   color:"#0369a1", bg:"#f0f9ff" },
    { icon:"🔒", title:"The message is scrambled by AES-256-GCM", body:`Your message is converted to bytes, then scrambled using the session key and salt through the AES-256-GCM algorithm. The result is completely unreadable gibberish. GCM mode also attaches a 16-byte authentication tag at the end — if anyone tampers with even a single bit of the message in transit, decryption will refuse to work and throw an error.`,                                                                                                                              tag:`"${s.text}"  →  ${peek(s.ctHex)}`,      algo:"AES-256-GCM",                                 color:PURPLE,    bg:"#faf5ff" },
    { icon:"📦", title:"The session key is sealed with RSA-2048", body:`The session key is encrypted using the recipient's RSA-2048 public key. The public key can only lock things — to unlock, you need the recipient's private key, which they never share with anyone, not even the sender. This is how the session key travels safely through any channel — even an untrusted one.`,                                                                                                                                                                     tag:`Locked key: ${peek(s.lkHex)}`,          algo:"RSA-OAEP with SHA-256 padding",               color:TEAL,      bg:"#f0fdfa" },
    { icon:"✅", title:"Recipient unlocks and reads the message", body:`The recipient uses their RSA private key to unseal the session key. With the session key recovered, AES-256-GCM decrypts the ciphertext back to the original message. The authentication tag is automatically verified — confirming the message arrived intact and was not tampered with during delivery.`,                                                                                                                                                                             tag:`Recovered: "${s.plain}"`,               algo:"RSA-OAEP unwrap + AES-256-GCM decrypt",       color:GREEN,     bg:"#ecfdf5" },
  ];

  return (
    <div style={{ borderRadius:12, border:`1px solid ${BORDER}`, background:"#fff", marginTop:10 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width:"100%", padding:"12px 16px",
          display:"flex", alignItems:"center", justifyContent:"space-between",
          background:"none", border:"none", cursor:"pointer",
          borderBottom: open ? `1px solid ${BORDER}` : "none",
        }}
      >
        <span style={{ fontSize:13, fontWeight:600, color:TEXT }}>
          🧠 How did that work? — explained step by step
        </span>
        <span style={{ fontSize:11, color:MUTED, fontWeight:500 }}>
          {open ? "▲ Collapse" : "▼ Expand"}
        </span>
      </button>

      {open && (
        <div style={{ padding:16 }}>
          {steps.map((step, i) => (
            <div key={i} style={{
              display:"flex", gap:14,
              paddingBottom: i < steps.length-1 ? 18 : 0,
              marginBottom:  i < steps.length-1 ? 18 : 0,
              borderBottom:  i < steps.length-1 ? `1px solid ${BORDER}` : "none",
            }}>
              <div style={{ display:"flex", flexDirection:"column", alignItems:"center", flexShrink:0 }}>
                <div style={{
                  width:36, height:36, borderRadius:"50%",
                  background:step.bg, border:`2px solid ${step.color}`,
                  display:"flex", alignItems:"center", justifyContent:"center",
                  fontSize:18,
                }}>
                  {step.icon}
                </div>
                {i < steps.length-1 && (
                  <div style={{ width:2, flex:1, background:BORDER, marginTop:6, minHeight:24 }} />
                )}
              </div>
              <div style={{ flex:1, paddingTop:4 }}>
                <div style={{ fontSize:12, fontWeight:700, color:step.color, marginBottom:6 }}>
                  Step {i+1}: {step.title}
                </div>
                <div style={{ fontSize:12, color:TEXT, lineHeight:1.7, marginBottom:10 }}>
                  {step.body}
                </div>
                <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                  <span style={{ fontFamily:MONO, fontSize:10, color:step.color, background:step.bg, padding:"3px 9px", borderRadius:5, border:`1px solid ${step.color}44` }}>
                    {step.tag}
                  </span>
                  <span style={{ fontFamily:MONO, fontSize:10, color:MUTED, background:"#f8fafc", padding:"3px 9px", borderRadius:5, border:`1px solid ${BORDER}` }}>
                    {step.algo}
                  </span>
                </div>
              </div>
            </div>
          ))}
          <div style={{
            marginTop:16, padding:"10px 14px",
            borderRadius:8, background:"#f8fafc", border:`1px solid ${BORDER}`,
            fontSize:11, color:MUTED, lineHeight:1.6,
          }}>
            <strong style={{ color:TEXT }}>Why both RSA and AES?</strong>&nbsp;
            RSA is secure but slow — it can only encrypt small data. AES is fast but needs
            a shared key. The solution: use AES to encrypt the message (fast), then use RSA
            to safely deliver the AES key (secure). This combination is called a
            <strong style={{ color:TEXT }}> hybrid cryptosystem</strong> — the same approach
            used by WhatsApp, Signal, iMessage, and TLS (HTTPS).
          </div>
        </div>
      )}
    </div>
  );
}
