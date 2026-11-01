# One-time setup of the Content Factory transcription environment.
#   powershell -ExecutionPolicy Bypass -File server/whisper/setup.ps1
# Needs `uv` (https://docs.astral.sh/uv/). Creates server/whisper/.venv with Python 3.12,
# installs faster-whisper + the CUDA 12 runtime wheels, and downloads the Whisper model.
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
uv venv --python 3.12 .venv
uv pip install --python .venv\Scripts\python.exe -r requirements.txt
# Warm the model cache so the first real job doesn't download 1.6 GB.
.venv\Scripts\python.exe -c "import transcribe as t; t.add_cuda_runtime_paths(); t.load_model(t.DEFAULT_MODEL, 'cuda' if t.cuda_available() else 'cpu', 'float16' if t.cuda_available() else 'int8'); print('model ready')"
Write-Output "Done. Start the worker with: npm run whisper:worker --prefix server"
