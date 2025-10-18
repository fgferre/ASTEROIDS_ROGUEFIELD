# Script to automatically update project history from git (PowerShell version)
# Extracts and formats complete git history into docs/progress/historico_do_projeto.txt
# Works on Windows PowerShell 5.1+ and PowerShell Core 7+

$OutputFile = "docs/progress/historico_do_projeto.txt"
$Encoding = [System.Text.Encoding]::UTF8

# Colors for output
$green = "Green"
$red = "Red"
$yellow = "Yellow"

function Write-Success {
    param([string]$Message)
    Write-Host "✅ $Message" -ForegroundColor $green
}

function Write-Error {
    param([string]$Message)
    Write-Host "❌ Erro: $Message" -ForegroundColor $red
    exit 1
}

function Write-Warning {
    param([string]$Message)
    Write-Host "⚠️  $Message" -ForegroundColor $yellow
}

# Check if git is available
try {
    $null = git --version
}
catch {
    Write-Error "Git não está instalado ou não está no PATH"
}

# Check if we're in a git repository
try {
    $null = git rev-parse --git-dir 2>$null
}
catch {
    Write-Error "Não está em um repositório git. Execute este script a partir da raiz do projeto."
}

# Create output directory if it doesn't exist
$OutputDir = Split-Path -Path $OutputFile -Parent
if (-not (Test-Path -Path $OutputDir)) {
    try {
        New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
    }
    catch {
        Write-Error "Falha ao criar diretório $OutputDir"
    }
}

# Check write permissions
try {
    $null = New-Item -ItemType File -Path $OutputFile -Force
}
catch {
    Write-Error "Sem permissão de escrita em $OutputFile"
}

Write-Success "Gerando histórico do projeto..."

# Generate content using StringBuilder for performance
$sb = New-Object System.Text.StringBuilder

# Header
$null = $sb.AppendLine("==========================================")
$null = $sb.AppendLine("Histórico do Projeto ASTEROIDS_ROGUEFIELD")
$null = $sb.AppendLine("==========================================")
$null = $sb.AppendLine("")
$null = $sb.AppendLine("Gerado em: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')")

# Get current commit
try {
    $currentCommit = git rev-parse HEAD
    $null = $sb.AppendLine("Commit Atual: $currentCommit")
}
catch {
    Write-Warning "Erro ao obter commit atual"
}

# Get current branch
try {
    $currentBranch = git branch --show-current
    $null = $sb.AppendLine("Branch Atual: $currentBranch")
}
catch {
    Write-Warning "Erro ao obter branch atual"
}

$null = $sb.AppendLine("")
$null = $sb.AppendLine("==========================================")
$null = $sb.AppendLine("")

# Section 1: Full commit history
$null = $sb.AppendLine("## Histórico Completo de Commits")
$null = $sb.AppendLine("")
try {
    $history = git log --all --pretty=format:"%h - %an, %ar : %s" --date=short
    if ($history) {
        $null = $sb.AppendLine($history)
    }
}
catch {
    Write-Warning "Erro ao obter histórico completo"
}
$null = $sb.AppendLine("")
$null = $sb.AppendLine("")

# Section 2: Visual graph history (last 50)
$null = $sb.AppendLine("## Histórico Visual (Graph - Últimos 50 Commits)")
$null = $sb.AppendLine("")
try {
    $graphHistory = git log --all --oneline --decorate --graph --date=short -50
    if ($graphHistory) {
        $null = $sb.AppendLine($graphHistory)
    }
}
catch {
    Write-Warning "Erro ao obter histórico visual"
}
$null = $sb.AppendLine("")
$null = $sb.AppendLine("")

# Section 3: Merge history
$null = $sb.AppendLine("## Histórico de Merges")
$null = $sb.AppendLine("")
try {
    $merges = git log --merges --pretty=format:"%h - %an, %ar : %s" --date=short 2>$null
    if ($merges) {
        $null = $sb.AppendLine($merges)
    }
    else {
        $null = $sb.AppendLine("Nenhum merge encontrado no histórico")
    }
}
catch {
    Write-Warning "Erro ao obter histórico de merges"
}
$null = $sb.AppendLine("")
$null = $sb.AppendLine("")

# Section 4: Available branches
$null = $sb.AppendLine("## Branches Disponíveis")
$null = $sb.AppendLine("")
$null = $sb.AppendLine("### Branches Locais:")
$null = $sb.AppendLine("")
try {
    $localBranches = git branch -v
    if ($localBranches) {
        $null = $sb.AppendLine($localBranches)
    }
}
catch {
    Write-Warning "Erro ao listar branches locais"
}
$null = $sb.AppendLine("")
$null = $sb.AppendLine("### Branches Remotos:")
$null = $sb.AppendLine("")
try {
    $remoteBranches = git branch -r -v
    if ($remoteBranches) {
        $null = $sb.AppendLine($remoteBranches)
    }
}
catch {
    Write-Warning "Erro ao listar branches remotos"
}
$null = $sb.AppendLine("")
$null = $sb.AppendLine("")

# Section 5: Tags
$null = $sb.AppendLine("## Tags e Releases")
$null = $sb.AppendLine("")
try {
    $tags = git tag -l
    if ($tags) {
        $tagDetails = git tag -l -n1
        if ($tagDetails) {
            $null = $sb.AppendLine($tagDetails)
        }
    }
    else {
        $null = $sb.AppendLine("Nenhuma tag encontrada")
    }
}
catch {
    Write-Warning "Erro ao listar tags"
}
$null = $sb.AppendLine("")
$null = $sb.AppendLine("")

# Section 6: Repository statistics
$null = $sb.AppendLine("## Estatísticas do Repositório")
$null = $sb.AppendLine("")
try {
    $commitCount = git rev-list --count HEAD
    $null = $sb.AppendLine("Total de commits: $commitCount")
}
catch {
    Write-Warning "Erro ao contar commits"
}
$null = $sb.AppendLine("")
$null = $sb.AppendLine("Primeiros 10 Contribuidores:")
try {
    $contributors = git shortlog -sn --all | Select-Object -First 10
    if ($contributors) {
        $null = $sb.AppendLine($contributors)
    }
}
catch {
    Write-Warning "Erro ao obter contribuidores"
}
$null = $sb.AppendLine("")

try {
    $firstCommit = git log --reverse --oneline | Select-Object -First 1
    $null = $sb.AppendLine("Primeiro commit: $firstCommit")
}
catch {
    Write-Warning "Erro ao obter primeiro commit"
}

try {
    $lastCommit = git log --oneline -1
    $null = $sb.AppendLine("Último commit: $lastCommit")
}
catch {
    Write-Warning "Erro ao obter último commit"
}
$null = $sb.AppendLine("")
$null = $sb.AppendLine("")

# Section 7: Recent commits (last 20)
$null = $sb.AppendLine("## Commits Recentes (Últimos 20)")
$null = $sb.AppendLine("")
try {
    $recentCommits = git log --oneline --decorate -20
    if ($recentCommits) {
        $null = $sb.AppendLine($recentCommits)
    }
}
catch {
    Write-Warning "Erro ao obter commits recentes"
}
$null = $sb.AppendLine("")
$null = $sb.AppendLine("")

# Footer
$null = $sb.AppendLine("==========================================")
$null = $sb.AppendLine("Arquivo gerado automaticamente")
$null = $sb.AppendLine("Script: scripts/update-project-history.ps1")
$null = $sb.AppendLine("")
$null = $sb.AppendLine("Para atualizar manualmente:")
$null = $sb.AppendLine("  npm run update:history")
$null = $sb.AppendLine("")
$null = $sb.AppendLine("Ou executar o script diretamente:")
$null = $sb.AppendLine("  bash scripts/update-project-history.sh (Linux/Mac/Git Bash)")
$null = $sb.AppendLine("  powershell -ExecutionPolicy Bypass -File scripts/update-project-history.ps1 (Windows PowerShell)")
$null = $sb.AppendLine("==========================================")

# Write to file with UTF-8 encoding
try {
    $content = $sb.ToString()
    [System.IO.File]::WriteAllText($OutputFile, $content, $Encoding)

    $fileSize = (Get-Item $OutputFile).Length
    $lineCount = $content.Split([System.Environment]::NewLine).Count

    Write-Success "Histórico atualizado: $OutputFile"
    Write-Success "Tamanho: $fileSize bytes | Linhas: $lineCount"
}
catch {
    Write-Error "Falha ao escrever arquivo $OutputFile"
}

exit 0
