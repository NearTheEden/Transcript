export { };

declare global {
  interface Window {
    transcripteurAPI: {
      selectFile: () => Promise<string | null>;
      listModels: () => Promise<{ filename: string; label: string; source: 'builtin' | 'user'; path: string }[]>;
      importModel: () => Promise<{ success: boolean; filename?: string; error?: string } | null>;
      listEngines: () => Promise<{ id: 'cpu' | 'vulkan'; label: string; available: boolean }[]>;
      transcribe: (
        audioPath: string,
        prompt: string,
        modelPath: string,
        engine: 'cpu' | 'vulkan'
      ) => Promise<{ success: boolean; text?: string; error?: string }>;
      saveText: (text: string) => Promise<string | null>;
      saveDocx: (text: string, sourceFileName: string) => Promise<string | null>;
      onProgress: (callback: (message: string) => void) => void;
      getPathForFile: (file: File) => string;
    };
  }
}