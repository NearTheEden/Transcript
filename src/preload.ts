import { contextBridge, ipcRenderer, webUtils } from 'electron';

contextBridge.exposeInMainWorld('transcripteurAPI', {
  selectFile: (): Promise<string | null> =>
    ipcRenderer.invoke('select-audio-file'),

  listModels: (): Promise<{ filename: string; label: string }[]> =>
    ipcRenderer.invoke('list-models'),

  transcribe: (audioPath: string, prompt: string, modelFilename: string) =>
    ipcRenderer.invoke('transcribe', { audioPath, prompt, modelFilename }),

  saveText: (text: string): Promise<string | null> =>
    ipcRenderer.invoke('save-text', text),

  onProgress: (callback: (message: string) => void) => {
    ipcRenderer.on('transcription-progress', (_event, message) => callback(message));
  },

  // Requis depuis Electron 32 pour récupérer le chemin d'un fichier drag-and-drop
  getPathForFile: (file: File): string => webUtils.getPathForFile(file),
});