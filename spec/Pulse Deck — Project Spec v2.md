# Pulse Deck — Project Spec v2

Oct 16, 2026 · @Ez

Supersedes `DJ Deck for PS5 Controller — Project Spec.md`.
Second source: `DJ Deck UI – Main screen two decks.html` — a static 1440 × 1180 mockup of the main screen, branded **Pulse Deck**. Its layout, tokens and sample-state logic are decoded below and become the UI contract.

**Why v2 exists:** v1 described what to build. The mockup defined what it looks like. v2 adds the missing middle layer — the state model, derived-value rules and action-bus contract — so the controller mapper, audio engine and UI can be built independently against one source of truth.

**Mockup corrections applied** (mockup was static sample data, not code to copy):
- Hot-cue hints show `L1 + …` on both decks; correct is L1 for Deck A, R1 for Deck B.
- "sample UI" pill in the header is a mockup label; in the app this slot holds live device status.
- Waveform peaks are pseudo-random in the mockup; real app renders decoded PCM peak data.

## 1. Vision and goals

Two-deck DJ app that runs in the browser and is played entirely with a PS5 DualSense: sticks, triggers, touchpad, gyro and haptics are all part of the instrument.

**Goals**

- Play a full set with only the controller, no mouse needed
- Touchpad works as a jog wheel and scratch surface
- Gyro drives effects; triggers act as faders
- The controller answers back: rumble on the beat, lightbar colours, trigger resistance
- Controller-to-sound latency under 30 ms over USB (mockup shows 12 ms live readout)

**Non-goals for v1**

- Streaming-service libraries (Spotify, SoundCloud)
- Recording and broadcasting
- Mobile browsers (WebHID is desktop Chrome/Edge only)
- More than one controller or more than two decks

## 2. Architecture and data flow

1. Input layer: `DualSenseDevice` (WebHID reader/writer) or `GamepadFallback`
2. Controller mapper: raw input → named actions using a JSON profile and layers (shift, mixer)
3. Action bus: typed event stream, e.g. `deckA.play`, `crossfader.set(0.4)`
4. Audio engine: two decks, mixer, effects, master limiter
5. UI store (Zustand): renders decks, waveforms, meters, controller HUD
6. Feedback loop: audio events (beats, track end, clipping) → DualSense output writer

UI is a subscriber of the same bus — every on-screen control also emits bus events (mouse/keyboard parity). The mapper stays separate from the engine so any input device can drive the same actions.

## 3. Tech stack

| Layer | Choice | Why |
| --- | --- | --- |
| UI | React + TypeScript + Vite | Fast dev loop; mockup is React-shaped |
| State | Zustand | Small, fast, readable from audio code |
| Audio | Web Audio API + AudioWorklet | Low latency, custom scratch/playback |
| Controller (full) | WebHID | Only way to reach touchpad, gyro, haptics, adaptive triggers |
| Controller (fallback) | Gamepad API | Sticks, buttons, triggers with zero setup |
| Time-stretch / key lock | SoundTouchJS (or Rubber Band WASM) | Tempo change without pitch shift |
| BPM detection | web-audio-beat-detector, or custom | Start simple, replace if inaccurate |
| Library storage | IndexedDB (Dexie) | Track metadata and beat grids locally |
| Desktop wrapper | Electron (phase 6) | Windows build, same code |

## 4. Feature phases

| Phase | Features |
| --- | --- |
| MVP | Load local files (mp3, wav, flac), play/pause, cue, per-deck volume, 3-band EQ, crossfader, master meter |
| 2 | Gamepad API control: triggers as faders, sticks as filters, button mapping |
| 3 | Waveforms, BPM detection, beat grid, sync, pitch fader, hot cues, loops |
| 4 | WebHID input: touchpad jog/scratch, gyro effects, full mapping layers |
| 5 | Haptics, lightbar, player LEDs, adaptive trigger feedback |
| 6 | Mapping editor, library search, key lock, Electron build, settings |
| Later | Cue/headphone output, recording, more effects, second controller |

Mockup elements land in phases: header pills + deck panels + mixer (M1–M2), waveform/grid/cue tabs/sync/pitch/loop states (M3), jog wheel + touchpad halves + gyro card (M4), lightbar/haptics cards (M5), profile button + library search (M6).

## 5. DualSense control mapping (default profile v1)

Left hand runs Deck A, right hand runs Deck B. Mappings live in JSON so they change without code. Mockup hints confirm this layout.

| Control | Deck A / Deck B action |
| --- | --- |
| L2 / R2 (analog) | Channel volume A / B |
| D-pad down / Cross | Play/pause A / B |
| D-pad left / Circle | Cue A / B |
| D-pad right / Square | Sync A / B |
| D-pad up / Triangle | Loop toggle A / B |
| Left / right stick X | Filter A / B (centre off, left low-pass, right high-pass) |
| Left / right stick Y | Pitch bend (nudge) A / B |
| L1 / R1 (hold) | Shift layer: d-pad and face buttons become hot cues 1–4 (L1→A, R1→B); stick Y sets tempo |
| Create (hold) | Mixer layer: left stick X = crossfader, right stick Y = master volume |
| Touchpad left / right half | Jog wheel A / B: circular motion scratches while touching |
| Touchpad click | Toggle scratch (vinyl) vs nudge mode |
| L3 / R3 (hold) | Enable gyro: pitch tilt = echo amount, roll tilt = reverb or filter sweep |
| Options | Open library; d-pad browses, Cross loads to the deck |
| PS button | Panic: fade out master |

**Feedback outputs**

- Lightbar: Deck A blue, Deck B red, pulses on every beat of the louder deck
- Rumble: short pulse on cue points, stronger pulse on bar downbeats
- Adaptive triggers: stiffer resistance as L2/R2 near full volume, buzz when a track is about to end
- Player LEDs: five-step master level meter

## 6. Design system (decoded from mockup)

### 6.1 Tokens

| Token | Value | Use |
| --- | --- | --- |
| `--bg` | `#0e1014` | App background |
| `--panel` | `#161a21` | Cards, pills |
| `--inset` | `#10141a` | Inset wells (jog, touchpad, search, info cards) |
| `--line` | `#262c36` | Default border / tracks |
| `--line-2` | `#2f3746` | Stronger border, ticks, chips |
| `--text` | `#e8ecf2` | Primary text, fader caps |
| `--muted` | `#8a94a6` | Labels, secondary text |
| `--accent-a` | `#4da3ff` | Deck A everywhere |
| `--accent-b` | `#ff6b57` | Deck B everywhere |
| `--good` | `#3ddc97` | Connected dot, meter green, cue 2 |
| `--meter-amber` | `#ffb347` | Meter mid, cue 1 |
| `--meter-red` | `#ff5a5a` | Meter top |
| `--cue-3` / `--cue-4` | `#b58cff` / `#ff7eb6` | Cue palette 3–4 |
| `--led-off` | `#222833` | Unlit meter segment |
| `--row-sel` / `--row-sel-line` | `#1f2633` / `#3a4660` | Selected library row |
| `--wave-rest` | `#3a4455` | Unplayed waveform |

Fonts: **Chakra Petch** 500/600/700 for display (brand, BPM, buttons, headings); **IBM Plex Mono** 400/500 for everything else. Radii: 12 px cards, 8 px buttons/rows, 999 px pills. Screen targets 1440 × 1180, 16 px gutters.

### 6.2 Layout

- **Header** — brand "PULSE DECK" (Chakra 700, 22 px, 0.14em tracking); right cluster: device pill (green dot + `DualSense · USB · 250 Hz`), latency pill (`Latency 12 ms`), profile button (`Profile: Default v1`).
- **Waveform strip** — one full-width card per deck, stacked.
- **Main row** — flex order: Deck A card (order 0) · Mixer (order 1) · Deck B card (order 2); decks `flex: 1 1 380px`, mixer `flex: 0 1 300px` (center column stays between decks when wrapped rows collapse).
- **Bottom row** — Library (flex 1.4, min 420 px) · Controller HUD (flex 1, min 360 px).

### 6.3 Waveform card

Three SVG paths, viewBox `0 0 1000 80`, stretched to width, height 84 px:

1. `grid` — beat lines, stroke white 16 % opacity, 1 px
2. `rest` — unplayed peaks, `--wave-rest`, 3 px
3. `played` — played peaks, deck accent, 3 px

Playhead: fixed white 2 px line at 50 % of card width (the view scrolls under it, classic CDJ style — mockup draws it centered). Cue tabs hang from the top edge at cue positions (`left: pos%`), 11 px number chips in cue palette colors, radius bottom only. Card header row: `DECK {id} · {title} — {artist}` (deck id in accent) left, `{remain} · {bpm} BPM` right.

### 6.4 Deck card

- **Identity row** — 32 px accent square with deck letter (Chakra 700), title (Chakra 600, 18 px), artist (muted 12 px), key chip (`8A · Am`).
- **Stats row** — `BPM` (Chakra 700, 44 px, accent, one decimal) · `ELAPSED` (20 px, `mm:ss`) · `PITCH` (20 px, `±x.x%`).
- **Jog wheel** — 196 px circle; tick ring (conic 1° tick / 5° gap in `--line-2`); inner inset circle with 2 px accent border; needle (3 × 30 px accent) rotating by `jogRot` degrees; centre stack: `TOUCHPAD` (Chakra 600), `{left|right} half`, mode label (`scratch` | `nudge`).
- **Hot cues** — 2 × 2 grid of 52 px-min buttons. Label (`1 Intro`, `2 Drop`, `3 Break`, `4 Outro`) + hint (`L1 + ↓` for Deck A, `R1 + ✕` for Deck B). Colors per slot: bg = cue color at 15 % alpha, border = 53 % alpha, text = full color. Unset slot renders dimmed.
- **Transport** — 4 equal buttons: `CUE`, `PLAY`, `SYNC`, `LOOP` (label `LOOP 4` while a 4-beat loop is active). Label (Chakra 600, 15 px) + hint = deck glyph (`↓ ← → ↑` for A, `✕ ○ □ △` for B). **On state:** bg = deck accent, text = `--bg`, border = accent. PLAY on when playing; SYNC on when synced; LOOP on when looped; CUE never latched in UI (momentary).
- **Filter** — label row `FILTER · {label}` left, control hint (`left stick X`) right; 8 px track, centre detent tick, 16 px accent thumb at `left: {filter}%`.

### 6.5 Mixer column

- **EQ** — 2-column × 3-row grid (column-major: `A·HI, B·HI, A·MID, B·MID, A·LOW, B·LOW`). 44 px knob, indicator line rotates `-135°…+135°` mapped from gain `-1…+1`, indicator in deck accent, label muted 11 px.
- **Channel faders** — left/right 10 × 160 px tracks with white 38 × 18 px caps (3 px accent underline). Cap position = trigger analog 0–1 (`bottom: {v}%`). Captions `L2 · A` / `R2 · B`.
- **Channel meters** — two 12 px-wide, 14-segment columns flanking the crossfader track. Lit from bottom: `lit = i >= 14 - level`; colors by index (top → bottom): red 0–1, amber 2–4, green 5–13, unlit `--led-off`.
- **Crossfader** — `A — CROSSFADER — B` label row; 10 px track, centre tick, 22 px white square thumb at `left: {crossfader}%`; hint `Create + left stick X`.
- **Master** — divider row: `MASTER` muted left, gain readout (Chakra 600, 20 px, `−3.2 dB`) right.

### 6.6 Library

- Header: `LIBRARY` + control hint `Options opens · D-pad browses · ✕ loads`.
- Search input, 44 px min height, placeholder `Search {total} tracks` (mockup: 1,248).
- Grid columns `28px | 1fr | 56px | 36px | 48px | 64px` = `# · TRACK (title · artist) · BPM · KEY · TIME · tag`.
- Row tag cell: `A` or `B` in deck accent (which deck holds the track), blank when unloaded, or `✕ load` CTA on the selected row.
- Selected row: bg `--row-sel`, border `--row-sel-line`. D-pad moves selection; Cross loads selected track to the browsing deck; Options toggles the drawer.

### 6.7 Controller HUD ("CONTROLLER · LIVE")

340 × 200 px DualSense outline (rounded `70px 70px 90px 90px`). Live layers:

- L2/R2 fill bars (12 × 56 px, from top of each shoulder) = trigger analog, filled in own deck accent
- Touchpad (140 × 64 px, dashed centre divider) with up to two 14 px finger dots mapped from raw X/Y (0–1920 × 0–1080); finger 1 (left half) tinted Deck A, finger 2 (right half) tinted Deck B
- D-pad cluster (left) and face cluster (right): pressed buttons fill their deck accent (A glyphs ← A, B glyphs ← B); idle keys `--line`, glyphs muted
- Stick wells (44 px) with 12 px nubs offset from centre = live stick deflection
- Info cards: **GYRO (hold L3)** — `pitch +12° · roll −4°`, derived `echo 34%`; **LIGHTBAR** — dot in active deck colour, `pulsing on beat`, current BPM; **HAPTICS** — `bar downbeat pulse`, `R2 stiff near max`
- Status line: `● connected` in `--good` when the device is open

### 6.8 Golden sample state (mockup values — use for visual tests)

| Item | Deck A | Deck B |
| --- | --- | --- |
| Accent | `#4da3ff` | `#ff6b57` |
| Track | Selam Drift — Lalibela Echo | Midnight Piassa — Kuru Beats |
| Key / BPM | `8A · Am` / 124.0 | `8A · Am` / 124.0 |
| Elapsed / remain | 02:18 / −01:42 | 00:46 / −03:14 |
| Pitch | +0.0 % | −1.6 % |
| Playing / sync / loop | on / off / off | on / on / on (LOOP 4) |
| Filter | 50 = OFF | 68 = HIGH-PASS 36 % |
| Jog needle / half | +38° / left | −64° / right |
| Glyphs | ↓ ← → ↑ | ✕ ○ □ △ |

Mixer: faders 72 % (L2·A) / 58 % (R2·B); meters 10/14 and 9/14; crossfader 46 %; master −3.2 dB; EQ rotations A·HI +20°, B·HI −25°, A·MID −8°, B·MID +12°, A·LOW +38°, B·LOW −40°.
Library: 6 of 1,248 rows shown; row 03 selected with `✕ load`; rows 01/02 tagged A/B.
Controller: USB · 250 Hz · latency 12 ms; gyro pitch +12° / roll −4° → echo 34 %; lightbar pulsing at 124 BPM; D-pad down (A) and Cross (B) pressed; two fingers on the pad (left = A, right = B).

## 7. Derived-value rules (the logic)

| Display | Rule |
| --- | --- |
| Filter label | `f = 50` → `OFF`. `f < 50` → `LOW-PASS {round((50−f)/50×100)}%`. `f > 50` → `HIGH-PASS {round((f−50)/50×100)}%`. Sample: 68 → `HIGH-PASS 36%`. |
| Filter audio | One biquad morphed per deck: `f→50` bypass; `f→0` low-pass sweeping down; `f→100` high-pass sweeping up. Stick X is centred-spring. |
| Transport style | `on` when its state latch is set (`playing`, `sync`, `loop`); renders accent bg + `--bg` text. CUE is momentary, always `off` style. |
| Meter segments | 14 segments, top index 0: `lit = i >= 14 − level`, colors red (0–1), amber (2–4), green (5–13). Level from analyser RMS, post channel fader. |
| Hot cues | Slot colors fixed palette: `#ffb347, #3ddc97, #b58cff, #ff7eb6`. Default labels `1 Intro … 4 Outro`. Hint always shows the shift combo for its deck. |
| Jog needle | Angle = accumulated touchpad rotation (degrees), no wrap; mode label from touchpad click toggle (scratch/nudge). |
| Waveform played | `played% × trackLength = playhead`; split paths at playhead; grid lines from detected BPM beat grid. |
| Playhead | Fixed at 50 % of the card; the waveform scrolls under it while playing. |
| Remaining time | `−(duration − position)` as `mm:ss`; turns amber under 30 s and triggers trigger-buzz feedback. |
| Pitch readout | From deck tempo (sync target or manual), `±x.x%` one decimal. |
| Elapsed / BPM | From worklet playhead and detected BPM, refreshed per animation frame. |
| Master readout | Master gain in dB, one decimal (`−3.2 dB`). |
| Crossfader | Store value 0–1, thumb linear at `left: v × 100%`, audio uses equal-power curve. |
| Library tag | Loaded → deck letter in that deck's accent; selected row → `✕ load`; else blank. |

## 8. State model and action bus

### 8.1 Zustand store (shape)

```ts
type DeckId = 'A' | 'B';
type Band = 'hi' | 'mid' | 'low';

interface DeckState {
  id: DeckId;
  trackId: string | null;
  title: string; artist: string; key: string;
  bpm: number;            
  elapsedSec: number; durationSec: number;
  playing: boolean; sync: boolean;
  loop: { on: boolean; beats: number };       
  pitchPct: number;                           
  filter: number;                             
  eq: Record<Band, number>;                   
  fader: number;                              
  jog: { touching: boolean; half: 'left' | 'right'; mode: 'scratch' | 'nudge'; rotDeg: number };
  hotCues: Array<{ posSec: number | null; label: string }>;
}

interface MixerState {
  crossfader: number;       
  masterGain: number;       
  meterA: number;           
  meterB: number;           
  meterMaster: number;
}

interface ControllerState {
  connected: boolean;
  transport: 'usb' | 'bt';
  reportHz: number;
  latencyMs: number;
  profile: string;
  gyro: { pitchDeg: number; rollDeg: number; active: boolean };
  touch: { f1: { x: number; y: number; active: boolean };
           f2: { x: number; y: number; active: boolean } };
  lightbar: { color: string; pulsing: boolean };
  haptics: { downbeatPulse: boolean; triggerStiff: boolean };
}

interface LibraryState {
  open: boolean;
  query: string;
  total: number;
  rows: Array<{ id: string; title: string; artist: string; bpm: string; key: string; time: string; deck: DeckId | null }>;
  selectedIndex: number;
}
```

### 8.2 Action bus events

| Domain | Events |
| --- | --- |
| Deck A/B | `deck{A,B}.play`, `.pause`, `.cue`, `.sync`, `.loop.toggle`, `.load(trackId)` |
| Mixer | `deck{A,B}.fader.set(0..1)`, `deck{A,B}.filter.set(0..100)`, `deck{A,B}.eq.set(band, -1..1)`, `deck{A,B}.pitch.set(pct)`, `crossfader.set(0..1)`, `master.set(0..1)` |
| Track tools | `deck{A,B}.hotcue.trigger(1..4)`, `.jog.velocity(v)`, `.jog.mode.toggle` |
| Gyro FX | `deck{A,B}.fx.echo.set(0..1)`, `.fx.reverb.set(0..1)` |
| Library | `library.open`, `.close`, `.select(delta)`, `.search(text)`, `.load` |
| System | `panic`, `profile.select(name)`, `settings.open` |
| Feedback out | `feedback.beat(deck, isBar)`, `feedback.cueshort(deck)`, `feedback.clipping`, `feedback.trackEnding(deck)`, `feedback.meter(level)` |

Rule: the mapper emits nothing but these events; the UI emits the same events on click; the engine subscribes. No component reads raw HID or audio nodes directly.

## 9. Audio engine design

One shared `AudioContext` (`latencyHint: "interactive"`), fixed chain per deck:

1. Track source (decoded `AudioBuffer` in an AudioWorklet; owns the playhead)
2. Trim gain → 3. 3-band EQ (low shelf / mid peaking / high shelf) → 4. Filter biquad (morph per §7) → 5. FX sends (echo, reverb) → 6. Channel fader gain → 7. Crossfader gain (equal-power)

**Master:** sum of decks → limiter (DynamicsCompressor) → analyser (meter + beat feedback) → output.

Key behaviours: `decodeAudioData` once, cache PCM + downsampled peaks; worklet owns position, UI reads it; scratch = touchpad delta → playhead velocity with short ramp smoothing; sync = rate = targetBPM / trackBPM plus phase align to grid; key lock (phase 6) runs stretch in the worklet; context starts on the first user click (Start screen). Channel meters tap post-fader, pre-crossfader; trigger buzz uses `remaining < 30 s`.

## 10. WebHID details

- `navigator.hid.requestDevice`, vendor `0x054C` (Sony); DualSense `0x0CE6`, Edge `0x0DF2`
- Needs HTTPS/localhost, a user click to pair, Chrome or Edge
- Close Steam, DS4Windows, reWASD first (exclusive grabs)
- Start with USB; Bluetooth uses different report IDs and needs a CRC32 on every output report

**Input:** report `0x01` over USB (sticks, L2/R2, buttons, gyro, accel, two touch fingers). Touchpad fingers: active flag + X/Y in ~1920 × 1080; track deltas for jog. Gyro: three signed 16-bit axes, rest offset at startup, low-pass filter. Parse at report rate (~250 Hz), publish only changed values.

**Output:** report `0x02` sets rumble, lightbar RGB, player LEDs, adaptive trigger effects. Max ~60 Hz, only on change.

**Verify before relying on it:** offsets come from community docs + Linux `hid-playstation`. In phase 4, log raw reports to a hex view and confirm each offset on the real controller.

## 11. Milestones

Estimates assume part-time, ~7–10 weeks total. Each milestone ends playable.

1. **M0 Setup (1–2 d):** Vite + React + TS repo, folder structure, design tokens from §6.1, audio start screen
2. **M1 Audio core (1 wk):** two decks, load file, play/pause/cue, volume, EQ, crossfader, master meter; UI shell matching mockup §6.2–6.5 (mouse-driven). Done when you can mix two songs with the mouse
3. **M2 Gamepad control (3–4 d):** Gamepad API reader, JSON profile mapper, triggers as faders, sticks as filters, header/HUD live pills. Done when a basic mix works from the controller
4. **M3 Track tools (1–2 wk):** waveforms + grid + cue tabs, BPM detection, sync, pitch, hot cues, loops
5. **M4 WebHID input (1–2 wk):** connect + parse reports, touchpad jog/scratch, gyro card, shift + mixer layers
6. **M5 Feedback (1 wk):** rumble, lightbar beat pulse, player LED meter, adaptive triggers
7. **M6 Polish (1–2 wk):** mapping editor, library search, key lock, settings, Electron Windows build

## 12. Risks

| Risk | Impact | Fallback |
| --- | --- | --- |
| WebHID Chrome/Edge only | No touchpad/gyro/haptics elsewhere | Gamepad mode; Electron build |
| Bluetooth latency + CRC32 | Laggy scratch, rejected reports | USB for performing; CRC later |
| Report offsets differ from docs | Wrong touchpad/gyro values | Hex logger in M4, verify on device |
| Scratch sound quality | Clicky/aliased audio | Interpolated worklet playback, velocity smoothing |
| Time-stretch CPU | Dropouts with two decks | Worklet; key lock optional |
| Other apps hold the controller | Device won't open | Detect error, tell user to close Steam/DS4Windows |

## 13. Open decisions

- [x] Product name — **Pulse Deck** (from mockup branding)
- [ ] Web-only first, or Electron from day one?
- [ ] Local files only, or folder watcher for the music library? (mockup shows a 1,248-track library — implies folder import)
- [x] Default mapping — kept as §5 (mockup confirms the layout)
- [ ] Repo (GitHub: ezzy1231)
