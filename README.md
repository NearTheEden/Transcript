# Transcript

Application Windows pour transcrire automatiquement des enregistrements audio (réunions, mémos, etc.) en texte, en local et sans envoyer les données sur internet.

Construite avec Electron + TypeScript, utilise [whisper.cpp](https://github.com/ggml-org/whisper.cpp) comme moteur de reconnaissance vocale et [ffmpeg](https://ffmpeg.org/) pour la conversion audio.

## Fonctionnalités

- Interface simple : glisser-déposer un fichier `.m4a` (ou `.mp3`, `.wav`, `.ogg`, `.flac`)
- Transcription 100 % locale (aucune donnée envoyée en ligne)
- Choix du modèle (small / medium / large) selon vitesse vs précision
- Champ "vocabulaire spécifique" pour biaiser le modèle (utile pour jargon médical, technique…)
- Export en fichier texte
- Français par défaut

## Prérequis pour compiler

- [Node.js 22 LTS](https://nodejs.org/) ou plus récent
- Windows 10 / 11

## Installation

```powershell
git clone https://github.com/NearTheEden/Transcript.git
cd Transcript
npm install
```

### Télécharger les ressources externes

Ces fichiers ne sont pas versionnés (trop volumineux / non redistribuables). À placer manuellement :

1. **ffmpeg** — Télécharger depuis [gyan.dev](https://www.gyan.dev/ffmpeg/builds/) (release essentials), extraire, copier `ffmpeg.exe` dans `resources/ffmpeg/`.

2. **whisper.cpp** — Télécharger la dernière release Windows x64 depuis [github.com/ggml-org/whisper.cpp/releases](https://github.com/ggml-org/whisper.cpp/releases), extraire tout le contenu dans `resources/whisper/` (garder toutes les DLL).

3. **Modèles** — Télécharger un ou plusieurs modèles depuis [huggingface.co/ggerganov/whisper.cpp](https://huggingface.co/ggerganov/whisper.cpp/tree/main) et les placer dans `resources/models/`. Recommandé : `ggml-medium-q5_0.bin`.

Arborescence attendue :

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

## Utilisation

**Mode développement** :
```powershell
npm start
```

**Construire un installeur Windows** :
```powershell
npm run dist
```
L'installeur `.exe` sera généré dans `release/`.

## Licence

MIT