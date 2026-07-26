import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { spawn } from 'child_process';

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
const WHISPER_PATH = resourcePath('whisper', 'whisper-cli.exe');

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
ipcMain.handle('transcribe', async (_event, args: { audioPath: string; prompt: string; modelFilename: string }) => {
    const { audioPath, prompt, modelFilename } = args;
    const modelPath = resourcePath('models', modelFilename);
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
    sendProgress('Démarrage de la transcription…');
    const whisperArgs = [
      '-m', modelPath,
      '-f', tempWavPath,
      '-l', 'fr',
      '-otxt',
    ];
    if (prompt && prompt.trim().length > 0) {
      whisperArgs.push('--prompt', prompt.trim());
    }

    await runProcess(WHISPER_PATH, whisperArgs, (chunk) => {
      // Whisper.cpp affiche parfois une progression en %
      const match = chunk.match(/(\d+)%/);
      if (match) sendProgress(`Transcription : ${match[1]}%`);
    });

    // 3. Lire le résultat
    const txtPath = tempWavPath + '.txt';
    console.log('🔍 [main] Chemin attendu:', txtPath);
    console.log('🔍 [main] Existe ?', fs.existsSync(txtPath));

    // Bonus : lister le contenu du dossier temp pour voir ce que whisper a vraiment créé
    const tempDir = path.dirname(tempWavPath);
    const tempFiles = fs.readdirSync(tempDir).filter(f => f.startsWith('transcript_'));
    console.log('🔍 [main] Fichiers transcript_* dans temp:', tempFiles);

    const text = await fs.promises.readFile(txtPath, 'utf-8');
    console.log('🔍 [main] Texte lu, longueur:', text.length);

    // 4. Nettoyage
    fs.promises.unlink(tempWavPath).catch(() => {});
    fs.promises.unlink(txtPath).catch(() => {});

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
  
  function prettyModelName(filename: string): string {
    // ggml-medium-q5_0.bin → "medium (q5_0)"
    const match = filename.match(/ggml-([a-z0-9.-]+?)(?:-(q\d+_\d+))?\.bin/i);
    if (!match) return filename;
    const size = match[1];
    const quant = match[2];
    return quant ? `${size} (${quant})` : size;
  }