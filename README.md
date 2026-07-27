# Transcript

Windows application for automatically transcribing audio recordings (meetings, voice memos, etc.) into text, entirely offline and without sending any data over the internet.

Built with Electron + TypeScript, it uses [whisper.cpp](https://github.com/ggml-org/whisper.cpp) as the speech recognition engine and [FFmpeg](https://ffmpeg.org/) for audio conversion.

## Features

- Simple drag-and-drop interface for `.m4a` files (also supports `.mp3`, `.wav`, `.ogg`, and `.flac`)
- 100% offline transcription (no data is sent online)
- Model selection (small / medium / large) to balance speed and accuracy
- "Custom vocabulary" field to bias the model (useful for medical, technical, or domain-specific terminology)
- Export transcripts as text files
- French language by default

## Build Requirements

- [Node.js 22 LTS](https://nodejs.org/) or later
- Windows 10 / 11

## Installation

```powershell
git clone https://github.com/NearTheEden/Transcript.git
cd Transcript
npm install
```

### Download External Resources

These files are not included in the repository (they are too large and/or cannot be redistributed). They must be downloaded and placed manually:

1. **FFmpeg** — Download the Essentials release from [gyan.dev](https://www.gyan.dev/ffmpeg/builds/), extract it, and copy `ffmpeg.exe` to `resources/ffmpeg/`.

2. **whisper.cpp** — Download the latest Windows x64 release from [github.com/ggml-org/whisper.cpp/releases](https://github.com/ggml-org/whisper.cpp/releases), extract all files into `resources/whisper/` (keep all DLL files).

3. **Models** — Download one or more models from [huggingface.co/ggerganov/whisper.cpp](https://huggingface.co/ggerganov/whisper.cpp/tree/main) and place them in `resources/models/`. Recommended: `ggml-medium-q5_0.bin`.

Expected directory structure:

```
resources/
├── ffmpeg/
│   └── ffmpeg.exe
├── whisper/
│   ├── whisper-cli.exe
│   └── *.dll
└── models/
    └── ggml-medium-q5_0.bin
```

## Usage

**Development mode**:

```powershell
npm start
```

**Build a Windows installer**:

```powershell
npm run dist
```

The `.exe` installer will be generated in the `release/` directory.

## License

MIT