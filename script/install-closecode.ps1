<#
.SYNOPSIS
    Build (optionally) and install the freshly built CloseCode `closecode.exe`.

.DESCRIPTION
    One-click installer for the CloseCode fork. By default it builds the Windows
    binary from this repository, then overwrites every existing `closecode.exe`
    install target it can find (npm global packages, the standalone
    `$HOME\.opencode\bin` directory, and any concrete shim target) and verifies
    that the installed binary starts.

    The previous binary at each target is backed up once as
    `closecode.exe.bak-<timestamp>` next to it (disable with `-NoBackup`).

    This script never downloads from the network and never deletes unrelated
    files; it only overwrites `closecode.exe` files.

.PARAMETER Version
    Version string encoded into the build and patched into the installed npm
    package.json files. When omitted, the version is read from the repository
    root package.json. Pass -Version to override that derived version.

.PARAMETER Channel
    Release channel passed to the build as OPENCODE_CHANNEL. Default: latest.

.PARAMETER Binary
    Use a pre-built `closecode.exe` instead of building. The build is skipped.

.PARAMETER NoBuild
    Skip building. Uses `-Binary` when supplied, otherwise auto-detects the
    newest `cli-windows-*\bin\closecode.exe` under `packages\cli\dist`.

.PARAMETER Baseline
    Build/use the `-baseline` target for x64 (Bun builds without AVX2).

.PARAMETER DryRun
    Alias for `-WhatIf`: print the intended actions without changing anything.

.PARAMETER SkipNpm
    Do not touch npm global package binaries.

.PARAMETER SkipStandalone
    Do not touch `$HOME\.opencode\bin\closecode.exe`.

.PARAMETER NoBackup
    Do not create `closecode.exe.bak-<timestamp>` backups.

.PARAMETER AddToPath
    Add `$HOME\.opencode\bin` to the USER PATH if missing. Without this switch
    the script only prints `setx` guidance.

.PARAMETER Help
    Print this help and exit.

.EXAMPLE
    .\install-closecode.ps1
    Build the default Windows target and install it everywhere.

.EXAMPLE
    .\install-closecode.ps1 -NoBuild -DryRun
    Show exactly what would be installed without changing anything.

.EXAMPLE
    .\install-closecode.ps1 -Binary .\packages\cli\dist\cli-windows-x64\bin\closecode.exe
    Install an existing build.

.EXAMPLE
    .\install-closecode.ps1 -Version 0.3.0 -Channel latest -SkipNpm
    Build 0.3.0 and install only to the standalone directory.

.EXAMPLE
    .\install-closecode.ps1 -Baseline -AddToPath
    Build the x64 baseline target and add the standalone dir to the USER PATH.
#>
[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = "Medium")]
param(
    [string] $Version,
    [string] $Channel = "latest",
    [string] $Binary,
    [switch] $NoBuild,
    [switch] $Baseline,
    [switch] $DryRun,
    [switch] $SkipNpm,
    [switch] $SkipStandalone,
    [switch] $NoBackup,
    [switch] $AddToPath,
    [switch] $Help
)

$ErrorActionPreference = "Stop"

function Write-Head([string] $Message) {
    Write-Host ""
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Write-Info([string] $Message) {
    Write-Host "    $Message" -ForegroundColor Gray
}

function Write-Ok([string] $Message) {
    Write-Host "    $Message" -ForegroundColor Green
}

function Write-Note([string] $Message) {
    Write-Host "    $Message" -ForegroundColor Yellow
}

function Write-Fail([string] $Message) {
    Write-Host "    $Message" -ForegroundColor Red
}

function Get-TargetArch {
    $value = $null
    try {
        $value = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture
    } catch {
        $value = $null
    }
    if (-not $value) { $value = $env:PROCESSOR_ARCHITECTURE }
    switch -Regex ("$value") {
        '^(X64|AMD64)$' { return "x64" }
        '^(Arm64|ARM64)$' { return "arm64" }
        default { throw "Unsupported processor architecture: $value" }
    }
}

function Get-NpmRootGlobal {
    foreach ($name in @("npm.cmd", "npm")) {
        $npm = Get-Command $name -ErrorAction SilentlyContinue
        if (-not $npm) { continue }
        try {
            $output = (& $npm.Source root -g 2> $null | Select-Object -First 1)
            $root = ([string] $output).Trim()
            if ($root -and (Test-Path -LiteralPath $root)) { return $root }
        } catch {
            Write-Note "npm root -g failed: $($_.Exception.Message)"
        }
    }
    if ($env:APPDATA) {
        $fallback = Join-Path $env:APPDATA "npm\node_modules"
        if (Test-Path -LiteralPath $fallback) {
            Write-Note "Using npm global root fallback: $fallback"
            return $fallback
        }
    }
    return $null
}

function Find-BuiltArtifact([string] $DistDir, [string] $Arch, [bool] $UseBaseline) {
    $targetName = if ($UseBaseline) { "cli-windows-$Arch-baseline" } else { "cli-windows-$Arch" }
    $preferred = Join-Path $DistDir "$targetName\bin\closecode.exe"
    if (Test-Path -LiteralPath $preferred) { return (Get-Item -LiteralPath $preferred).FullName }
    $candidates = Get-ChildItem -LiteralPath $DistDir -Directory -Filter "cli-windows-*" -ErrorAction SilentlyContinue |
        ForEach-Object { Join-Path $_.FullName "bin\closecode.exe" } |
        Where-Object { Test-Path -LiteralPath $_ } |
        ForEach-Object { Get-Item -LiteralPath $_ } |
        Sort-Object LastWriteTime -Descending
    if (-not $candidates) { return $null }
    return $candidates[0].FullName
}

function Get-NpmTargetPaths([string] $Root) {
    $paths = @()
    foreach ($scope in @("@opencode", "@opencode-ai")) {
        $scoped = Join-Path $Root $scope
        if (-not (Test-Path -LiteralPath $scoped)) { continue }
        foreach ($dir in Get-ChildItem -LiteralPath $scoped -Directory -Filter "cli-windows-*" -ErrorAction SilentlyContinue) {
            $paths += Join-Path $dir.FullName "bin\closecode.exe"
        }
    }
    return $paths
}

function Get-ShimTargetPaths {
    $paths = @()
    foreach ($command in @(Get-Command closecode -All -ErrorAction SilentlyContinue)) {
        $source = $command.Source
        if (-not $source -or -not (Test-Path -LiteralPath $source)) { continue }
        if ($source -match "\.exe$") { $paths += $source; continue }
        $content = Get-Content -LiteralPath $source -Raw -ErrorAction SilentlyContinue
        if (-not $content) { continue }
        $dir = Split-Path -Parent $source
        foreach ($match in [regex]::Matches($content, "[""']([^""']*closecode\.exe)[""']")) {
            $relative = $match.Groups[1].Value -replace [regex]::Escape('$basedir'), "" -replace [regex]::Escape('%~dp0'), ""
            $relative = $relative.TrimStart('\', '/') -replace '/', '\'
            if (-not $relative) { continue }
            $candidate = if ($relative -match '^[A-Za-z]:\\' -or $relative.StartsWith('\\')) {
                $relative
            } else {
                Join-Path $dir $relative
            }
            if (Test-Path -LiteralPath $candidate) { $paths += $candidate }
        }
    }
    return @($paths | Select-Object -Unique)
}

function Stop-CloseCodeProcesses {
    $running = @(Get-Process -Name closecode -ErrorAction SilentlyContinue)
    if (-not $running) { return }
    $pids = ($running | Select-Object -ExpandProperty Id) -join ', '
    Write-Info "Stopping $($running.Count) running closecode process(es): $pids"
    $running | Stop-Process -Force -ErrorAction SilentlyContinue
    $deadline = (Get-Date).AddSeconds(10)
    while ((Get-Date) -lt $deadline) {
        if (-not (Get-Process -Name closecode -ErrorAction SilentlyContinue)) { return }
        Start-Sleep -Milliseconds 250
    }
    $still = @(Get-Process -Name closecode -ErrorAction SilentlyContinue)
    if ($still) {
        throw "closecode is still running (PID $(($still | Select-Object -ExpandProperty Id) -join ', ')); close it and retry."
    }
}

function Copy-Binary([string] $Source, [string] $Target, [bool] $SkipBackup, $Rollback) {
    $parent = Split-Path -Parent $Target
    if (-not (Test-Path -LiteralPath $parent)) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
    $existed = Test-Path -LiteralPath $Target
    $backup = $null
    if ($existed -and -not $SkipBackup) {
        $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
        $backup = "$Target.bak-$stamp"
        Copy-Item -LiteralPath $Target -Destination $backup -Force
        Write-Info "Backed up $Target -> $backup"
    }
    [void] $Rollback.Add([pscustomobject]@{ Target = $Target; Backup = $backup; Created = (-not $existed) })
    try {
        Copy-Item -LiteralPath $Source -Destination $Target -Force
    } catch {
        Write-Fail "Failed to overwrite $Target"
        Write-Fail "  $($_.Exception.Message)"
        Write-Note "  The file may be locked by another process. Close any running closecode"
        Write-Note "  instance, close editors/indexers, then re-run this script."
        $holders = @(Get-Process -Name closecode -ErrorAction SilentlyContinue)
        if ($holders) { Write-Note "  Running closecode PID(s): $(($holders | Select-Object -ExpandProperty Id) -join ', ')" }
        throw
    }
}

function Invoke-InstallRollback($Rollback) {
    if ($Rollback.Count -eq 0) { return }
    Write-Note "Install failed; rolling back $($Rollback.Count) change(s)..."
    for ($i = $Rollback.Count - 1; $i -ge 0; $i--) {
        $entry = $Rollback[$i]
        try {
            if ($entry.Backup -and (Test-Path -LiteralPath $entry.Backup)) {
                Copy-Item -LiteralPath $entry.Backup -Destination $entry.Target -Force
                Remove-Item -LiteralPath $entry.Backup -Force -ErrorAction SilentlyContinue
                Write-Info "Restored $($entry.Target)"
            } elseif ($entry.Created) {
                Remove-Item -LiteralPath $entry.Target -Force -ErrorAction SilentlyContinue
                Write-Info "Removed new $($entry.Target)"
            }
        } catch {
            Write-Fail "Rollback failed for $($entry.Target): $($_.Exception.Message)"
        }
    }
}

function Update-PackageVersion([string] $PackageDir, [string] $NewVersion) {
    $packageJson = Join-Path $PackageDir "package.json"
    if (-not (Test-Path -LiteralPath $packageJson)) { return $false }
    $json = Get-Content -LiteralPath $packageJson -Raw | ConvertFrom-Json
    if ($json.version -eq $NewVersion) { return $false }
    $json.version = $NewVersion
    if ($json.optionalDependencies) {
        foreach ($name in @($json.optionalDependencies.PSObject.Properties.Name)) {
            if ($name -like "@opencode/cli-*" -or $name -like "@opencode-ai/cli-*") { $json.optionalDependencies.$name = $NewVersion }
        }
    }
    $jsonText = $json | ConvertTo-Json -Depth 10
    [System.IO.File]::WriteAllText($packageJson, $jsonText, [System.Text.UTF8Encoding]::new($false))
    return $true
}

function Test-InstalledBinary([string] $Path, [string] $ExpectedVersion) {
    $output = & $Path --version 2>&1 | Out-String
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($output)) {
        throw "Installed binary failed to start: $Path`n$output"
    }
    $lines = @($output.Trim() -split "`r?`n" | Where-Object { $_ })
    if ($ExpectedVersion) {
        $pattern = "(?<!\d)$([regex]::Escape($ExpectedVersion))(?!\d)"
        if (-not ($lines | Where-Object { $_ -match $pattern })) {
            throw "Version mismatch at ${Path}: expected $ExpectedVersion but binary reported:`n$($output.Trim())"
        }
    }
    return $lines | Select-Object -First 1
}

function Add-UserPathEntry([string] $Entry) {
    $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
    $entries = @()
    if ($userPath) { $entries = @($userPath -split ';' | Where-Object { $_ }) }
    if ($entries -contains $Entry) { return $false }
    $newValue = if ($userPath) { "$userPath;$Entry" } else { $Entry }
    [Environment]::SetEnvironmentVariable("Path", $newValue, "User")
    return $true
}

if ($Help) {
    Get-Help $PSCommandPath -Full
    exit 0
}

if ($DryRun) { $WhatIfPreference = $true }
$script:dryRun = [bool] $WhatIfPreference

try {
    if ($script:dryRun) { Write-Note "Dry run: no files will be changed." }

    # --- Resolve repo layout -------------------------------------------------
    $repoRoot = Split-Path -Parent $PSScriptRoot
    $cliDir = Join-Path $repoRoot "packages\cli"
    $buildScript = Join-Path $cliDir "script\build.ts"
    if (-not (Test-Path -LiteralPath $buildScript)) {
        throw "Build script not found: $buildScript (run this script from <repo>\script)."
    }

    if (-not $Version) {
        $rootPackageJson = Join-Path $repoRoot "package.json"
        if (Test-Path -LiteralPath $rootPackageJson) {
            $Version = (Get-Content -LiteralPath $rootPackageJson -Raw | ConvertFrom-Json).version
        }
        if (-not $Version) {
            throw "Could not read a version from $rootPackageJson. Pass -Version explicitly."
        }
    }

    Write-Head "CloseCode installer"
    Write-Info "Repo root: $repoRoot"
    Write-Info "Version:   $Version"
    Write-Info "Channel:   $Channel"

    # --- Architecture --------------------------------------------------------
    $arch = Get-TargetArch
    $useBaseline = [bool] ($Baseline -and $arch -eq "x64")
    if ($Baseline -and $arch -ne "x64") {
        Write-Note "-Baseline only applies to x64 builds; ignoring for $arch."
    }
    $distDir = Join-Path $cliDir "dist"
    $targetName = if ($useBaseline) { "cli-windows-$arch-baseline" } else { "cli-windows-$arch" }
    $expectedArtifact = Join-Path $distDir "$targetName\bin\closecode.exe"
    Write-Info "Arch:      $arch$(if ($useBaseline) { ' (baseline)' } else { '' })"

    # --- Resolve the source binary ------------------------------------------
    $sourceExe = $null
    if ($Binary) {
        Write-Head "Using pre-built binary"
        if (-not (Test-Path -LiteralPath $Binary)) { throw "Binary not found: $Binary" }
        $sourceExe = (Get-Item -LiteralPath $Binary).FullName
        Write-Ok "Source: $sourceExe"
    } else {
        $existingArtifact = Find-BuiltArtifact $distDir $arch $useBaseline
        if ($NoBuild) {
            Write-Head "Skipping build (-NoBuild)"
            $sourceExe = $existingArtifact
            if (-not $sourceExe) {
                if ($script:dryRun) {
                    $sourceExe = $expectedArtifact
                    Write-Note "No built artifact found; a build would produce $expectedArtifact."
                } else {
                    throw "No built closecode.exe found under $distDir. Run without -NoBuild, or pass -Binary."
                }
            } else {
                Write-Ok "Source: $sourceExe"
            }
        } else {
            Write-Head "Building $targetName"
            if ($script:dryRun) {
                Write-Note "Would run: bun run script/build.ts --single --skip-install$(if ($useBaseline) { ' --baseline' } else { '' })"
                $sourceExe = if ($existingArtifact) { $existingArtifact } else { $expectedArtifact }
            } elseif ($PSCmdlet.ShouldProcess($cliDir, "Build closecode v$Version ($targetName)")) {
                $bun = Get-Command bun -ErrorAction SilentlyContinue
                if (-not $bun) { throw "bun is not available on PATH; install Bun or pass -NoBuild -Binary <path>." }
                $running = @(Get-Process -Name closecode -ErrorAction SilentlyContinue)
                if ($running -and $PSCmdlet.ShouldProcess("closecode", "Stop running processes before build")) {
                    Stop-CloseCodeProcesses
                }
                $previousVersion = $env:OPENCODE_VERSION
                $previousChannel = $env:OPENCODE_CHANNEL
                $env:OPENCODE_VERSION = $Version
                $env:OPENCODE_CHANNEL = $Channel
                $buildArgs = @("run", "script/build.ts", "--single", "--skip-install")
                if ($useBaseline) { $buildArgs += "--baseline" }
                Push-Location $cliDir
                try {
                    & bun @buildArgs
                    $exit = $LASTEXITCODE
                } finally {
                    Pop-Location
                    $env:OPENCODE_VERSION = $previousVersion
                    $env:OPENCODE_CHANNEL = $previousChannel
                }
                if ($exit -ne 0) { throw "Build failed with exit code $exit." }
                if (-not (Test-Path -LiteralPath $expectedArtifact)) {
                    throw "Build finished but artifact is missing: $expectedArtifact"
                }
                $sourceExe = (Get-Item -LiteralPath $expectedArtifact).FullName
                Write-Ok "Built: $sourceExe"
            } else {
                $sourceExe = if ($existingArtifact) { $existingArtifact } else { $expectedArtifact }
                Write-Note "Build skipped; using $sourceExe."
            }
        }
    }

    # --- Collect install targets --------------------------------------------
    Write-Head "Install targets"
    $targets = New-Object System.Collections.Generic.List[object]
    $seen = New-Object System.Collections.Generic.HashSet[string] ([System.StringComparer]::OrdinalIgnoreCase)

    if (-not $SkipNpm) {
        $npmRoot = Get-NpmRootGlobal
        if ($npmRoot -and (Test-Path -LiteralPath $npmRoot)) {
            Write-Info "npm root: $npmRoot"
            foreach ($path in Get-NpmTargetPaths $npmRoot) {
                if (-not (Test-Path -LiteralPath $path)) { continue }
                if (-not $seen.Add($path)) { continue }
                $packageDir = Split-Path -Parent (Split-Path -Parent $path)
                [void] $targets.Add([pscustomobject]@{ Path = $path; Kind = "npm"; PackageDir = $packageDir })
            }
            foreach ($path in Get-ShimTargetPaths) {
                if (-not $seen.Add($path)) { continue }
                [void] $targets.Add([pscustomobject]@{ Path = $path; Kind = "shim"; PackageDir = $null })
            }
        } else {
            Write-Note "No npm global root found; skipping npm targets."
        }
    } else {
        Write-Info "Skipping npm targets (-SkipNpm)."
    }

    $standaloneDir = Join-Path $HOME ".opencode\bin"
    $standaloneExe = Join-Path $standaloneDir "closecode.exe"
    if (-not $SkipStandalone) {
        if ($seen.Add($standaloneExe)) {
            [void] $targets.Add([pscustomobject]@{ Path = $standaloneExe; Kind = "standalone"; PackageDir = $null })
        }
    } else {
        Write-Info "Skipping standalone target (-SkipStandalone)."
    }

    if ($targets.Count -eq 0) {
        Write-Note "No install targets found. Install @opencode/cli globally or check -SkipNpm/-SkipStandalone."
        exit 1
    }
    foreach ($target in $targets) {
        $state = if (Test-Path -LiteralPath $target.Path) { "overwrite" } else { "create" }
        Write-Ok "[$($target.Kind)] $state -> $($target.Path)"
    }

    # --- Stop running closecode ---------------------------------------------
    $running = @(Get-Process -Name closecode -ErrorAction SilentlyContinue)
    if ($running -and -not $script:dryRun -and $PSCmdlet.ShouldProcess("closecode", "Stop running processes")) {
        Stop-CloseCodeProcesses
    }

    # --- Install -------------------------------------------------------------
    Write-Head "Installing"
    $updatedPackages = New-Object System.Collections.Generic.List[string]
    $installed = New-Object System.Collections.Generic.List[string]
    $rollback = New-Object System.Collections.Generic.List[object]
    try {
        foreach ($target in $targets) {
            if ($PSCmdlet.ShouldProcess($target.Path, "Install closecode.exe")) {
                Copy-Binary $sourceExe $target.Path $NoBackup $rollback
                Write-Ok "Installed $($target.Path)"
            } else {
                Write-Info "Would install -> $($target.Path)"
            }
            $installed.Add($target.Path)
            if ($target.PackageDir) { $updatedPackages.Add($target.PackageDir) }
        }

        # --- Patch npm package versions -----------------------------------------
        if ($updatedPackages.Count -gt 0) {
            Write-Head "Updating package.json versions"
            foreach ($packageDir in @($updatedPackages | Select-Object -Unique)) {
                if ($PSCmdlet.ShouldProcess((Join-Path $packageDir "package.json"), "Set version $Version")) {
                    if (Update-PackageVersion $packageDir $Version) {
                        Write-Ok "Updated $(Split-Path -Leaf $packageDir) -> $Version"
                    } else {
                        Write-Info "$(Split-Path -Leaf $packageDir) already at $Version"
                    }
                } else {
                    Write-Info "Would set $(Split-Path -Leaf $packageDir) -> $Version"
                }
            }
        }

        # --- PATH handling for the standalone dir -------------------------------
        if (-not $SkipStandalone) {
            $pathEntries = @($env:PATH -split ';' | Where-Object { $_ })
            if ($pathEntries -notcontains $standaloneDir) {
                Write-Head "Standalone directory is not on PATH"
                if ($AddToPath) {
                    if ($PSCmdlet.ShouldProcess($standaloneDir, "Add to USER PATH")) {
                        if (Add-UserPathEntry $standaloneDir) {
                            Write-Ok "Added $standaloneDir to the USER PATH (restart your shell to pick it up)."
                        } else {
                            Write-Info "$standaloneDir is already in the USER PATH."
                        }
                    } else {
                        Write-Info "Would add $standaloneDir to the USER PATH."
                    }
                } else {
                    Write-Note "To add it, run (or pass -AddToPath):"
                    Write-Note "  setx PATH `"$env:PATH;$standaloneDir`""
                }
            }
        }

        # --- Verify --------------------------------------------------------------
        if ($script:dryRun) {
            Write-Head "Verification skipped (dry run)"
            Write-Ok "Dry run complete; no changes were made."
            exit 0
        }

        Write-Head "Verifying"
        $versions = New-Object System.Collections.Generic.List[string]
        foreach ($path in @($installed | Select-Object -Unique)) {
            if (-not (Test-Path -LiteralPath $path)) {
                throw "Expected installed binary not found: $path"
            }
            $version = Test-InstalledBinary $path $Version
            Write-Ok "$path -> $version"
            $versions.Add($version)
        }
    } catch {
        Invoke-InstallRollback $rollback
        throw
    }

    Write-Head "Done"
    Write-Ok "Installed $($installed.Count) target(s) at closecode $Version."
    if ($versions.Count -gt 0) {
        Write-Ok "Reported version: $($versions[0])"
    }
    exit 0
} catch {
    Write-Head "FAILED"
    Write-Fail $_.Exception.Message
    exit 1
}
