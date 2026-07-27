// Empêche le navigateur de tenter d'ouvrir le fichier hors de la zone de drop
document.addEventListener('dragover', (e) => e.preventDefault());
document.addEventListener('drop', (e) => e.preventDefault());

const dropZone = document.getElementById('drop-zone') as HTMLDivElement;
const selectButton = document.getElementById('select-button') as HTMLButtonElement;
const promptInput = document.getElementById('prompt-input') as HTMLTextAreaElement;
const transcribeButton = document.getElementById('transcribe-button') as HTMLButtonElement;
const fileNameLabel = document.getElementById('file-name') as HTMLSpanElement;
const progressArea = document.getElementById('progress-area') as HTMLDivElement;
const progressMessage = document.getElementById('progress-message') as HTMLDivElement;
const resultArea = document.getElementById('result-area') as HTMLDivElement;
const resultText = document.getElementById('result-text') as HTMLTextAreaElement;
const saveButton = document.getElementById('save-button') as HTMLButtonElement;
const saveDocxButton = document.getElementById('save-docx-button') as HTMLButtonElement;
const modelSelect = document.getElementById('model-select') as HTMLSelectElement;
const engineSelect = document.getElementById('engine-select') as HTMLSelectElement;
const importModelButton = document.getElementById('import-model-button') as HTMLButtonElement;
const progressBar = document.getElementById('progress-bar') as HTMLDivElement;

let selectedFilePath: string | null = null;

// Charger la liste des modèles au démarrage
async function loadModels() {
  const models = await window.transcripteurAPI.listModels();
  modelSelect.innerHTML = '';
  if (models.length === 0) {
    modelSelect.innerHTML = '<option value="">Aucun modèle trouvé</option>';
    return;
  }
  for (const model of models) {
    const opt = document.createElement('option');
    opt.value = model.path;   // ← chemin complet au lieu de filename
    opt.textContent = model.label;
    modelSelect.appendChild(opt);
  }
  const mediumIdx = models.findIndex((m) => m.filename.includes('medium'));
  modelSelect.selectedIndex = mediumIdx >= 0 ? mediumIdx : 0;
}
loadModels();

// Charger la liste des moteurs disponibles
async function loadEngines() {
  const engines = await window.transcripteurAPI.listEngines();
  engineSelect.innerHTML = '';
  const availableEngines = engines.filter((e) => e.available);
  if (availableEngines.length === 0) {
    engineSelect.innerHTML = '<option value="">Aucun moteur trouvé</option>';
    return;
  }
  for (const engine of availableEngines) {
    const opt = document.createElement('option');
    opt.value = engine.id;
    opt.textContent = engine.label;
    engineSelect.appendChild(opt);
  }
  // CPU par défaut (compatible partout, sûr)
  const cpuIdx = availableEngines.findIndex((e) => e.id === 'cpu');
  engineSelect.selectedIndex = cpuIdx >= 0 ? cpuIdx : 0;
}
loadEngines();

importModelButton.addEventListener('click', async () => {
  importModelButton.disabled = true;
  importModelButton.textContent = '⏳';
  try {
    const result = await window.transcripteurAPI.importModel();
    if (result === null) return; // annulé
    if (!result.success) {
      alert(`❌ ${result.error}`);
      return;
    }
    alert(`Modèle "${result.filename}" importé avec succès.`);
    await loadModels(); // rafraîchir la liste
  } finally {
    importModelButton.disabled = false;
    importModelButton.textContent = '➕';
  }
});

function updateFileDisplay(filePath: string | null) {
  selectedFilePath = filePath;
  if (filePath) {
    const fileName = filePath.split(/[\\/]/).pop() ?? filePath;
    fileNameLabel.textContent = fileName;
    transcribeButton.disabled = false;
  } else {
    fileNameLabel.textContent = 'Aucun fichier sélectionné';
    transcribeButton.disabled = true;
  }
}

selectButton.addEventListener('click', async () => {
  const filePath = await window.transcripteurAPI.selectFile();
  updateFileDisplay(filePath);
});

dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('dragging');
});
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragging'));
dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('dragging');
  const file = e.dataTransfer?.files[0];
  if (file) {
    const filePath = window.transcripteurAPI.getPathForFile(file);
    updateFileDisplay(filePath);
  }
});

// Enregistrement du callback de progression (une seule fois)
window.transcripteurAPI.onProgress((msg) => {
  progressMessage.textContent = msg;
  // Extraire un pourcentage du message s'il existe
  const match = msg.match(/(\d+)%/);
  if (match) {
    progressBar.classList.remove('indeterminate');
    progressBar.style.width = `${match[1]}%`;
  } else {
    // Phase sans pourcentage (conversion ffmpeg, initialisation) → barre animée
    progressBar.classList.add('indeterminate');
  }
});

transcribeButton.addEventListener('click', async () => {
  if (!selectedFilePath) return;
  if (!modelSelect.value) { alert('Aucun modèle sélectionné.'); return; }
  if (!engineSelect.value) { alert('Aucun moteur sélectionné.'); return; }

  progressArea.classList.remove('hidden');
  resultArea.classList.add('hidden');
  transcribeButton.disabled = true;
  selectButton.disabled = true;
  progressMessage.textContent = 'Préparation…';
  progressBar.style.width = '0%';
  progressBar.classList.add('indeterminate');

  progressArea.classList.remove('hidden');
  resultArea.classList.add('hidden');
  transcribeButton.disabled = true;
  selectButton.disabled = true;
  progressMessage.textContent = 'Préparation…';

  const result = await window.transcripteurAPI.transcribe(
    selectedFilePath,
    promptInput.value,
    modelSelect.value,
    engineSelect.value as 'cpu' | 'vulkan'
  );

  transcribeButton.disabled = false;
  selectButton.disabled = false;

  if (result.success && result.text) {
    progressBar.classList.remove('indeterminate');
    progressBar.style.width = '100%';
    setTimeout(() => {
      progressArea.classList.add('hidden');
      resultArea.classList.remove('hidden');
      resultText.value = result.text!;
    }, 400);
  } else {
    progressBar.classList.remove('indeterminate');
    progressBar.style.width = '0%';
    progressMessage.textContent = `❌ Erreur : ${result.error ?? 'inconnue'}`;
  }
});

saveButton.addEventListener('click', async () => {
  const filePath = await window.transcripteurAPI.saveText(resultText.value);
  if (filePath) alert(`Transcription enregistrée dans :\n${filePath}`);
});

saveDocxButton.addEventListener('click', async () => {
  const sourceFileName = selectedFilePath
    ? selectedFilePath.split(/[\\/]/).pop() ?? 'audio'
    : 'audio';
  const filePath = await window.transcripteurAPI.saveDocx(resultText.value, sourceFileName);
  if (filePath) alert(`Document Word enregistré dans :\n${filePath}`);
});