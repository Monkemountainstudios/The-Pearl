# The Pearl

Early visual prototype for a generative audiovisual browser piece inspired by spreading pigment on paper.

## Current version

This build is intentionally visual-only. It establishes the simulation model before audio is added.

### Implemented

- Eggshell paper / dark frame presentation
- Independent Colour and Water rates
- Rate range from very sparse to extremely active
- Grid-based pigment storage rather than canvas blend-mode layering
- True colour averaging when pigments meet
- Invisible water field
- Water dilutes pigment brightness
- Water transports pigment into neighbouring cells
- Repeated water gradually lifts pigment
- Small per-drop and per-session variation within firm limits
- Occasional stronger/darker colour drops
- Fixed-timestep simulation
- Placeholder Scale control for later audio work

## Planned audio

- Normal vibraphone sample for colour drops
- Reversed vibraphone sample for water drops
- X position mapped to notes in the selected scale
- Y position mapped gently to gain and more strongly to reverb
- Polyphonic playback
- Playback-rate transposition
- Multiple reverb spaces / sends

## Files

- `index.html` — interface
- `style.css` — visual presentation
- `script.js` — simulation engine
- `audio/` — reserved for later audio assets

## Running locally

Open `index.html` in a modern browser. No build step is required.

For GitHub Pages, upload the files to the repository root and enable Pages in the usual way.
