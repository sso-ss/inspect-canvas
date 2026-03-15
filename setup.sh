#!/bin/bash

# ─────────────────────────────────────────────────────────────
# Inspect Canvas — One-Click Setup
# Installs inspect-canvas and configures AI integration
# Usage: ./setup.sh
#        ./setup.sh --force
# ─────────────────────────────────────────────────────────────

set -e

# Resolve the directory where this script lives (= package source)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"

# Parse flags
FORCE=false
for arg in "$@"; do
    case "$arg" in
        --force|-f) FORCE=true ;;
    esac
done

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

# Required Node.js version
REQUIRED_NODE_MAJOR=18

# ─────────────────────────────────────────────────────────────
# Node.js helpers
# ─────────────────────────────────────────────────────────────

has_node() {
    command -v node &> /dev/null
}

get_node_version() {
    node -v 2>/dev/null | sed 's/^v//'
}

get_node_major() {
    get_node_version | cut -d. -f1
}

node_version_ok() {
    local major
    major=$(get_node_major)
    [ -n "$major" ] && [ "$major" -ge "$REQUIRED_NODE_MAJOR" ]
}

get_version_manager_name() {
    if command -v volta &> /dev/null; then echo "volta"
    elif command -v fnm &> /dev/null; then echo "fnm"
    elif command -v nvm &> /dev/null || [ -d "$HOME/.nvm" ]; then echo "nvm"
    else echo ""
    fi
}

has_brew() {
    command -v brew &> /dev/null
}

# ─────────────────────────────────────────────────────────────
# Auto-install Node.js (with user consent)
# ─────────────────────────────────────────────────────────────

install_node() {
    echo ""
    echo -e "${YELLOW}   Node.js is required but not found.${NC}"
    echo ""

    # Check for version managers first — don't fight them
    local vm_name
    vm_name=$(get_version_manager_name)
    if [ -n "$vm_name" ]; then
        echo -e "   ${DIM}Detected version manager: ${BOLD}$vm_name${NC}"
        echo -e "   ${DIM}Please install Node.js using your version manager:${NC}"
        echo ""
        case "$vm_name" in
            nvm)   echo -e "   ${CYAN}nvm install --lts${NC}" ;;
            fnm)   echo -e "   ${CYAN}fnm install --lts${NC}" ;;
            volta)  echo -e "   ${CYAN}volta install node${NC}" ;;
        esac
        echo ""
        echo -e "   Then re-run this script."
        exit 1
    fi

    # macOS
    if [ "$(uname)" = "Darwin" ]; then
        if has_brew; then
            echo -e "   ${DIM}Homebrew detected. Install Node.js via Homebrew?${NC}"
            echo ""
            echo -e "   ${CYAN}brew install node${NC}"
            echo ""
            read -p "   Install now? (Y/n): " INSTALL_CHOICE
            if [ "$INSTALL_CHOICE" = "n" ] || [ "$INSTALL_CHOICE" = "N" ]; then
                echo -e "${YELLOW}   Skipped. Install Node.js manually and re-run.${NC}"
                exit 1
            fi
            echo ""
            echo -e "   ${DIM}Installing Node.js via Homebrew...${NC}"
            brew install node
            if has_node && node_version_ok; then
                echo -e "${GREEN}   ✅ Node.js $(get_node_version) installed${NC}"
                return 0
            else
                echo -e "${RED}   ❌ Installation failed${NC}"
                exit 1
            fi
        else
            echo -e "   ${DIM}Download the official Node.js installer?${NC}"
            echo -e "   ${DIM}This will open the .pkg installer from nodejs.org${NC}"
            echo ""
            read -p "   Download now? (Y/n): " INSTALL_CHOICE
            if [ "$INSTALL_CHOICE" = "n" ] || [ "$INSTALL_CHOICE" = "N" ]; then
                echo -e "${YELLOW}   Skipped. Install Node.js manually:${NC}"
                echo -e "   ${CYAN}https://nodejs.org${NC}"
                exit 1
            fi
            echo ""
            echo -e "   ${DIM}Downloading Node.js installer...${NC}"
            local PKG_URL="https://nodejs.org/dist/v22.14.0/node-v22.14.0.pkg"
            local PKG_PATH="/tmp/node-installer.pkg"
            curl -fSL "$PKG_URL" -o "$PKG_PATH"
            echo -e "   ${DIM}Opening installer (follow the prompts)...${NC}"
            open "$PKG_PATH"
            echo ""
            echo -e "${YELLOW}   Complete the installer, then re-run this script.${NC}"
            exit 0
        fi
    fi

    # Linux
    echo -e "   ${DIM}Install Node.js automatically?${NC}"
    echo ""
    echo -e "   This will use the NodeSource setup script to install Node.js LTS."
    echo -e "   ${DIM}(requires sudo)${NC}"
    echo ""
    read -p "   Install now? (Y/n): " INSTALL_CHOICE
    if [ "$INSTALL_CHOICE" = "n" ] || [ "$INSTALL_CHOICE" = "N" ]; then
        echo -e "${YELLOW}   Skipped. Install Node.js manually:${NC}"
        echo ""
        echo -e "   ${CYAN}# Option 1: nvm (recommended)${NC}"
        echo -e "   ${DIM}curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash${NC}"
        echo -e "   ${DIM}nvm install --lts${NC}"
        echo ""
        echo -e "   ${CYAN}# Option 2: Package manager${NC}"
        echo -e "   ${DIM}sudo apt-get install nodejs npm${NC}"
        echo ""
        exit 1
    fi
    echo ""
    echo -e "   ${DIM}Installing Node.js LTS...${NC}"
    if command -v apt-get &> /dev/null; then
        curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
        sudo apt-get install -y nodejs
    elif command -v dnf &> /dev/null; then
        curl -fsSL https://rpm.nodesource.com/setup_22.x | sudo bash -
        sudo dnf install -y nodejs
    elif command -v yum &> /dev/null; then
        curl -fsSL https://rpm.nodesource.com/setup_22.x | sudo bash -
        sudo yum install -y nodejs
    else
        echo -e "${RED}   ❌ Unsupported package manager. Install Node.js manually:${NC}"
        echo -e "   ${CYAN}https://nodejs.org${NC}"
        exit 1
    fi
    if has_node && node_version_ok; then
        echo -e "${GREEN}   ✅ Node.js $(get_node_version) installed${NC}"
    else
        echo -e "${RED}   ❌ Installation failed${NC}"
        exit 1
    fi
}

# ─────────────────────────────────────────────────────────────
# Detect existing installation
# ─────────────────────────────────────────────────────────────

is_globally_installed() {
    command -v inspect-canvas &> /dev/null || npm list -g inspect-canvas 2>/dev/null | grep -q inspect-canvas
}

is_locally_installed() {
    [ -f "node_modules/.bin/inspect-canvas" ] || { [ -f "package.json" ] && grep -q '"inspect-canvas"' package.json 2>/dev/null; }
}

# ─────────────────────────────────────────────────────────────
# Install inspect-canvas
# ─────────────────────────────────────────────────────────────

install_package() {
    while true; do
        echo ""
        echo -e "   ${BOLD}How would you like to install inspect-canvas?${NC}"
        echo ""
        echo "   1) Global install  — available everywhere (npm install -g inspect-canvas)"
        echo "   2) Local install   — project only (npm install --save-dev inspect-canvas)"
        echo ""
        read -p "   Choose [1-2]: " INSTALL_CHOICE
        echo ""

        case "$INSTALL_CHOICE" in
            1)
                echo -e "   ${DIM}Installing globally (may need your password)...${NC}"
                sudo npm install -g "$SCRIPT_DIR"
                echo -e "${GREEN}   ✅ inspect-canvas installed globally${NC}"
                break
                ;;
            2)
                if [ ! -f "package.json" ]; then
                    echo -e "   ${DIM}No package.json found — initializing...${NC}"
                    npm init -y > /dev/null 2>&1
                fi
                echo -e "   ${DIM}Installing locally...${NC}"
                npm install --save-dev "$SCRIPT_DIR"
                echo -e "${GREEN}   ✅ inspect-canvas installed locally${NC}"
                break
                ;;
            *)
                echo ""
                ;;
        esac
    done
}

# ─────────────────────────────────────────────────────────────
# Configure AI integration
# ─────────────────────────────────────────────────────────────

AI_INSTRUCTIONS='# inspect-canvas Integration

When the user says "update this element", "change this", "fix this", or similar requests about a UI element:

1. Read `.inspect-canvas.json` in the project root
2. It contains the selected element'\''s details:
   - `tag` — HTML tag name
   - `selector` — CSS selector path to the element
   - `styles` — current computed styles
   - `text` — visible text content
   - `size` — rendered width/height
   - `instruction` — what the user wants changed (if provided)
3. Find the source file that renders this element
4. Apply the requested change to the source code

If `instruction` is present, follow it. If not, ask the user what they'\''d like to change.'

write_file_if_needed() {
    local FILE_PATH="$1"
    local LABEL="$2"
    local DIR
    DIR="$(dirname "$FILE_PATH")"
    mkdir -p "$DIR"

    if [ -f "$FILE_PATH" ] && grep -q "inspect-canvas" "$FILE_PATH" 2>/dev/null; then
        echo -e "${DIM}   Already exists: $LABEL${NC}"
        return 0
    fi

    echo "$AI_INSTRUCTIONS" > "$FILE_PATH"
    echo -e "${GREEN}   ✅ $LABEL${NC}"
}

configure_copilot()    { write_file_if_needed "$1/.github/copilot-instructions.md" "VS Code / GitHub Copilot  (.github/copilot-instructions.md)"; }
configure_cursor_ai()  { write_file_if_needed "$1/.cursorrules" "Cursor  (.cursorrules)"; }
configure_claude_code(){ write_file_if_needed "$1/CLAUDE.md" "Claude Code  (CLAUDE.md)"; }
configure_windsurf()   { write_file_if_needed "$1/.windsurfrules" "Windsurf  (.windsurfrules)"; }

configure_project() {
    local PROJECT_PATH
    PROJECT_PATH="$(pwd)"

    while true; do
        echo ""
        echo -e "   ${BOLD}Which AI tool do you use?${NC}"
        echo -e "   ${DIM}We'll add an instruction file to: ${NC}${CYAN}$PROJECT_PATH${NC}"
        echo -e "   ${DIM}So your AI knows how to read .inspect-canvas.json${NC}"
        echo ""
        echo ""
        echo "   1) VS Code / GitHub Copilot"
        echo "   2) Cursor"
        echo "   3) Claude Code"
        echo "   4) Windsurf"
        echo "   5) All of the above"
        echo ""
        read -p "   Choose [1-5]: " AI_CHOICE
        echo ""

        case "$AI_CHOICE" in
            1) configure_copilot "$PROJECT_PATH"; break ;;
            2) configure_cursor_ai "$PROJECT_PATH"; break ;;
            3) configure_claude_code "$PROJECT_PATH"; break ;;
            4) configure_windsurf "$PROJECT_PATH"; break ;;
            5)
                configure_copilot "$PROJECT_PATH"
                configure_cursor_ai "$PROJECT_PATH"
                configure_claude_code "$PROJECT_PATH"
                configure_windsurf "$PROJECT_PATH"
                break
                ;;
            *)
                echo ""
                ;;
        esac
    done
}

# ─────────────────────────────────────────────────────────────
# Banner
# ─────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║${NC}                                                          ${BOLD}║${NC}"
echo -e "${BOLD}║${NC}   ${BOLD}Inspect Canvas${NC} — One-Click Setup                        ${BOLD}║${NC}"
echo -e "${BOLD}║${NC}   Visual element inspector. Edit styles in-browser,      ${BOLD}║${NC}"
echo -e "${BOLD}║${NC}   or hand it to your AI to update the code.              ${BOLD}║${NC}"
echo -e "${BOLD}║${NC}                                                          ${BOLD}║${NC}"
echo -e "${BOLD}║${NC}   ${DIM}  ┌────────────────────────────┐${NC}                    ${BOLD}║${NC}"
echo -e "${BOLD}║${NC}   ${DIM}  │${NC}${CYAN}  🔍 Click any element       ${NC}${DIM}│${NC}                    ${BOLD}║${NC}"
echo -e "${BOLD}║${NC}   ${DIM}  │${NC}${GREEN}  ✎  Tweak styles in panel   ${NC}${DIM}│${NC}                    ${BOLD}║${NC}"
echo -e "${BOLD}║${NC}   ${DIM}  │${NC}${YELLOW}  ✨ Or let AI update code   ${NC}${DIM}│${NC}                    ${BOLD}║${NC}"
echo -e "${BOLD}║${NC}   ${DIM}  └────────────────────────────┘${NC}                    ${BOLD}║${NC}"
echo -e "${BOLD}║${NC}                                                          ${BOLD}║${NC}"
echo -e "${BOLD}╠══════════════════════════════════════════════════════════╣${NC}"
echo -e "${BOLD}║${NC}   ${BOLD}Why this exists:${NC}                                       ${BOLD}║${NC}"
echo -e "${BOLD}║${NC}   ${DIM}• DevTools lets you inspect — but changes don't stick${NC}   ${BOLD}║${NC}"
echo -e "${BOLD}║${NC}   ${DIM}• AI assistants can't see what you're pointing at${NC}      ${BOLD}║${NC}"
echo -e "${BOLD}║${NC}   ${DIM}• This bridges the gap: click what you see,${NC}            ${BOLD}║${NC}"
echo -e "${BOLD}║${NC}   ${DIM}  edit it visually or let AI update your code.${NC}        ${BOLD}║${NC}"
echo -e "${BOLD}║${NC}                                                          ${BOLD}║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════════════════════╝${NC}"
echo ""

# ─────────────────────────────────────────────────────────────
# Step 1: Check Node.js
# ─────────────────────────────────────────────────────────────
echo -e "${BOLD}   Step 1: Check Node.js${NC}"
echo ""

if has_node; then
    if node_version_ok; then
        echo -e "${GREEN}   ✅ Node.js $(get_node_version) found${NC}"
    else
        echo -e "${RED}   ❌ Node.js $(get_node_version) found, but v${REQUIRED_NODE_MAJOR}+ required${NC}"
        echo ""
        echo -e "   ${DIM}Please upgrade Node.js and re-run this script.${NC}"
        exit 1
    fi
else
    install_node
fi

echo ""

# ─────────────────────────────────────────────────────────────
# Smart re-run detection
# ─────────────────────────────────────────────────────────────
if [ "$FORCE" = false ]; then
    ALREADY_INSTALLED=false
    if is_globally_installed; then
        ALREADY_INSTALLED=true
        INSTALL_TYPE="globally"
    elif is_locally_installed; then
        ALREADY_INSTALLED=true
        INSTALL_TYPE="locally"
    fi

    if [ "$ALREADY_INSTALLED" = true ]; then
        echo -e "${GREEN}   inspect-canvas is already installed ($INSTALL_TYPE).${NC}"
        echo ""
        echo -e "   ${BOLD}What would you like to do?${NC}"
        echo "    1) Set up AI tool integration (Copilot / Cursor / Claude Code / Windsurf)"
        echo "    2) Inspect a file or URL"
        echo "    3) Reinstall inspect-canvas"
        echo "    4) Full re-setup (same as --force)"
        echo "    5) Exit — nothing to change"
        echo ""
        read -p "   Choose [1-5]: " RERUN_CHOICE

        case "$RERUN_CHOICE" in
            1) configure_project ;;
            2)
                read -p "   Enter URL or folder path: " LAUNCH_TARGET
                if [ -n "$LAUNCH_TARGET" ]; then
                    echo ""
                    echo -e "${CYAN}   Launching: npx inspect-canvas $LAUNCH_TARGET${NC}"
                    npx inspect-canvas "$LAUNCH_TARGET" &
                    INSPECT_PID=$!
                    sleep 2
                    if kill -0 $INSPECT_PID 2>/dev/null; then
                        echo -e "${GREEN}   ✅ inspect-canvas is running (pid $INSPECT_PID)${NC}"
                        echo -e "   ${DIM}Press Ctrl+C to stop it${NC}"
                        wait $INSPECT_PID 2>/dev/null
                        exit 0
                    else
                        echo -e "${RED}   Failed to launch.${NC} Try a different path or URL."
                        echo -e "   ${DIM}Examples: ./my-project  or  http://localhost:5173${NC}"
                    fi
                fi
                ;;
            3) install_package ;;
            4) FORCE=true ;;
            5) echo -e "${GREEN}   All good! 👋${NC}"; exit 0 ;;
            *) echo -e "${GREEN}   All good! 👋${NC}"; exit 0 ;;
        esac

        if [ "$FORCE" != true ]; then
            echo ""
            echo -e "${GREEN}   ✅ Done!${NC}"
            echo ""
            echo -e "   ${BOLD}Quick start:${NC}"
            echo -e "   ${CYAN}npx inspect-canvas http://localhost:5173${NC}"
            echo -e "   ${CYAN}npx inspect-canvas ./my-project${NC}"
            echo ""
            exit 0
        fi
    fi
fi

# ─────────────────────────────────────────────────────────────
# Step 2: Install inspect-canvas
# ─────────────────────────────────────────────────────────────
echo -e "${BOLD}   Step 2: Install inspect-canvas${NC}"
install_package

echo ""

# ─────────────────────────────────────────────────────────────
# Step 3: Configure AI integration
# ─────────────────────────────────────────────────────────────
echo -e "${BOLD}   Step 3: Configure AI Integration${NC}"
configure_project

echo ""

# ─────────────────────────────────────────────────────────────
# Step 4: Launch inspect-canvas
# ─────────────────────────────────────────────────────────────
while true; do
    echo -e "${BOLD}   Step 4: What would you like to inspect?${NC}"
    echo ""
    echo "    1) A local folder (e.g. ./my-project)"
    echo "    2) A dev server URL (e.g. http://localhost:5173)"
    echo "    3) Done — I'll launch it later"
    echo ""
    read -p "   Choose [1-3]: " LAUNCH_CHOICE

    case "$LAUNCH_CHOICE" in
        1)
            read -p "   Enter folder path: " LAUNCH_TARGET
            if [ -n "$LAUNCH_TARGET" ]; then
                echo ""
                echo -e "${CYAN}   Launching: npx inspect-canvas $LAUNCH_TARGET${NC}"
                echo ""
                npx inspect-canvas "$LAUNCH_TARGET" &
                INSPECT_PID=$!
                sleep 2
                if kill -0 $INSPECT_PID 2>/dev/null; then
                    SERVER_LAUNCHED=true
                    break
                else
                    echo ""
                    echo -e "${RED}   Failed to launch.${NC} Try again."
                    echo ""
                fi
            else
                echo -e "${DIM}   No path entered.${NC}"
                echo ""
            fi
            ;;
        2)
            read -p "   Enter URL: " LAUNCH_TARGET
            if [ -n "$LAUNCH_TARGET" ]; then
                echo ""
                echo -e "${CYAN}   Launching: npx inspect-canvas $LAUNCH_TARGET${NC}"
                echo ""
                npx inspect-canvas "$LAUNCH_TARGET" &
                INSPECT_PID=$!
                sleep 2
                if kill -0 $INSPECT_PID 2>/dev/null; then
                    SERVER_LAUNCHED=true
                    break
                else
                    echo ""
                    echo -e "${RED}   Failed to launch.${NC} Try again."
                    echo ""
                fi
            else
                echo -e "${DIM}   No URL entered.${NC}"
                echo ""
            fi
            ;;
        3)
            SERVER_LAUNCHED=false
            break
            ;;
        *)
            echo ""
            ;;
    esac
done

echo ""

# ─────────────────────────────────────────────────────────────
# Done
# ─────────────────────────────────────────────────────────────
if [ "${SERVER_LAUNCHED:-false}" = true ]; then
    echo -e "${BOLD}╔══════════════════════════════════════════════════════╗${NC}"
    echo -e "${BOLD}║${NC}   ${GREEN}✅ Setup complete! Server is running.${NC}              ${BOLD}║${NC}"
    echo -e "${BOLD}╠══════════════════════════════════════════════════════╣${NC}"
    echo -e "${BOLD}║${NC}                                                      ${BOLD}║${NC}"
    echo -e "${BOLD}║${NC}   ${BOLD}Select any element in the browser${NC}                  ${BOLD}║${NC}"
    echo -e "${BOLD}║${NC}   ${BOLD}Then ask your AI:${NC}                                  ${BOLD}║${NC}"
    echo -e "${BOLD}║${NC}   ${DIM}\"Update this element\" / \"Fix this\" / \"Change this\"${NC}  ${BOLD}║${NC}"
    echo -e "${BOLD}║${NC}                                                      ${BOLD}║${NC}"
    echo -e "${BOLD}║${NC}   ${DIM}Press Ctrl+C to stop the server${NC}                    ${BOLD}║${NC}"
    echo -e "${BOLD}║${NC}                                                      ${BOLD}║${NC}"
    echo -e "${BOLD}╚══════════════════════════════════════════════════════╝${NC}"
    echo ""
    wait $INSPECT_PID 2>/dev/null
else
    echo -e "${BOLD}╔══════════════════════════════════════════════════════╗${NC}"
    echo -e "${BOLD}║${NC}   ${GREEN}✅ Setup complete!${NC}                                  ${BOLD}║${NC}"
    echo -e "${BOLD}╠══════════════════════════════════════════════════════╣${NC}"
    echo -e "${BOLD}║${NC}                                                      ${BOLD}║${NC}"
    echo -e "${BOLD}║${NC}   ${BOLD}Start inspecting:${NC}                                   ${BOLD}║${NC}"
    echo -e "${BOLD}║${NC}   ${CYAN}npx inspect-canvas http://localhost:5173${NC}               ${BOLD}║${NC}"
    echo -e "${BOLD}║${NC}   ${CYAN}npx inspect-canvas ./my-project${NC}                        ${BOLD}║${NC}"
    echo -e "${BOLD}║${NC}                                                      ${BOLD}║${NC}"
    echo -e "${BOLD}║${NC}   ${BOLD}Then in your AI assistant:${NC}                           ${BOLD}║${NC}"
    echo -e "${BOLD}║${NC}   ${DIM}\"Update this element\" / \"Fix this\" / \"Change this\"${NC}  ${BOLD}║${NC}"
    echo -e "${BOLD}║${NC}                                                      ${BOLD}║${NC}"
    echo -e "${BOLD}╚══════════════════════════════════════════════════════╝${NC}"
    echo ""
fi
