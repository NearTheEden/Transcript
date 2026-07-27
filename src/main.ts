import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { spawn } from 'child_process';
import { Document, Packer, Paragraph, HeadingLevel, TextRun, AlignmentType } from 'docx';

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 780,
    title: 'Transcript',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer/index.html'));
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

function userModelsPath(): string {
  const dir = path.join(app.getPath('userData'), 'models');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// --- Chemins vers les ressources ---
function resourcePath(...segments: string[]): string {
  // En dev : depuis dist/, on remonte à la racine du projet
  // En prod (app packagée) : les extraResources sont dans process.resourcesPath
  const base = app.isPackaged
    ? process.resourcesPath
    : path.join(__dirname, '..', 'resources');
  return path.join(base, ...segments);
}

const FFMPEG_PATH = resourcePath('ffmpeg', 'ffmpeg.exe');

// --- IPC : sélection de fichier via dialogue natif ---
ipcMain.handle('select-audio-file', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Sélectionner un fichier audio ou vidéo',
    filters: [
      {
        name: 'Fichiers audio et vidéo',
        extensions: [
          // Audio
          'm4a', 'mp3', 'wav', 'ogg', 'flac', 'aac', 'wma', 'opus', 'aiff', 'amr',
          // Vidéo (ffmpeg extrait la piste audio automatiquement)
          'mp4', 'mov', 'mkv', 'avi', 'webm', 'wmv',
        ],
      },
      { name: 'Tous les fichiers', extensions: ['*'] },
    ],
    properties: ['openFile'],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

// --- IPC : transcription complète ---
ipcMain.handle('transcribe', async (_event, args: {
  audioPath: string;
  prompt: string;
  modelPath: string;
  engine: 'cpu' | 'vulkan';
}) => {
  const { audioPath, prompt, modelPath, engine } = args;
  const whisperDir = engine === 'vulkan' ? 'whisper-vulkan' : 'whisper-cpu';
  const whisperPath = resourcePath(whisperDir, 'whisper-cli.exe');
  const tempWavPath = path.join(os.tmpdir(), `transcript_${Date.now()}.wav`);

  const sendProgress = (message: string) => {
    mainWindow?.webContents.send('transcription-progress', message);
  };

  try {
    // 1. Conversion m4a → wav 16kHz mono
    sendProgress('Conversion du fichier audio…');
    await runProcess(FFMPEG_PATH, [
      '-i', audioPath,
      '-ar', '16000',
      '-ac', '1',
      '-c:a', 'pcm_s16le',
      '-y',
      tempWavPath,
    ]);

    // 2. Transcription
    sendProgress(`Démarrage de la transcription (moteur : ${engine.toUpperCase()})…`);
    const whisperArgs = [
      '-m', modelPath,
      '-f', tempWavPath,
      '-l', 'fr',
      '-otxt',
    ];
    if (prompt && prompt.trim().length > 0) {
      whisperArgs.push('--prompt', prompt.trim());
    }

    await runProcess(whisperPath, whisperArgs, (chunk) => {
      const match = chunk.match(/(\d+)%/);
      if (match) sendProgress(`Transcription : ${match[1]}%`);
    });

    // 3. Lire le résultat
    const txtPath = tempWavPath + '.txt';
    const text = await fs.promises.readFile(txtPath, 'utf-8');

    // 4. Nettoyage
    fs.promises.unlink(tempWavPath).catch(() => { });
    fs.promises.unlink(txtPath).catch(() => { });

    sendProgress('Terminé !');
    return { success: true, text };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
});

// --- IPC : enregistrer le texte ---
ipcMain.handle('save-text', async (_event, text: string) => {
  const result = await dialog.showSaveDialog({
    title: 'Enregistrer la transcription',
    defaultPath: `transcription_${new Date().toISOString().slice(0, 10)}.txt`,
    filters: [{ name: 'Fichier texte', extensions: ['txt'] }],
  });
  if (result.canceled || !result.filePath) return null;
  await fs.promises.writeFile(result.filePath, text, 'utf-8');
  return result.filePath;
});

// --- IPC : enregistrer en .docx ---
ipcMain.handle('save-docx', async (_event, args: { text: string; sourceFileName: string }) => {
  const { text, sourceFileName } = args;

  const result = await dialog.showSaveDialog({
    title: 'Enregistrer la transcription en Word',
    defaultPath: `transcription_${new Date().toISOString().slice(0, 10)}.docx`,
    filters: [{ name: 'Document Word', extensions: ['docx'] }],
  });
  if (result.canceled || !result.filePath) return null;

  // Découper le texte en paragraphes (double saut de ligne = nouveau paragraphe)
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  const dateStr = new Date().toLocaleDateString('fr-BE', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const doc = new Document({
    creator: 'Transcript',
    title: 'Transcription',
    description: `Transcription générée à partir de ${sourceFileName}`,
    styles: {
      default: {
        document: {
          run: { font: 'Calibri', size: 22 }, // 11pt (docx = demi-points)
        },
      },
    },
    sections: [
      {
        properties: {},
        children: [
          new Paragraph({
            text: 'Transcription',
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.CENTER,
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text: `Fichier source : ${sourceFileName}`,
                italics: true,
                color: '666666',
              }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text: `Date : ${dateStr}`,
                italics: true,
                color: '666666',
              }),
            ],
          }),
          new Paragraph({ text: '' }), // ligne vide
          ...paragraphs.map(
            (p) =>
              new Paragraph({
                children: [new TextRun({ text: p })],
                spacing: { after: 200 },
              })
          ),
        ],
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  await fs.promises.writeFile(result.filePath, buffer);
  return result.filePath;
});

// --- Helper : lancer un processus enfant ---
function runProcess(
  command: string,
  args: string[],
  onStderr?: (chunk: string) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args);
    proc.stderr.on('data', (data) => {
      if (onStderr) onStderr(data.toString());
    });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Le processus s'est terminé avec le code ${code}`));
    });
  });
}

ipcMain.handle('list-models', async () => {
  const results: { filename: string; label: string; source: 'builtin' | 'user'; path: string }[] = [];

  // 1. Modèles packagés (lecture seule)
  const builtinDir = resourcePath('models');
  try {
    const files = await fs.promises.readdir(builtinDir);
    for (const f of files) {
      if (f.endsWith('.bin')) {
        results.push({
          filename: f,
          label: prettyModelName(f),
          source: 'builtin',
          path: path.join(builtinDir, f),
        });
      }
    }
  } catch { /* dossier vide ou absent, ignoré */ }

  // 2. Modèles utilisateur
  const userDir = userModelsPath();
  try {
    const files = await fs.promises.readdir(userDir);
    for (const f of files) {
      if (f.endsWith('.bin')) {
        results.push({
          filename: f,
          label: prettyModelName(f) + ' (personnalisé)',
          source: 'user',
          path: path.join(userDir, f),
        });
      }
    }
  } catch { /* pas grave */ }

  return results;
});

// --- IPC : liste des moteurs disponibles ---
ipcMain.handle('list-engines', async () => {
  const engines: { id: 'cpu' | 'vulkan'; label: string; available: boolean }[] = [
    {
      id: 'cpu',
      label: 'CPU (compatible partout)',
      available: fs.existsSync(resourcePath('whisper-cpu', 'whisper-cli.exe')),
    },
    {
      id: 'vulkan',
      label: 'GPU Vulkan (plus rapide si GPU compatible)',
      available: fs.existsSync(resourcePath('whisper-vulkan', 'whisper-cli.exe')),
    },
  ];
  return engines;
});

ipcMain.handle('import-model', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Sélectionner un modèle Whisper (.bin)',
    filters: [{ name: 'Modèles Whisper', extensions: ['bin'] }],
    properties: ['openFile'],
  });
  if (result.canceled || result.filePaths.length === 0) return null;

  const sourcePath = result.filePaths[0];
  const fileName = path.basename(sourcePath);
  const destPath = path.join(userModelsPath(), fileName);

  // Vérifier qu'on n'écrase pas un modèle existant
  if (fs.existsSync(destPath)) {
    return { success: false, error: `Un modèle nommé "${fileName}" existe déjà.` };
  }

  // Copier (peut prendre du temps sur des fichiers de plusieurs Go, on stream)
  await new Promise<void>((resolve, reject) => {
    const rd = fs.createReadStream(sourcePath);
    const wr = fs.createWriteStream(destPath);
    rd.on('error', reject);
    wr.on('error', reject);
    wr.on('close', () => resolve());
    rd.pipe(wr);
  });

  return { success: true, filename: fileName };
});

function prettyModelName(filename: string): string {
  // ggml-medium-q5_0.bin → "medium (q5_0)"
  const match = filename.match(/ggml-([a-z0-9.-]+?)(?:-(q\d+_\d+))?\.bin/i);
  if (!match) return filename;
  const size = match[1];
  const quant = match[2];
  return quant ? `${size} (${quant})` : size;
}