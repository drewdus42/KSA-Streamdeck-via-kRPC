<#
.SYNOPSIS
    Draws every icon and default key image the manifest refers to.

.DESCRIPTION
    Each icon is drawn once at 288 pixels and scaled down, so the 20 pixel action
    list icons and the 144 pixel key images come from the same artwork. Simple
    geometry is used on purpose: it stays legible at 20 pixels, where text does not.

    Run from the plugin folder:  powershell -File tools\make-icons.ps1
#>

Add-Type -AssemblyName System.Drawing

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$out = Join-Path $root "src\com.novistrum.ksaflightdeck.sdPlugin\imgs"
New-Item -ItemType Directory -Force -Path $out | Out-Null

$MASTER = 288

function New-Canvas([string]$background) {
    $bitmap = New-Object System.Drawing.Bitmap($MASTER, $MASTER)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $graphics.Clear([System.Drawing.Color]::Transparent)
    $brush = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml($background))
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $radius = 56
    $size = $MASTER
    $path.AddArc(0, 0, $radius * 2, $radius * 2, 180, 90)
    $path.AddArc($size - $radius * 2, 0, $radius * 2, $radius * 2, 270, 90)
    $path.AddArc($size - $radius * 2, $size - $radius * 2, $radius * 2, $radius * 2, 0, 90)
    $path.AddArc(0, $size - $radius * 2, $radius * 2, $radius * 2, 90, 90)
    $path.CloseFigure()
    $graphics.FillPath($brush, $path)
    $brush.Dispose()
    $path.Dispose()
    return @{ Bitmap = $bitmap; Graphics = $graphics }
}

function Get-Pen([string]$colour, [double]$width) {
    $pen = New-Object System.Drawing.Pen([System.Drawing.ColorTranslator]::FromHtml($colour), $width)
    $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    return $pen
}

function Get-Brush([string]$colour) {
    return New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml($colour))
}

function Draw-Status($graphics, [string]$accent) {
    $pen = Get-Pen $accent 14
    $graphics.DrawEllipse($pen, 74, 74, 140, 140)
    $brush = Get-Brush $accent
    $graphics.FillEllipse($brush, 116, 116, 56, 56)
    $brush.Dispose()
    $pen.Dispose()
}

function Draw-Readout($graphics, [string]$accent) {
    $brush = Get-Brush $accent
    $graphics.FillRectangle($brush, 70, 160, 40, 60)
    $graphics.FillRectangle($brush, 124, 110, 40, 110)
    $graphics.FillRectangle($brush, 178, 70, 40, 150)
    $brush.Dispose()
}

function Draw-Sequence($graphics, [string]$accent) {
    $pen = Get-Pen $accent 16
    foreach ($y in @(96, 144, 192)) {
        $points = @(
            (New-Object System.Drawing.PointF(96, [single]($y + 18))),
            (New-Object System.Drawing.PointF(144, [single]($y - 14))),
            (New-Object System.Drawing.PointF(192, [single]($y + 18)))
        )
        $graphics.DrawLines($pen, $points)
    }
    $pen.Dispose()
}

function Draw-Engine($graphics, [string]$accent) {
    $brush = Get-Brush $accent
    $body = @(
        (New-Object System.Drawing.PointF(96, 70)),
        (New-Object System.Drawing.PointF(192, 70)),
        (New-Object System.Drawing.PointF(160, 148)),
        (New-Object System.Drawing.PointF(128, 148))
    )
    $graphics.FillPolygon($brush, $body)
    $flame = @(
        (New-Object System.Drawing.PointF(128, 166)),
        (New-Object System.Drawing.PointF(160, 166)),
        (New-Object System.Drawing.PointF(144, 236))
    )
    $graphics.FillPolygon($brush, $flame)
    $brush.Dispose()
}

function Draw-Autopilot($graphics, [string]$accent) {
    $pen = Get-Pen $accent 14
    $graphics.DrawEllipse($pen, 74, 74, 140, 140)
    $graphics.DrawLine($pen, 144, 40, 144, 248)
    $graphics.DrawLine($pen, 40, 144, 248, 144)
    $pen.Dispose()
}

function Draw-Toggle($graphics, [string]$accent) {
    $track = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml("#334155"))
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $path.AddArc(74, 104, 80, 80, 90, 180)
    $path.AddArc(148, 104, 80, 80, 270, 180)
    $path.CloseFigure()
    $graphics.FillPath($track, $path)
    $path.Dispose()
    $track.Dispose()

    $brush = Get-Brush $accent
    $graphics.FillEllipse($brush, 86, 116, 56, 56)
    $brush.Dispose()
}

function Draw-Throttle($graphics, [string]$accent) {
    $brush = Get-Brush $accent
    $track = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml("#334155"))
    $graphics.FillRectangle($track, 128, 56, 32, 176)
    $graphics.FillRectangle($brush, 128, 118, 32, 114)
    $track.Dispose()
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $path.AddArc(88, 96, 44, 44, 90, 180)
    $path.AddArc(156, 96, 44, 44, 270, 180)
    $path.CloseFigure()
    $graphics.FillPath($brush, $path)
    $path.Dispose()
    $brush.Dispose()
}

function Draw-Warp($graphics, [string]$accent) {
    $pen = Get-Pen $accent 14
    $graphics.DrawEllipse($pen, 70, 70, 148, 148)
    $graphics.DrawLine($pen, 144, 144, 144, 92)
    $graphics.DrawLine($pen, 144, 144, 186, 160)
    $brush = Get-Brush $accent
    $graphics.FillEllipse($brush, 132, 132, 24, 24)
    $brush.Dispose()
    $pen.Dispose()
}

function Save-Scaled($bitmap, [string]$name, [int]$size) {
    $target = New-Object System.Drawing.Bitmap($size, $size)
    $graphics = [System.Drawing.Graphics]::FromImage($target)
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.Clear([System.Drawing.Color]::Transparent)
    $graphics.DrawImage($bitmap, 0, 0, $size, $size)
    $graphics.Dispose()
    $target.Save($name, [System.Drawing.Imaging.ImageFormat]::Png)
    $target.Dispose()
}

$icons = @(
    @{ Name = "plugin";     Background = "#0f172a"; Accent = "#38bdf8"; Draw = "Draw-Status" },
    @{ Name = "status";     Background = "#0f172a"; Accent = "#38bdf8"; Draw = "Draw-Status" },
    @{ Name = "readout";    Background = "#0f172a"; Accent = "#22d3ee"; Draw = "Draw-Readout" },
    @{ Name = "sequence";   Background = "#0f172a"; Accent = "#f59e0b"; Draw = "Draw-Sequence" },
    @{ Name = "engine";     Background = "#0f172a"; Accent = "#22c55e"; Draw = "Draw-Engine" },
    @{ Name = "autopilot";  Background = "#0f172a"; Accent = "#a855f7"; Draw = "Draw-Autopilot" },
    @{ Name = "toggle";     Background = "#0f172a"; Accent = "#0ea5e9"; Draw = "Draw-Toggle" },
    @{ Name = "throttle";   Background = "#0f172a"; Accent = "#14b8a6"; Draw = "Draw-Throttle" },
    @{ Name = "warp";       Background = "#0f172a"; Accent = "#c084fc"; Draw = "Draw-Warp" }
)

foreach ($icon in $icons) {
    $canvas = New-Canvas $icon.Background
    & $icon.Draw $canvas.Graphics $icon.Accent
    $canvas.Graphics.Dispose()

    if ($icon.Name -eq "plugin") {
        Save-Scaled $canvas.Bitmap (Join-Path $out "plugin.png") 28
        Save-Scaled $canvas.Bitmap (Join-Path $out "plugin@2x.png") 56
    } else {
        Save-Scaled $canvas.Bitmap (Join-Path $out ($icon.Name + ".png")) 20
        Save-Scaled $canvas.Bitmap (Join-Path $out ($icon.Name + "@2x.png")) 40
        Save-Scaled $canvas.Bitmap (Join-Path $out ($icon.Name + "-key.png")) 72
        Save-Scaled $canvas.Bitmap (Join-Path $out ($icon.Name + "-key@2x.png")) 144
    }
    $canvas.Bitmap.Dispose()
    Write-Output ("drew " + $icon.Name)
}

Get-ChildItem $out -Filter *.png | Measure-Object | ForEach-Object {
    Write-Output ("wrote " + $_.Count + " images to " + $out)
}
