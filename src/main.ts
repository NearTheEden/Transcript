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
    title: 'Sélectionner un fichier audio',
    filters: [{ name: 'Fichiers audio', extensions: ['m4a', 'mp3', 'wav', 'ogg', 'flac'] }],
    properties: ['openFile'],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

// --- IPC : transcription complète ---
ipcMain.handle('transcribe', async (_event, args: {
  audioPath: string;
  prompt: string;
  modelFilename: string;
  engine: 'cpu' | 'vulkan';
}) => {
  const { audioPath, prompt, modelFilename, engine } = args;
  const modelPath = resourcePath('models', modelFilename);
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

// --- IPC : liste des modèles disponibles ---
ipcMain.handle('list-models', async () => {
  const modelsDir = resourcePath('models');
  try {
    const files = await fs.promises.readdir(modelsDir);
    return files
      .filter((f) => f.endsWith('.bin'))
      .map((f) => ({
        filename: f,
        label: prettyModelName(f),
      }));
  } catch {
    return [];
  }
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

function prettyModelName(filename: string): string {
  // ggml-medium-q5_0.bin → "medium (q5_0)"
  const match = filename.match(/ggml-([a-z0-9.-]+?)(?:-(q\d+_\d+))?\.bin/i);
  if (!match) return filename;
  const size = match[1];
  const quant = match[2];
  return quant ? `${size} (${quant})` : size;
}