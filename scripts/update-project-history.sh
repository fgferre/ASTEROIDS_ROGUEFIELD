#!/bin/bash

# Script to automatically update project history from git
# Extracts and formats complete git history into docs/progress/historico_do_projeto.txt

set -e

OUTPUT_FILE="docs/progress/historico_do_projeto.txt"
ENCODING="UTF-8"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Error handling
error_exit() {
    echo -e "${RED}❌ Erro: $1${NC}" >&2
    exit 1
}

success_message() {
    echo -e "${GREEN}✅ $1${NC}"
}

warning_message() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

# Check if we're in a git repository
if ! git rev-parse --git-dir > /dev/null 2>&1; then
    error_exit "Não está em um repositório git. Execute este script a partir da raiz do projeto."
fi

# Create output directory if it doesn't exist
mkdir -p "$(dirname "$OUTPUT_FILE")"

# Check write permissions
if ! touch "$OUTPUT_FILE" 2>/dev/null; then
    error_exit "Sem permissão de escrita em $OUTPUT_FILE"
fi

success_message "Gerando histórico do projeto..."

# Generate the history file
{
    # Header
    echo "=========================================="
    echo "Histórico do Projeto ASTEROIDS_ROGUEFIELD"
    echo "=========================================="
    echo ""
    echo "Gerado em: $(date '+%Y-%m-%d %H:%M:%S')"
    echo "Commit Atual: $(git rev-parse HEAD)"
    echo "Branch Atual: $(git branch --show-current)"
    echo ""
    echo "=========================================="
    echo ""

    # Section 1: Full commit history
    echo "## Histórico Completo de Commits"
    echo ""
    git log --all --pretty=format:"%h - %an, %ar : %s" --date=short || warning_message "Erro ao obter histórico completo"
    echo ""
    echo ""

    # Section 2: Visual graph history (last 50)
    echo "## Histórico Visual (Graph - Últimos 50 Commits)"
    echo ""
    git log --all --oneline --decorate --graph --date=short -50 || warning_message "Erro ao obter histórico visual"
    echo ""
    echo ""

    # Section 3: Merge history
    echo "## Histórico de Merges"
    echo ""
    if git log --merges --oneline > /dev/null 2>&1; then
        git log --merges --pretty=format:"%h - %an, %ar : %s" --date=short || warning_message "Nenhum merge encontrado"
    else
        echo "Nenhum merge encontrado no histórico"
    fi
    echo ""
    echo ""

    # Section 4: Available branches
    echo "## Branches Disponíveis"
    echo ""
    echo "### Branches Locais:"
    echo ""
    git branch -v || warning_message "Erro ao listar branches locais"
    echo ""
    echo "### Branches Remotos:"
    echo ""
    git branch -r -v || warning_message "Erro ao listar branches remotos"
    echo ""
    echo ""

    # Section 5: Tags
    echo "## Tags e Releases"
    echo ""
    if git tag -l > /dev/null 2>&1; then
        TAG_COUNT=$(git tag -l | wc -l)
        if [ "$TAG_COUNT" -gt 0 ]; then
            git tag -l -n1 || warning_message "Erro ao listar tags"
        else
            echo "Nenhuma tag encontrada"
        fi
    else
        echo "Nenhuma tag encontrada"
    fi
    echo ""
    echo ""

    # Section 6: Repository statistics
    echo "## Estatísticas do Repositório"
    echo ""
    echo "Total de commits: $(git rev-list --count HEAD)"
    echo ""
    echo "Primeiros 10 Contribuidores:"
    git shortlog -sn --all | head -10 || warning_message "Erro ao obter contribuidores"
    echo ""
    echo "Primeiro commit: $(git log --reverse --oneline | head -1)"
    echo ""
    echo "Último commit: $(git log --oneline -1)"
    echo ""
    echo ""

    # Section 7: Recent commits (last 20)
    echo "## Commits Recentes (Últimos 20)"
    echo ""
    git log --oneline --decorate -20 || warning_message "Erro ao obter commits recentes"
    echo ""
    echo ""

    # Footer
    echo "=========================================="
    echo "Arquivo gerado automaticamente"
    echo "Script: scripts/update-project-history.sh"
    echo ""
    echo "Para atualizar manualmente:"
    echo "  npm run update:history"
    echo ""
    echo "Ou executar o script diretamente:"
    echo "  bash scripts/update-project-history.sh (Linux/Mac/Git Bash)"
    echo "  powershell -ExecutionPolicy Bypass -File scripts/update-project-history.ps1 (Windows PowerShell)"
    echo "=========================================="

} > "$OUTPUT_FILE" 2>&1

# Verify file was created
if [ -f "$OUTPUT_FILE" ]; then
    FILE_SIZE=$(wc -c < "$OUTPUT_FILE")
    LINE_COUNT=$(wc -l < "$OUTPUT_FILE")
    success_message "Histórico atualizado: $OUTPUT_FILE"
    success_message "Tamanho: $FILE_SIZE bytes | Linhas: $LINE_COUNT"
else
    error_exit "Falha ao criar arquivo $OUTPUT_FILE"
fi

exit 0
