<#
.SYNOPSIS
    Tests and packages the KSA Flight Deck Stream Deck plugin.

.DESCRIPTION
    Produces plugin\Release\com.novistrum.ksaflightdeck.streamDeckPlugin, which is a
    zip holding the .sdPlugin folder. Double-click it to install, or pass -Install.

.PARAMETER SkipTests
    Package without running the test suite.

.PARAMETER Install
    Install the built plugin into Stream Deck when packaging finishes.

.EXAMPLE
    .\build.ps1

.EXAMPLE
    .\build.ps1 -SkipTests -Install
#>

param(
    [switch]$SkipTests,
    [switch]$Install
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$pluginDir = Join-Path $root "plugin"
$sdName = "com.novistrum.ksaflightdeck.sdPlugin"
$sdDir = Join-Path $pluginDir ("src\" + $sdName)
$releaseDir = Join-Path $pluginDir "Release"
$packagePath = Join-Path $releaseDir ($sdName.Replace(".sdPlugin", "") + ".streamDeckPlugin")

if (-not (Test-Path $sdDir)) {
    throw "The plugin source is missing at $sdDir"
}

if (-not $SkipTests) {
    Write-Host "Running tests..." -ForegroundColor Cyan
    Push-Location $pluginDir
    try {
        & node --test --test-timeout=30000 test/*.test.js
        if ($LASTEXITCODE -ne 0) {
            throw "Tests failed"
        }
    }
    finally {
        Pop-Location
    }
}

Write-Host "Staging $sdName" -ForegroundColor Cyan
$stage = Join-Path ([System.IO.Path]::GetTempPath()) "ksa-flight-deck-stage"
if (Test-Path $stage) {
    Remove-Item -Recurse -Force $stage
}
New-Item -ItemType Directory -Force -Path (Join-Path $stage $sdName) | Out-Null
Copy-Item -Path (Join-Path $sdDir "*") -Destination (Join-Path $stage $sdName) -Recurse -Force

Add-Type -AssemblyName System.IO.Compression.FileSystem
New-Item -ItemType Directory -Force -Path $releaseDir | Out-Null
if (Test-Path $packagePath) {
    Remove-Item $packagePath -Force
}

Write-Host "Packing $packagePath" -ForegroundColor Cyan
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [System.IO.Compression.ZipFile]::Open($packagePath, [System.IO.Compression.ZipArchiveMode]::Create)
try {
    # Entries are added by hand because CreateFromDirectory writes backslashes on
    # .NET Framework, and a plugin archive with Windows separators can fail to install.
    Get-ChildItem -Path $stage -Recurse -File | ForEach-Object {
        $relative = $_.FullName.Substring($stage.Length + 1).Replace("\", "/")
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
            $archive,
            $_.FullName,
            $relative,
            [System.IO.Compression.CompressionLevel]::Optimal
        ) | Out-Null
    }
}
finally {
    $archive.Dispose()
}
Remove-Item -Recurse -Force $stage

$archive = [System.IO.Compression.ZipFile]::OpenRead($packagePath)
try {
    $entries = $archive.Entries.Count
    $required = @(
        "$sdName/manifest.json",
        "$sdName/bin/plugin.js",
        "$sdName/lib/krpc-client.js",
        "$sdName/actions/readout-inspector.html",
        "$sdName/imgs/plugin.png"
    )
    foreach ($entry in $required) {
        if (-not ($archive.Entries | Where-Object { $_.FullName -eq $entry })) {
            throw "The package is missing $entry"
        }
    }
    Write-Host ("Package holds {0} files and every required part is present." -f $entries) -ForegroundColor Green
}
finally {
    $archive.Dispose()
}

$size = [Math]::Round((Get-Item $packagePath).Length / 1KB, 1)
Write-Host ("Built {0} ({1} KB)" -f $packagePath, $size) -ForegroundColor Green

if ($Install) {
    Write-Host "Installing into Stream Deck..." -ForegroundColor Cyan
    Start-Process $packagePath
}
