export { };

declare global {
  interface Window {
    transcripteurAPI: {
      selectFile: () => Promise<string | null>;
      listModels: () => Promise<{ filename: string; label: string }[]>;
      listEngines: () => Promise<{ id: 'cpu' | 'vulkan'; label: string; available: boolean }[]>;
      transcribe: (
        audioPath: string,
        prompt: string,
        modelFilename: string,
        engine: 'cpu' | 'vulkan'
      ) => Promise<{ success: boolean; text?: string; error?: string }>;
      saveText: (text: string) => Promise<string | null>;
      saveDocx: (text: string, sourceFileName: string) => Promise<string | null>;
      onProgress: (callback: (message: string) => void) => void;
      getPathForFile: (file: File) => string;
    };
  }
}