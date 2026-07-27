import { contextBridge, ipcRenderer, webUtils } from 'electron';

contextBridge.exposeInMainWorld('transcripteurAPI', {
  selectFile: (): Promise<string | null> =>
    ipcRenderer.invoke('select-audio-file'),

  listModels: (): Promise<{ filename: string; label: string; source: 'builtin' | 'user'; path: string }[]> =>
    ipcRenderer.invoke('list-models'),

  importModel: (): Promise<{ success: boolean; filename?: string; error?: string } | null> =>
    ipcRenderer.invoke('import-model'),

  listEngines: (): Promise<{ id: 'cpu' | 'vulkan'; label: string; available: boolean }[]> =>
    ipcRenderer.invoke('list-engines'),

  transcribe: (audioPath: string, prompt: string, modelPath: string, engine: 'cpu' | 'vulkan') =>
    ipcRenderer.invoke('transcribe', { audioPath, prompt, modelPath, engine }),

  saveText: (text: string): Promise<string | null> =>
    ipcRenderer.invoke('save-text', text),

  saveDocx: (text: string, sourceFileName: string): Promise<string | null> =>
    ipcRenderer.invoke('save-docx', { text, sourceFileName }),

  onProgress: (callback: (message: string) => void) => {
    ipcRenderer.on('transcription-progress', (_event, message) => callback(message));
  },

  getPathForFile: (file: File): string => webUtils.getPathForFile(file),
});