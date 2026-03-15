# Inspect Canvas — One-Click Setup (Windows)
# Installs inspect-canvas and configures AI integration
# Usage: powershell -ExecutionPolicy Bypass -File .\setup.ps1
#        powershell -ExecutionPolicy Bypass -File .\setup.ps1 -Force
param([switch]$Force)

# Resolve the directory where this script lives (= package source)
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition

$ErrorActionPreference = "Continue"
if (Test-Path variable:PSNativeCommandUseErrorActionPreference) {
    $PSNativeCommandUseErrorActionPreference = $false
}

$script:RequiredNodeMajor = 18

# ============================================================
# Node.js helpers
# ============================================================

function Test-HasNode {
    $null -ne (Get-Command node -ErrorAction SilentlyContinue)
}

function Get-NodeVersion {
    if (Test-HasNode) { (node -v) -replace '^v', '' } else { "" }
}

function Get-NodeMajor {
    $v = Get-NodeVersion
    if ($v) { [int]($v.Split('.')[0]) } else { 0 }
}

function Test-NodeVersionOk {
    (Get-NodeMajor) -ge $script:RequiredNodeMajor
}

function Get-VersionManagerName {
    if (Get-Command volta -ErrorAction SilentlyContinue) { return "volta" }
    if (Get-Command fnm -ErrorAction SilentlyContinue) { return "fnm" }
    if (Get-Command nvm -ErrorAction SilentlyContinue) { return "nvm" }
    if (Test-Path "$env:USERPROFILE\.nvm") { return "nvm" }
    return ""
}

# ============================================================
# Auto-install Node.js (with user consent)
# ============================================================

function Install-NodeJs {
    Write-Host ""
    Write-Host "   Node.js is required but not found." -ForegroundColor Yellow
    Write-Host ""

    $vmName = Get-VersionManagerName
    if ($vmName) {
        Write-Host "   Detected version manager: $vmName" -ForegroundColor DarkGray
        Write-Host "   Please install Node.js using your version manager:" -ForegroundColor DarkGray
        Write-Host ""
        switch ($vmName) {
            "nvm"   { Write-Host "   nvm install lts" -ForegroundColor Cyan }
            "fnm"   { Write-Host "   fnm install --lts" -ForegroundColor Cyan }
            "volta" { Write-Host "   volta install node" -ForegroundColor Cyan }
        }
        Write-Host ""
        Write-Host "   Then re-run this script."
        exit 1
    }

    # Try winget
    $hasWinget = $null -ne (Get-Command winget -ErrorAction SilentlyContinue)
    if ($hasWinget) {
        Write-Host "   winget detected. Install Node.js LTS?" -ForegroundColor DarkGray
        Write-Host ""
        Write-Host "   winget install OpenJS.NodeJS.LTS" -ForegroundColor Cyan
        Write-Host ""
        $choice = Read-Host "   Install now? (Y/n)"
        if ($choice -eq 'n' -or $choice -eq 'N') {
            Write-Host "   Skipped. Install Node.js manually and re-run." -ForegroundColor Yellow
            exit 1
        }
        Write-Host ""
        Write-Host "   Installing Node.js via winget..." -ForegroundColor DarkGray
        winget install OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
        # Refresh PATH
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
        if (Test-HasNode -and (Test-NodeVersionOk)) {
            Write-Host "   Node.js $(Get-NodeVersion) installed" -ForegroundColor Green
            return
        } else {
            Write-Host "   Installation may require a terminal restart." -ForegroundColor Yellow
            Write-Host "   Close this window, open a new one, and re-run." -ForegroundColor Yellow
            exit 0
        }
    }

    # Fallback: download installer
    Write-Host "   Download the official Node.js installer?" -ForegroundColor DarkGray
    Write-Host "   This will download the .msi installer from nodejs.org" -ForegroundColor DarkGray
    Write-Host ""
    $choice = Read-Host "   Download now? (Y/n)"
    if ($choice -eq 'n' -or $choice -eq 'N') {
        Write-Host "   Skipped. Install Node.js manually: https://nodejs.org" -ForegroundColor Yellow
        exit 1
    }
    Write-Host ""
    Write-Host "   Downloading Node.js installer..." -ForegroundColor DarkGray
    $msiUrl = "https://nodejs.org/dist/v22.14.0/node-v22.14.0-x64.msi"
    $msiPath = "$env:TEMP\node-installer.msi"
    Invoke-WebRequest -Uri $msiUrl -OutFile $msiPath -UseBasicParsing
    Write-Host "   Running installer (follow the prompts)..." -ForegroundColor DarkGray
    Start-Process msiexec.exe -ArgumentList "/i `"$msiPath`"" -Wait
    # Refresh PATH
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
    if (Test-HasNode -and (Test-NodeVersionOk)) {
        Write-Host "   Node.js $(Get-NodeVersion) installed" -ForegroundColor Green
    } else {
        Write-Host "   Complete the installer, then re-run this script." -ForegroundColor Yellow
        exit 0
    }
}

# ============================================================
# Detect existing installation
# ============================================================

function Test-GloballyInstalled {
    $null -ne (Get-Command inspect-canvas -ErrorAction SilentlyContinue)
}

function Test-LocallyInstalled {
    (Test-Path "node_modules\.bin\inspect-canvas.cmd") -or
    ((Test-Path "package.json") -and ((Get-Content "package.json" -Raw) -match '"inspect-canvas"'))
}

# ============================================================
# Install inspect-canvas
# ============================================================

function Install-Package {
    while ($true) {
        Write-Host ""
        Write-Host "   How would you like to install inspect-canvas?" -ForegroundColor White
        Write-Host ""
        Write-Host "   1) Global install  - available everywhere (npm install -g inspect-canvas)"
        Write-Host "   2) Local install   - project only (npm install --save-dev inspect-canvas)"
        Write-Host ""
        $choice = Read-Host "   Choose [1-2]"
        Write-Host ""

        $shouldBreak = $false
        switch ($choice) {
            "1" {
                Write-Host "   Installing globally..." -ForegroundColor DarkGray
                npm install -g $ScriptDir
                Write-Host "   inspect-canvas installed globally" -ForegroundColor Green
                $shouldBreak = $true
            }
            "2" {
                if (-not (Test-Path "package.json")) {
                    Write-Host "   No package.json found - initializing..." -ForegroundColor DarkGray
                    npm init -y 2>&1 | Out-Null
                }
                Write-Host "   Installing locally..." -ForegroundColor DarkGray
                npm install --save-dev $ScriptDir
                Write-Host "   inspect-canvas installed locally" -ForegroundColor Green
                $shouldBreak = $true
            }
            default { Write-Host "" }
        }
        if ($shouldBreak) { break }
    }
}

# ============================================================
# Configure AI integration
# ============================================================

$script:AiInstructions = @'
# inspect-canvas Integration

When the user says "update this element", "change this", "fix this", or similar requests about a UI element:

1. Read `.inspect-canvas.json` in the project root
2. It contains the selected element's details:
   - `tag` — HTML tag name
   - `selector` — CSS selector path to the element
   - `styles` — current computed styles
   - `text` — visible text content
   - `size` — rendered width/height
   - `instruction` — what the user wants changed (if provided)
3. Find the source file that renders this element
4. Apply the requested change to the source code

If `instruction` is present, follow it. If not, ask the user what they'd like to change.
'@

function Write-InstructionFile {
    param([string]$FilePath, [string]$Label)
    $dir = Split-Path -Parent $FilePath
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }

    if ((Test-Path $FilePath) -and ((Get-Content $FilePath -Raw -ErrorAction SilentlyContinue) -match "inspect-canvas")) {
        Write-Host "   Already exists: $Label" -ForegroundColor DarkGray
        return
    }

    $script:AiInstructions | Set-Content $FilePath -Encoding UTF8
    Write-Host "   $Label" -ForegroundColor Green
}

function Set-ProjectConfig {
    $projectPath = (Get-Location).Path

    while ($true) {
        Write-Host ""
        Write-Host "   Which AI tool do you use?" -ForegroundColor White
        Write-Host "   We'll add an instruction file to: $projectPath" -ForegroundColor DarkGray
        Write-Host "   So your AI knows how to read .inspect-canvas.json" -ForegroundColor DarkGray
        Write-Host ""
        Write-Host ""
        Write-Host "   1) VS Code / GitHub Copilot"
        Write-Host "   2) Cursor"
        Write-Host "   3) Claude Code"
        Write-Host "   4) Windsurf"
        Write-Host "   5) All of the above"
        Write-Host ""
        $aiChoice = Read-Host "   Choose [1-5]"
        Write-Host ""

        $shouldBreak = $false
        switch ($aiChoice) {
            "1" { Write-InstructionFile (Join-Path $projectPath ".github\copilot-instructions.md") "VS Code / GitHub Copilot  (.github/copilot-instructions.md)"; $shouldBreak = $true }
            "2" { Write-InstructionFile (Join-Path $projectPath ".cursorrules") "Cursor  (.cursorrules)"; $shouldBreak = $true }
            "3" { Write-InstructionFile (Join-Path $projectPath "CLAUDE.md") "Claude Code  (CLAUDE.md)"; $shouldBreak = $true }
            "4" { Write-InstructionFile (Join-Path $projectPath ".windsurfrules") "Windsurf  (.windsurfrules)"; $shouldBreak = $true }
            "5" {
                Write-InstructionFile (Join-Path $projectPath ".github\copilot-instructions.md") "VS Code / GitHub Copilot  (.github/copilot-instructions.md)"
                Write-InstructionFile (Join-Path $projectPath ".cursorrules") "Cursor  (.cursorrules)"
                Write-InstructionFile (Join-Path $projectPath "CLAUDE.md") "Claude Code  (CLAUDE.md)"
                Write-InstructionFile (Join-Path $projectPath ".windsurfrules") "Windsurf  (.windsurfrules)"
                $shouldBreak = $true
            }
            default { Write-Host "" }
        }
        if ($shouldBreak) { break }
    }
}

# ============================================================
# Banner
# ============================================================
Write-Host ""
Write-Host "  +==========================================================+" -ForegroundColor White
Write-Host "  |                                                            |" -ForegroundColor White
Write-Host "  |   " -NoNewline; Write-Host "Inspect Canvas" -ForegroundColor White -NoNewline; Write-Host " - One-Click Setup                          |" -ForegroundColor White
Write-Host "  |   Visual element inspector. Edit styles in-browser,        |" -ForegroundColor DarkGray
Write-Host "  |   or hand it to your AI to update the code.                |" -ForegroundColor DarkGray
Write-Host "  |                                                            |" -ForegroundColor White
Write-Host "  |     +------------------------------+                      |" -ForegroundColor White
Write-Host "  |     |  " -NoNewline; Write-Host "Click any element       " -ForegroundColor Cyan -NoNewline; Write-Host "  |                      |" -ForegroundColor White
Write-Host "  |     |  " -NoNewline; Write-Host "Tweak styles in panel   " -ForegroundColor Green -NoNewline; Write-Host "  |                      |" -ForegroundColor White
Write-Host "  |     |  " -NoNewline; Write-Host "Or let AI update code   " -ForegroundColor Yellow -NoNewline; Write-Host "  |                      |" -ForegroundColor White
Write-Host "  |     +------------------------------+                      |" -ForegroundColor White
Write-Host "  |                                                            |" -ForegroundColor White
Write-Host "  +----------------------------------------------------------+" -ForegroundColor White
Write-Host "  |   Why this exists:                                        |" -ForegroundColor White
Write-Host "  |   " -NoNewline; Write-Host "- DevTools lets you inspect - but changes don't stick" -ForegroundColor DarkGray -NoNewline; Write-Host "  |" -ForegroundColor White
Write-Host "  |   " -NoNewline; Write-Host "- AI assistants can't see what you're pointing at  " -ForegroundColor DarkGray -NoNewline; Write-Host "  |" -ForegroundColor White
Write-Host "  |   " -NoNewline; Write-Host "- This bridges the gap: click what you see,        " -ForegroundColor DarkGray -NoNewline; Write-Host "  |" -ForegroundColor White
Write-Host "  |   " -NoNewline; Write-Host "  edit visually or let AI update your code.        " -ForegroundColor DarkGray -NoNewline; Write-Host "  |" -ForegroundColor White
Write-Host "  |                                                            |" -ForegroundColor White
Write-Host "  +==========================================================+" -ForegroundColor White
Write-Host ""

# ============================================================
# Step 1: Check Node.js
# ============================================================
Write-Host "   Step 1: Check Node.js" -ForegroundColor White
Write-Host ""

if (Test-HasNode) {
    if (Test-NodeVersionOk) {
        Write-Host "   Node.js $(Get-NodeVersion) found" -ForegroundColor Green
    } else {
        Write-Host "   Node.js $(Get-NodeVersion) found, but v$($script:RequiredNodeMajor)+ required" -ForegroundColor Red
        Write-Host "   Please upgrade Node.js and re-run this script." -ForegroundColor DarkGray
        exit 1
    }
} else {
    Install-NodeJs
}

Write-Host ""

# ============================================================
# Smart re-run detection
# ============================================================
if (-not $Force) {
    $alreadyInstalled = $false
    $installType = ""

    if (Test-GloballyInstalled) {
        $alreadyInstalled = $true
        $installType = "globally"
    } elseif (Test-LocallyInstalled) {
        $alreadyInstalled = $true
        $installType = "locally"
    }

    if ($alreadyInstalled) {
        Write-Host "   inspect-canvas is already installed ($installType)." -ForegroundColor Green
        Write-Host ""
        Write-Host "   What would you like to do?" -ForegroundColor White
        Write-Host "    1) Set up AI tool integration (Copilot / Cursor / Claude Code / Windsurf)"
        Write-Host "    2) Inspect a file or URL"
        Write-Host "    3) Reinstall inspect-canvas"
        Write-Host "    4) Full re-setup (same as -Force)"
        Write-Host "    5) Exit - nothing to change"
        Write-Host ""
        $rerunChoice = Read-Host "   Choose [1-5]"

        switch ($rerunChoice) {
            "1" { Set-ProjectConfig }
            "2" {
                $launchTarget = Read-Host "   Enter URL or folder path"
                if ($launchTarget) {
                    Write-Host ""
                    Write-Host "   Launching: npx inspect-canvas $launchTarget" -ForegroundColor Cyan
                    $proc = Start-Process -FilePath "npx" -ArgumentList "inspect-canvas", $launchTarget -PassThru -NoNewWindow
                    Start-Sleep -Seconds 2
                    if (-not $proc.HasExited) {
                        Write-Host "   inspect-canvas is running (pid $($proc.Id))" -ForegroundColor Green
                        Write-Host "   Press Ctrl+C to stop it" -ForegroundColor DarkGray
                        $proc.WaitForExit()
                        exit 0
                    } else {
                        Write-Host "   Failed to launch." -ForegroundColor Red -NoNewline
                        Write-Host " Try a different path or URL."
                        Write-Host "   Examples: ./my-project  or  http://localhost:5173" -ForegroundColor DarkGray
                    }
                }
            }
            "3" { Install-Package }
            "4" { $Force = $true }
            "5" { Write-Host "   All good!" -ForegroundColor Green; exit 0 }
            default { Write-Host "   All good!" -ForegroundColor Green; exit 0 }
        }

        if (-not $Force) {
            Write-Host ""
            Write-Host "   Done!" -ForegroundColor Green
            Write-Host ""
            Write-Host "   Quick start:" -ForegroundColor White
            Write-Host "   npx inspect-canvas http://localhost:5173" -ForegroundColor Cyan
            Write-Host "   npx inspect-canvas ./my-project" -ForegroundColor Cyan
            Write-Host ""
            exit 0
        }
    }
}

# ============================================================
# Step 2: Install inspect-canvas
# ============================================================
Write-Host "   Step 2: Install inspect-canvas" -ForegroundColor White
Install-Package

Write-Host ""

# ============================================================
# Step 3: Configure AI integration
# ============================================================
Write-Host "   Step 3: Configure AI Integration" -ForegroundColor White
Set-ProjectConfig

Write-Host ""

# ============================================================
# Step 4: Launch inspect-canvas
# ============================================================
while ($true) {
    Write-Host "   Step 4: What would you like to inspect?" -ForegroundColor White
    Write-Host ""
    Write-Host "    1) A local folder (e.g. ./my-project)"
    Write-Host "    2) A dev server URL (e.g. http://localhost:5173)"
    Write-Host "    3) Done - I'll launch it later"
    Write-Host ""
    $launchChoice = Read-Host "   Choose [1-3]"

    $shouldBreak = $false
    switch ($launchChoice) {
        "1" {
            $launchTarget = Read-Host "   Enter folder path"
            if ($launchTarget) {
                Write-Host ""
                Write-Host "   Launching: npx inspect-canvas $launchTarget" -ForegroundColor Cyan
                Write-Host ""
                $proc = Start-Process -FilePath "npx" -ArgumentList "inspect-canvas", $launchTarget -PassThru -NoNewWindow
                Start-Sleep -Seconds 2
                if (-not $proc.HasExited) {
                    $serverLaunched = $true
                    $shouldBreak = $true
                } else {
                    Write-Host ""
                    Write-Host "   Failed to launch." -ForegroundColor Red -NoNewline
                    Write-Host " Try again."
                    Write-Host ""
                }
            } else {
                Write-Host "   No path entered." -ForegroundColor DarkGray
                Write-Host ""
            }
        }
        "2" {
            $launchTarget = Read-Host "   Enter URL"
            if ($launchTarget) {
                Write-Host ""
                Write-Host "   Launching: npx inspect-canvas $launchTarget" -ForegroundColor Cyan
                Write-Host ""
                $proc = Start-Process -FilePath "npx" -ArgumentList "inspect-canvas", $launchTarget -PassThru -NoNewWindow
                Start-Sleep -Seconds 2
                if (-not $proc.HasExited) {
                    $serverLaunched = $true
                    $shouldBreak = $true
                } else {
                    Write-Host ""
                    Write-Host "   Failed to launch." -ForegroundColor Red -NoNewline
                    Write-Host " Try again."
                    Write-Host ""
                }
            } else {
                Write-Host "   No URL entered." -ForegroundColor DarkGray
                Write-Host ""
            }
        }
        "3" { $serverLaunched = $false; $shouldBreak = $true }
        default { Write-Host "" }
    }
    if ($shouldBreak) { break }
}

Write-Host ""

# ============================================================
# Done
# ============================================================
if ($serverLaunched) {
    Write-Host "  +======================================================+" -ForegroundColor White
    Write-Host "  |   " -NoNewline; Write-Host "Setup complete! Server is running." -ForegroundColor Green -NoNewline; Write-Host "              |" -ForegroundColor White
    Write-Host "  +------------------------------------------------------+" -ForegroundColor White
    Write-Host "  |                                                       |" -ForegroundColor White
    Write-Host "  |   Select any element in the browser                   |" -ForegroundColor White
    Write-Host "  |   Then ask your AI:                                   |" -ForegroundColor White
    Write-Host "  |   " -NoNewline; Write-Host '"Update this element" / "Fix this" / "Change this"' -ForegroundColor DarkGray -NoNewline; Write-Host "  |" -ForegroundColor White
    Write-Host "  |                                                       |" -ForegroundColor White
    Write-Host "  |   " -NoNewline; Write-Host "Press Ctrl+C to stop the server" -ForegroundColor DarkGray -NoNewline; Write-Host "                    |" -ForegroundColor White
    Write-Host "  |                                                       |" -ForegroundColor White
    Write-Host "  +======================================================+" -ForegroundColor White
    Write-Host ""
    $proc.WaitForExit()
} else {
    Write-Host "  +======================================================+" -ForegroundColor White
    Write-Host "  |   " -NoNewline; Write-Host "Setup complete!" -ForegroundColor Green -NoNewline; Write-Host "                                  |" -ForegroundColor White
    Write-Host "  +------------------------------------------------------+" -ForegroundColor White
    Write-Host "  |                                                       |" -ForegroundColor White
    Write-Host "  |   Start inspecting:                                   |" -ForegroundColor White
    Write-Host "  |   " -NoNewline; Write-Host "npx inspect-canvas http://localhost:5173" -ForegroundColor Cyan -NoNewline; Write-Host "               |" -ForegroundColor White
    Write-Host "  |   " -NoNewline; Write-Host "npx inspect-canvas ./my-project" -ForegroundColor Cyan -NoNewline; Write-Host "                        |" -ForegroundColor White
    Write-Host "  |                                                       |" -ForegroundColor White
    Write-Host "  |   Then in your AI assistant:                          |" -ForegroundColor White
    Write-Host "  |   " -NoNewline; Write-Host '"Update this element" / "Fix this"' -ForegroundColor DarkGray -NoNewline; Write-Host "              |" -ForegroundColor White
    Write-Host "  |                                                       |" -ForegroundColor White
    Write-Host "  +======================================================+" -ForegroundColor White
    Write-Host ""
}
