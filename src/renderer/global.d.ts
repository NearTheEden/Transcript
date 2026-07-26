export {};

declare global {
  interface Window {
    transcripteurAPI: {
      selectFile: () => Promise<string | null>;
      listModels: () => Promise<{ filename: string; label: string }[]>;
      transcribe: (
        audioPath: string,
        prompt: string,
        modelFilename: string
      ) => Promise<{ success: boolean; text?: string; error?: string }>;
      saveText: (text: string) => Promise<string | null>;
      onProgress: (callback: (message: string) => void) => void;
      getPathForFile: (file: File) => string;
    };
  }
}