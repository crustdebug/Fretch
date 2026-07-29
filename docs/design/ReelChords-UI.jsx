import { useState } from "react";

const COLORS = {
  bgDeep: "#0a1a18",
  bgMid: "#123430",
  teal500: "#1f6b63",
  teal400: "#2f8a80",
  amber: "#f0a94e",
  amberDark: "#c97f2c",
  paper: "#f4efe2",
  paperDim: "#e8e0cd",
  ink: "#16241f",
  inkSoft: "#425049",
  cream: "#f5f1e6",
  creamSoft: "rgba(245,241,230,0.62)",
  terracotta: "#c97b5a",
  successGreen: "#6fae8e",
};

function StringLines({ color = "rgba(245,241,230,0.12)", count = 6, style = {} }) {
  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", ...style }}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: `${(i + 1) * (100 / (count + 1))}%`,
            height: 1,
            background: color,
          }}
        />
      ))}
    </div>
  );
}

function StatusBar({ dark }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "14px 24px 4px",
        fontSize: 13,
        fontWeight: 600,
        color: dark ? COLORS.cream : COLORS.ink,
        fontFamily: "Inter, sans-serif",
      }}
    >
      <span>9:41</span>
      <span style={{ display: "flex", gap: 5, alignItems: "center" }}>
        <span>●●●●</span>
        <span>100%</span>
      </span>
    </div>
  );
}

function PillButton({ children, onClick, disabled, variant = "solid", style = {} }) {
  const base = {
    border: "none",
    borderRadius: 999,
    padding: "15px 24px",
    fontFamily: "Inter, sans-serif",
    fontSize: 16,
    fontWeight: 600,
    cursor: disabled ? "not-allowed" : "pointer",
    width: "100%",
    transition: "opacity .15s ease, transform .1s ease",
  };
  const variants = {
    solid: {
      background: disabled ? "rgba(10,22,20,0.35)" : COLORS.ink,
      color: COLORS.cream,
    },
    amber: {
      background: COLORS.amber,
      color: "#2b1a04",
    },
    ghost: {
      background: "transparent",
      color: COLORS.cream,
      border: "1px solid rgba(245,241,230,0.35)",
    },
    ghostDark: {
      background: "transparent",
      color: COLORS.ink,
      border: "1px solid rgba(22,36,31,0.25)",
    },
  };
  return (
    <button
      onClick={disabled ? undefined : onClick}
      style={{ ...base, ...variants[variant], ...style, opacity: disabled ? 0.7 : 1 }}
    >
      {children}
    </button>
  );
}

function Chip({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        border: "none",
        borderRadius: 999,
        padding: "7px 13px",
        fontFamily: "Inter, sans-serif",
        fontSize: 12,
        fontWeight: 600,
        cursor: "pointer",
        background: active ? COLORS.ink : "#e9e4d6",
        color: active ? COLORS.cream : COLORS.inkSoft,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </button>
  );
}

function BottomNav({ active }) {
  const items = [
    { id: "home", icon: "⌂", label: "Home" },
    { id: "songbook", icon: "♫", label: "Songbook" },
  ];
  return (
    <div
      style={{
        display: "flex",
        gap: 10,
        padding: "10px 16px",
        background: "rgba(10,22,20,0.9)",
        borderRadius: 999,
        margin: "0 16px 16px",
      }}
    >
      {items.map((it) => (
        <div
          key={it.id}
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            padding: "10px 14px",
            borderRadius: 999,
            background: active === it.id ? COLORS.amber : "transparent",
            color: active === it.id ? "#2b1a04" : COLORS.creamSoft,
            fontFamily: "Inter, sans-serif",
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          <span style={{ fontSize: 15 }}>{it.icon}</span>
          {active === it.id && <span>{it.label}</span>}
        </div>
      ))}
    </div>
  );
}

/* ---------------- HOME ---------------- */

function HomeScreen() {
  const [state, setState] = useState("empty");
  return (
    <div style={{ position: "relative", height: "100%", display: "flex", flexDirection: "column", background: `linear-gradient(180deg, ${COLORS.teal400} 0%, ${COLORS.bgMid} 46%, ${COLORS.bgDeep} 100%)`, overflow: "hidden" }}>
      <StringLines style={{ top: 0, height: 260 }} />
      <StatusBar dark />

      <div style={{ padding: "8px 24px 0" }}>
        <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4 }}>
          {["Empty", "Video loaded", "YouTube link", "Instagram link", "Unknown link", "Share failed"].map((l, i) => {
            const key = ["empty", "video", "link", "instagram", "unknown", "shareFailed"][i];
            return <Chip key={key} label={l} active={state === key} onClick={() => setState(key)} />;
          })}
        </div>
      </div>

      <div style={{ padding: "22px 24px 4px" }}>
        <div style={{ fontFamily: "Inter, sans-serif", fontSize: 13, fontWeight: 600, letterSpacing: 0.3, color: COLORS.amber, marginBottom: 4 }}>
          REELCHORDS
        </div>
        <div style={{ fontFamily: "Inter, sans-serif", fontSize: 22, fontWeight: 600, color: COLORS.cream, lineHeight: 1.3 }}>
          Turn any guitar reel into a chord sheet.
        </div>
      </div>

      <div style={{ flex: 1, padding: "18px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
        {state === "empty" && (
          <div
            style={{
              border: "1.5px dashed rgba(245,241,230,0.35)",
              borderRadius: 20,
              padding: "34px 18px",
              textAlign: "center",
              fontFamily: "Inter, sans-serif",
            }}
          >
            <div style={{ fontSize: 30, marginBottom: 10 }}>♪</div>
            <div style={{ color: COLORS.cream, fontWeight: 600, fontSize: 15 }}>Choose a video</div>
            <div style={{ color: COLORS.creamSoft, fontSize: 13, marginTop: 4 }}>or share one here from another app</div>
          </div>
        )}

        {state === "video" && (
          <div style={{ background: "rgba(245,241,230,0.08)", borderRadius: 20, padding: 14, display: "flex", gap: 12, alignItems: "center" }}>
            <div style={{ width: 56, height: 56, borderRadius: 14, background: COLORS.ink, display: "flex", alignItems: "center", justifyContent: "center", color: COLORS.amber, fontSize: 18 }}>▶</div>
            <div style={{ fontFamily: "Inter, sans-serif" }}>
              <div style={{ color: COLORS.cream, fontWeight: 600, fontSize: 14 }}>fingerstyle_cover.mp4</div>
              <div style={{ color: COLORS.creamSoft, fontSize: 12, marginTop: 2 }}>18.4 MB · ready</div>
            </div>
          </div>
        )}

        {state === "link" && (
          <div style={{ background: "rgba(111,174,142,0.14)", border: "1px solid rgba(111,174,142,0.4)", borderRadius: 16, padding: 14, fontFamily: "Inter, sans-serif" }}>
            <div style={{ color: COLORS.successGreen, fontWeight: 600, fontSize: 13 }}>✓ YouTube Shorts link recognized</div>
            <div style={{ color: COLORS.creamSoft, fontSize: 12, marginTop: 3 }}>youtube.com/shorts/8fQ2n…</div>
          </div>
        )}

        {state === "instagram" && (
          <div style={{ background: "rgba(240,169,78,0.12)", border: "1px solid rgba(240,169,78,0.45)", borderRadius: 16, padding: 16, fontFamily: "Inter, sans-serif" }}>
            <div style={{ color: COLORS.amber, fontWeight: 600, fontSize: 13, marginBottom: 6 }}>instagram.com/reel/DAhK…</div>
            <div style={{ color: COLORS.cream, fontSize: 13, lineHeight: 1.5, marginBottom: 8 }}>
              Instagram links can't be fetched directly.
            </div>
            <div style={{ color: COLORS.creamSoft, fontSize: 12.5, lineHeight: 1.5 }}>
              Open the reel, tap Share, then choose ReelChords to send the video itself.
            </div>
          </div>
        )}

        {state === "unknown" && (
          <div style={{ background: "rgba(245,241,230,0.08)", border: "1px solid rgba(245,241,230,0.25)", borderRadius: 16, padding: 14, fontFamily: "Inter, sans-serif" }}>
            <div style={{ color: COLORS.cream, fontWeight: 600, fontSize: 13 }}>This link isn't supported yet</div>
            <div style={{ color: COLORS.creamSoft, fontSize: 12, marginTop: 3 }}>Try a YouTube Shorts link, or share the video file directly.</div>
          </div>
        )}

        {state === "shareFailed" && (
          <div style={{ background: "rgba(201,123,90,0.14)", border: "1px solid rgba(201,123,90,0.4)", borderRadius: 16, padding: 14, fontFamily: "Inter, sans-serif" }}>
            <div style={{ color: "#e8a385", fontWeight: 600, fontSize: 13 }}>That share didn't come through</div>
            <div style={{ color: COLORS.creamSoft, fontSize: 12, marginTop: 3 }}>Try sharing the video to ReelChords again.</div>
          </div>
        )}

        <div style={{ position: "relative", textAlign: "center", margin: "2px 0" }}>
          <span style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: COLORS.creamSoft }}>or paste a YouTube Shorts link</span>
        </div>
        <div
          style={{
            background: "rgba(245,241,230,0.08)",
            border: "1px solid rgba(245,241,230,0.2)",
            borderRadius: 14,
            padding: "13px 16px",
            fontFamily: "Inter, sans-serif",
            fontSize: 13,
            color: COLORS.creamSoft,
          }}
        >
          youtube.com/shorts/...
        </div>
      </div>

      <div style={{ padding: "4px 24px 18px" }}>
        <PillButton variant="amber" disabled={state === "empty" || state === "unknown" || state === "shareFailed"}>
          Get the chords
        </PillButton>
      </div>
      <BottomNav active="home" />
    </div>
  );
}

/* ---------------- PROCESSING ---------------- */

function EqualizerBars({ n = 5 }) {
  return (
    <div style={{ display: "flex", gap: 4, alignItems: "flex-end", height: 22 }}>
      {Array.from({ length: n }).map((_, i) => (
        <div
          key={i}
          style={{
            width: 4,
            borderRadius: 2,
            background: COLORS.amber,
            height: 6 + ((i * 7) % 16),
            animation: `eq 1s ease-in-out ${i * 0.12}s infinite alternate`,
          }}
        />
      ))}
    </div>
  );
}

function ProcessingScreen() {
  const [state, setState] = useState("running");
  const stages = [
    "Reading video",
    "Sampling frames",
    "Reading on-screen chords",
    "Filtering with chord grammar",
    "Identifying the song",
    "Fetching lyrics",
    "Assembling your sheet",
  ];
  const activeIndex = 2;

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: COLORS.bgDeep }}>
      <StatusBar dark />
      <div style={{ padding: "8px 24px 0" }}>
        <div style={{ display: "flex", gap: 6 }}>
          {["Running", "Song found early", "Couldn't read it"].map((l, i) => {
            const key = ["running", "songFound", "failed"][i];
            return <Chip key={key} label={l} active={state === key} onClick={() => setState(key)} />;
          })}
        </div>
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 28px" }}>
        {state !== "failed" ? (
          <>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 26 }}>
              <EqualizerBars />
            </div>

            {state === "songFound" && (
              <div style={{ background: "rgba(240,169,78,0.1)", border: "1px solid rgba(240,169,78,0.35)", borderRadius: 16, padding: "14px 16px", marginBottom: 22, fontFamily: "Inter, sans-serif" }}>
                <div style={{ color: COLORS.amber, fontSize: 11, fontWeight: 700, letterSpacing: 0.4, marginBottom: 3 }}>♪ SONG IDENTIFIED</div>
                <div style={{ color: COLORS.cream, fontSize: 15, fontWeight: 600 }}>Low Tide Fingerpicking</div>
                <div style={{ color: COLORS.creamSoft, fontSize: 12.5, marginTop: 1 }}>Marin & the Coast</div>
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
              {stages.map((s, i) => {
                const done = i < activeIndex || (state === "songFound" && i <= 4);
                const active = state === "songFound" ? i === 5 : i === activeIndex;
                return (
                  <div key={s} style={{ display: "flex", alignItems: "center", gap: 12, fontFamily: "Inter, sans-serif" }}>
                    <div
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: "50%",
                        flexShrink: 0,
                        border: `1.5px solid ${done ? COLORS.successGreen : active ? COLORS.amber : "rgba(245,241,230,0.25)"}`,
                        background: done ? COLORS.successGreen : "transparent",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 10,
                        color: COLORS.bgDeep,
                      }}
                    >
                      {done ? "✓" : ""}
                    </div>
                    <div style={{ fontSize: 14, color: done ? COLORS.creamSoft : active ? COLORS.cream : "rgba(245,241,230,0.35)", fontWeight: active ? 600 : 400 }}>
                      {s}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <div style={{ textAlign: "center", fontFamily: "Inter, sans-serif" }}>
            <div style={{ fontSize: 34, marginBottom: 14, color: COLORS.terracotta }}>◐</div>
            <div style={{ color: COLORS.cream, fontSize: 17, fontWeight: 600, marginBottom: 8 }}>Couldn't read this one</div>
            <div style={{ color: COLORS.creamSoft, fontSize: 13.5, lineHeight: 1.6, marginBottom: 24 }}>
              No chord text showed up on screen for this video. Try a tutorial where the chords are written on the video itself.
            </div>
            <PillButton variant="amber">Try another video</PillButton>
            <div style={{ marginTop: 12 }}>
              <PillButton variant="ghost">What works best?</PillButton>
            </div>
          </div>
        )}
      </div>

      {state !== "failed" && (
        <div style={{ padding: "0 24px 26px", textAlign: "center" }}>
          <button style={{ background: "none", border: "none", color: COLORS.creamSoft, fontFamily: "Inter, sans-serif", fontSize: 13, cursor: "pointer" }}>
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

/* ---------------- SHEET ---------------- */

function ChordLine({ pairs }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", marginBottom: 20 }}>
      {pairs.map(([chord, word], i) => (
        <div key={i} style={{ display: "flex", flexDirection: "column", marginRight: word ? 14 : 22 }}>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: 14, color: COLORS.amberDark, minHeight: 18 }}>
            {chord || "\u00A0"}
          </div>
          <div style={{ fontFamily: "Inter, sans-serif", fontSize: 16, color: COLORS.ink }}>{word}</div>
        </div>
      ))}
    </div>
  );
}

function SheetScreen() {
  const [state, setState] = useState("full");
  const [saved, setSaved] = useState(false);
  const [key, setKey] = useState(0);
  const keys = ["G", "G#", "A", "A#", "B", "C", "C#", "D", "D#", "E", "F", "F#"];

  const lines = [
    [["G", "Well"], ["", "you"], ["C", "know"], ["", "it's"], ["G", "gon-"], ["", "na"]],
    [["", "be"], ["C", "al-"], ["", "right,"], ["G", "on-"], ["D", "ly"], ["G", "you"]],
    [["G", "and"], ["", "the"], ["C", "sum-"], ["D", "mer"], ["", "light"]],
  ];

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: COLORS.paper }}>
      <StatusBar />
      <div style={{ padding: "8px 24px 0" }}>
        <div style={{ display: "flex", gap: 6 }}>
          <Chip label="Full result" active={state === "full"} onClick={() => setState("full")} />
          <Chip label="Chords only" active={state === "chordsOnly"} onClick={() => setState("chordsOnly")} />
        </div>
      </div>

      <div style={{ padding: "18px 24px 10px", borderBottom: `1px solid ${COLORS.paperDim}` }}>
        {state === "full" ? (
          <>
            <div style={{ fontFamily: "Inter, sans-serif", fontWeight: 700, fontSize: 19, color: COLORS.ink }}>Low Tide Fingerpicking</div>
            <div style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: COLORS.inkSoft, marginTop: 2 }}>Marin & the Coast · 92% match</div>
          </>
        ) : (
          <>
            <div style={{ fontFamily: "Inter, sans-serif", fontWeight: 700, fontSize: 17, color: COLORS.inkSoft }}>Song not identified</div>
            <div style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: COLORS.inkSoft, marginTop: 2 }}>The chords came through — add a title yourself</div>
          </>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 24px" }}>
        <span style={{ fontFamily: "Inter, sans-serif", fontSize: 12, fontWeight: 600, color: COLORS.inkSoft, textTransform: "uppercase", letterSpacing: 0.4 }}>Transpose</span>
        <div style={{ display: "flex", alignItems: "center", gap: 14, background: "#fff", borderRadius: 999, padding: "6px 8px", border: `1px solid ${COLORS.paperDim}` }}>
          <button onClick={() => setKey((k) => (k - 1 + 12) % 12)} style={{ border: "none", background: "none", fontSize: 16, width: 26, height: 26, borderRadius: "50%", cursor: "pointer", color: COLORS.ink }}>−</button>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, minWidth: 22, textAlign: "center", color: COLORS.amberDark }}>{keys[key]}</span>
          <button onClick={() => setKey((k) => (k + 1) % 12)} style={{ border: "none", background: "none", fontSize: 16, width: 26, height: 26, borderRadius: "50%", cursor: "pointer", color: COLORS.ink }}>+</button>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "8px 24px" }}>
        {state === "full" ? (
          lines.map((l, i) => <ChordLine key={i} pairs={l} />)
        ) : (
          <div style={{ fontFamily: "'JetBrains Mono', monospace", color: COLORS.amberDark, fontSize: 15, lineHeight: 2.1, fontWeight: 700 }}>
            Em&nbsp;&nbsp;&nbsp;D6-9/F#&nbsp;&nbsp;&nbsp;Em&nbsp;&nbsp;&nbsp;D6-9/F#<br />
            C&nbsp;&nbsp;&nbsp;G&nbsp;&nbsp;&nbsp;D&nbsp;&nbsp;&nbsp;Em
          </div>
        )}
      </div>

      <div style={{ padding: "12px 24px 20px", display: "flex", gap: 10, borderTop: `1px solid ${COLORS.paperDim}` }}>
        <PillButton variant="ghostDark" style={{ flex: 1 }}>Copy ChordPro</PillButton>
        <PillButton variant={saved ? "ghostDark" : "solid"} style={{ flex: 1 }} onClick={() => setSaved(true)}>
          {saved ? "Saved ✓" : "Save to songbook"}
        </PillButton>
      </div>
    </div>
  );
}

/* ---------------- SONGBOOK ---------------- */

function SongbookScreen() {
  const [state, setState] = useState("populated");
  const [items, setItems] = useState([
    { title: "Low Tide Fingerpicking", artist: "Marin & the Coast", date: "Jul 27", key: "G" },
    { title: "Porchlight", artist: "Denny Osei", date: "Jul 24", key: "C" },
    { title: "Second Cup", artist: "Unknown artist", date: "Jul 19", key: "Em" },
  ]);

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: COLORS.paper }}>
      <StatusBar />
      <div style={{ padding: "8px 24px 0" }}>
        <div style={{ display: "flex", gap: 6 }}>
          <Chip label="Populated" active={state === "populated"} onClick={() => setState("populated")} />
          <Chip label="Empty" active={state === "empty"} onClick={() => setState("empty")} />
        </div>
      </div>

      <div style={{ padding: "20px 24px 10px" }}>
        <div style={{ fontFamily: "Inter, sans-serif", fontWeight: 700, fontSize: 22, color: COLORS.ink }}>Songbook</div>
      </div>

      {state === "populated" ? (
        <div style={{ flex: 1, overflowY: "auto", padding: "6px 24px" }}>
          {items.map((it, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                background: "#fff",
                border: `1px solid ${COLORS.paperDim}`,
                borderRadius: 16,
                padding: "13px 14px",
                marginBottom: 10,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 12,
                    background: COLORS.bgDeep,
                    color: COLORS.amber,
                    fontFamily: "'JetBrains Mono', monospace",
                    fontWeight: 700,
                    fontSize: 13,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {it.key}
                </div>
                <div style={{ fontFamily: "Inter, sans-serif" }}>
                  <div style={{ fontWeight: 600, fontSize: 14.5, color: COLORS.ink }}>{it.title}</div>
                  <div style={{ fontSize: 12.5, color: COLORS.inkSoft, marginTop: 1 }}>{it.artist} · {it.date}</div>
                </div>
              </div>
              <button
                onClick={() => setItems((prev) => prev.filter((_, idx) => idx !== i))}
                style={{ border: "none", background: "none", fontSize: 16, color: COLORS.inkSoft, cursor: "pointer", padding: 6 }}
                aria-label="Remove"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 40px", textAlign: "center" }}>
          <div style={{ fontSize: 30, marginBottom: 12, color: COLORS.amberDark }}>♫</div>
          <div style={{ fontFamily: "Inter, sans-serif", fontWeight: 600, fontSize: 16, color: COLORS.ink, marginBottom: 6 }}>Nothing saved yet</div>
          <div style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: COLORS.inkSoft, marginBottom: 20, lineHeight: 1.5 }}>
            Process a tutorial and hit save — this is where every chord sheet lives.
          </div>
          <PillButton variant="solid">Add your first tutorial</PillButton>
        </div>
      )}
      <div style={{ background: COLORS.bgDeep }}>
        <BottomNav active="songbook" />
      </div>
    </div>
  );
}

/* ---------------- APP SHELL ---------------- */

export default function ReelChordsUI() {
  const [screen, setScreen] = useState("home");
  const screens = {
    home: <HomeScreen />,
    processing: <ProcessingScreen />,
    sheet: <SheetScreen />,
    songbook: <SongbookScreen />,
  };
  const labels = { home: "01 · Home", processing: "02 · Processing", sheet: "03 · Sheet", songbook: "04 · Songbook" };

  return (
    <div style={{ minHeight: "100vh", background: "#e5e1d4", display: "flex", flexDirection: "column", alignItems: "center", padding: "32px 16px", fontFamily: "Inter, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=JetBrains+Mono:wght@400;700&display=swap');
        @keyframes eq { from { height: 6px; } to { height: 22px; } }
      `}</style>

      <div style={{ display: "flex", gap: 8, marginBottom: 24, flexWrap: "wrap", justifyContent: "center" }}>
        {Object.keys(screens).map((k) => (
          <button
            key={k}
            onClick={() => setScreen(k)}
            style={{
              border: "none",
              borderRadius: 999,
              padding: "9px 16px",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              background: screen === k ? COLORS.bgDeep : "#fff",
              color: screen === k ? COLORS.amber : COLORS.inkSoft,
              boxShadow: "0 1px 2px rgba(0,0,0,0.08)",
            }}
          >
            {labels[k]}
          </button>
        ))}
      </div>

      <div
        style={{
          width: 390,
          height: 844,
          maxWidth: "100%",
          borderRadius: 44,
          overflow: "hidden",
          boxShadow: "0 30px 60px rgba(10,22,20,0.25), 0 8px 20px rgba(10,22,20,0.15)",
          border: "8px solid #0a1615",
          position: "relative",
        }}
      >
        {screens[screen]}
      </div>
    </div>
  );
}
