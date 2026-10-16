# DJ Deck for PS5 Controller — Project Spec

Oct 16, 2026 · @Ez

## Vision and goals

Build a two-deck DJ app that runs in the browser and is played entirely with a PS5 DualSense: sticks, triggers, touchpad, gyro and haptics are all part of the instrument.

**Goals**

- Play a full set with only the controller, no mouse needed
- Touchpad works as a jog wheel and scratch surface
- Gyro drives effects; triggers act as faders
- The controller answers back: rumble on the beat, lightbar colours, trigger resistance
- Controller-to-sound latency under 30 ms over USB

**Non-goals for v1**

- Streaming-service libraries (Spotify, SoundCloud)
- Recording and broadcasting
- Mobile browsers (WebHID is desktop Chrome/Edge only)
- More than one controller or more than two decks

## Tech stack and architecture

A web app first (React + TypeScript + Vite), wrapped in Electron later for a Windows build. Electron also supports WebHID, so no rewrite is needed.

| Layer | Choice | Why |
| --- | --- | --- |
| UI | React + TypeScript + Vite | Your existing skills; fast dev loop |
| State | Zustand | Small, fast, easy to read from audio code |
| Audio | Web Audio API + AudioWorklet | Low latency, custom scratch and playback code |
| Controller (full) | WebHID | Only way to reach touchpad, gyro, haptics, adaptive triggers |
| Controller (fallback) | Gamepad API | Sticks, buttons, triggers with zero setup |
| Time-stretch / key lock | SoundTouchJS (or Rubber Band WASM) | Tempo change without pitch shift |
| BPM detection | web-audio-beat-detector, or custom | Start simple, replace if inaccurate |
| Library storage | IndexedDB (Dexie) | Keeps track metadata and beat grids locally |
| Desktop wrapper | Electron (phase 6) | Windows app, same code |

**Data flow**

1. Input layer: `DualSenseDevice` (WebHID reader/writer) or `GamepadFallback`
2. Controller mapper: turns raw input into named actions using a JSON profile and layers (shift, mixer)
3. Action bus: a typed event stream such as `deckA.play`, `crossfader.set(0.4)`
4. Audio engine: two decks, mixer, effects, master limiter
5. UI store: renders state (waveforms, meters, controller HUD)
6. Feedback loop: audio events (beats, track end, clipping) go back to the DualSense output writer

Keep the mapper separate from the audio engine so the mouse, keyboard or another controller can drive the same actions later.

## Features by phase

MVP is two decks you can mix with the controller. Everything after that adds depth.

| Phase | Features |
| --- | --- |
| MVP | Load local files (mp3, wav, flac), play/pause, cue, per-deck volume, 3-band EQ, crossfader, master meter |
| 2 | Gamepad API control: triggers as faders, sticks as filters, button mapping |
| 3 | Waveforms, BPM detection, beat grid, sync, pitch fader, hot cues, loops |
| 4 | WebHID input: touchpad jog/scratch, gyro effects, full mapping layers |
| 5 | Haptics, lightbar, player LEDs, adaptive trigger feedback |
| 6 | Mapping editor, library search, key lock, Electron build, settings |
| Later | Cue/headphone output, recording, more effects, second controller |

## DualSense control mapping

Default profile v1: left hand runs Deck A, right hand runs Deck B. Mappings live in a JSON profile so you can change them without touching code.

| Control | Deck A / Deck B action |
| --- | --- |
| L2 / R2 (analog) | Channel volume A / B |
| D-pad down / Cross | Play/pause A / B |
| D-pad left / Circle | Cue A / B |
| D-pad right / Square | Sync A / B |
| D-pad up / Triangle | Loop toggle A / B |
| Left / right stick X | Filter A / B (centre off, left low-pass, right high-pass) |
| Left / right stick Y | Pitch bend (nudge) A / B |
| L1 / R1 (hold) | Shift layer: d-pad and face buttons become hot cues 1–4; stick Y sets tempo |
| Create (hold) | Mixer layer: left stick X = crossfader, right stick Y = master volume |
| Touchpad left / right half | Jog wheel A / B: circular motion scratches while touching |
| Touchpad click | Toggle scratch (vinyl) mode vs nudge mode |
| L3 / R3 (hold) | Enable gyro: pitch tilt = echo amount, roll tilt = reverb or filter sweep |
| Options | Open library; d-pad browses, Cross loads to the deck |
| PS button | Panic: fade out master |

**Feedback outputs**

- Lightbar: Deck A blue, Deck B red, pulses on every beat of the louder deck
- Rumble: short pulse on cue points, stronger pulse on bar downbeats
- Adaptive triggers: stiffer resistance as L2/R2 near full volume, buzz when a track is about to end
- Player LEDs: five-step master level meter

## Audio engine design

One shared `AudioContext` (`latencyHint: "interactive"`) with a fixed signal chain per deck.

**Per-deck chain**

1. Track source (decoded `AudioBuffer`, played by an AudioWorklet so rate and position can change instantly)
2. Trim gain
3. 3-band EQ: low shelf, mid peaking, high shelf (BiquadFilterNodes)
4. Filter: one biquad that morphs between low-pass and high-pass
5. Effects send: echo, reverb
6. Channel fader gain
7. Crossfader gain (equal-power curve)

**Master chain:** sum of both decks, then a limiter (DynamicsCompressor), then an analyser for the meter, then the output.

**Key behaviours**

- Decoding: `decodeAudioData` on load, then cache the PCM and a downsampled waveform
- Position: the worklet owns the playhead, so the UI reads it instead of guessing
- Scratch: touchpad movement sets playhead velocity directly; smooth it with a short ramp to avoid clicks
- Sync: set playback rate to target BPM divided by track BPM; phase-align to the beat grid
- Key lock (phase 6): run time-stretch in the worklet so tempo changes keep pitch
- Autoplay rule: the context starts on the first user click, so show a "Start" screen

## WebHID details

The browser Gamepad API hides the touchpad, gyro, haptics and adaptive triggers, so these come from raw HID reports.

**Connecting**

- `navigator.hid.requestDevice` with vendor ID `0x054C` (Sony); DualSense product ID `0x0CE6`, DualSense Edge `0x0DF2`
- Needs HTTPS or localhost, a user click to pair, and Chrome or Edge
- Close Steam, DS4Windows and reWASD first, since they grab the device exclusively
- Start with USB; Bluetooth uses different report IDs and requires a CRC32 checksum on every output report

**Input (controller to app)**

- Report `0x01` over USB carries sticks, L2/R2, buttons, gyro, accelerometer and two touchpad fingers
- Touchpad: each finger has an active flag and X/Y in a \~1920 × 1080 range; track deltas between reports for jog motion
- Gyro: three signed 16-bit axes; subtract a rest offset at startup, then low-pass filter
- Run the parser at the report rate (about 250 Hz over USB) and publish only changed values

**Output (app to controller)**

- Report `0x02` over USB sets rumble motors, lightbar RGB, player LEDs and the adaptive trigger effect for each of L2/R2
- Send at most about 60 times per second and only when a value changes

**Verify before relying on it:** byte offsets come from community docs and the Linux `hid-playstation` driver. In phase 4, log raw reports to a hex view and confirm each offset on your own controller.

## UI layout

Dark, high-contrast screen built for a quick glance while your hands stay on the controller.

- **Top:** two stacked waveforms (zoomed view plus full-track overview) per deck, with beat grid and cue markers
- **Left and right panels:** Deck A (blue) and Deck B (red): title, BPM, time remaining, pitch, loop and hot cue state
- **Centre:** mixer with EQ knobs, channel faders, filter position, crossfader, master meter
- **Bottom drawer:** library list with search, opened with Options and browsed with the d-pad
- **Corner HUD:** live DualSense diagram that lights up pressed buttons, shows touchpad fingers and gyro tilt
- **Settings:** controller pairing, profile picker, mapping editor, latency test

Every on-screen control also works with mouse and keyboard, so you can test without the controller.

## Build plan and milestones

Estimates assume part-time work, so about 7–10 weeks to the full version. Each milestone ends with something playable.

1. **M0 Setup (1–2 days):** Vite + React + TypeScript repo, folder structure, audio context start screen
2. **M1 Audio core (1 week):** two decks, load file, play/pause/cue, volume, EQ, crossfader, master meter. Done when you can mix two songs with the mouse
3. **M2 Gamepad control (3–4 days):** Gamepad API reader, mapper with JSON profile, triggers as faders, sticks as filters. Done when a basic mix works from the controller
4. **M3 Track tools (1–2 weeks):** waveforms, BPM detection, beat grid, sync, pitch fader, hot cues, loops
5. **M4 WebHID input (1–2 weeks):** connect and parse reports, touchpad jog and scratch, gyro effects, shift and mixer layers
6. **M5 Feedback (1 week):** rumble, lightbar beat pulse, player LED meter, adaptive triggers
7. **M6 Polish (1–2 weeks):** mapping editor, library search, key lock, settings, Electron Windows build

**First task today:** create the repo and build M0 and the first half of M1 (one deck playing a file).

## Risks and open decisions

| Risk | Impact | Fallback |
| --- | --- | --- |
| WebHID works only in Chrome/Edge | Other browsers can't use touchpad, gyro, haptics | Gamepad API mode with reduced features; Electron build |
| Bluetooth latency and CRC32 requirement | Laggy scratching, rejected output reports | Recommend USB cable for performing; add CRC later |
| Report byte offsets differ from docs | Wrong touchpad or gyro values | Hex logger in phase 4, verify on your controller |
| Scratch sound quality | Clicky or aliased audio | Interpolated playback in the worklet; velocity smoothing |
| Time-stretch CPU load | Audio dropouts with two decks | Run in worklet, make key lock optional |
| Other apps hold the controller | Device won't open | Detect the error and tell the user to close Steam/DS4Windows |

**Open decisions for you**

- [ ] Web-only first, or set up Electron from day one?
- [ ] Local files only, or add a folder watcher for your music library?
- [ ] Keep the default mapping above, or change the layout?
- [ ] Project name and repo (GitHub: ezzy1231)
