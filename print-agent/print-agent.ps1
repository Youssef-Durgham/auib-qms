# AUIB QMS - Local Print Agent
# Listens on http://localhost:9100 and sends ESC/POS bytes directly to
# the thermal printer via the Windows RAW print API.
# Compatible with PowerShell 2.0 / Windows 7.

$ErrorActionPreference = "Continue"

# --- Config -----------------------------------------------------------------
$PrinterName = "TX 80 Thermal"
$ListenPort  = 9100
$ScriptDir   = Split-Path -Parent $MyInvocation.MyCommand.Definition
$ConfigPath  = Join-Path $ScriptDir "config.txt"
$LogPath     = Join-Path $ScriptDir "agent.log"
$LogoPath    = Join-Path $ScriptDir "auib-logo.png"
$LogoCache   = Join-Path $ScriptDir "auib-logo.esc"
$LogoWidthPx = 240   # ~33mm wide on 80mm thermal

function Log-Line([string]$msg) {
    $line = ("{0}  {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $msg)
    Write-Host $line
    try { Add-Content -Path $LogPath -Value $line -ErrorAction SilentlyContinue } catch { }
}

if (Test-Path $ConfigPath) {
    $cfgLine = (Get-Content $ConfigPath -ErrorAction SilentlyContinue | Select-Object -First 1)
    if ($cfgLine) { $PrinterName = $cfgLine.Trim() }
}

Log-Line "AUIB Print Agent starting. Printer='$PrinterName', Port=$ListenPort"

# --- Load JavaScriptSerializer (works on PS 2.0) ---------------------------
Add-Type -AssemblyName System.Web.Extensions
$serializer = New-Object System.Web.Script.Serialization.JavaScriptSerializer

# --- Load & encode the AUIB logo as ESC/POS raster (GS v 0) ----------------
$LogoEscpos = $null
function Encode-LogoEscpos([string]$imgPath, [int]$targetWidth) {
    try {
        Add-Type -AssemblyName System.Drawing
    } catch {
        Log-Line "System.Drawing unavailable; skipping logo"
        return $null
    }
    if (-not (Test-Path $imgPath)) { Log-Line "Logo file not found: $imgPath"; return $null }

    try {
        $src = [System.Drawing.Image]::FromFile($imgPath)
        $ratio = $targetWidth / [double]$src.Width
        $targetHeight = [int][Math]::Round($src.Height * $ratio)
        # Thermal printer raster width must be a multiple of 8 dots.
        if (($targetWidth % 8) -ne 0) { $targetWidth = ([int]($targetWidth / 8)) * 8 }

        $bmp = New-Object System.Drawing.Bitmap $targetWidth, $targetHeight
        $g = [System.Drawing.Graphics]::FromImage($bmp)
        $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $g.SmoothingMode     = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        $g.PixelOffsetMode   = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $g.Clear([System.Drawing.Color]::White)
        $g.DrawImage($src, 0, 0, $targetWidth, $targetHeight)
        $g.Dispose()
        $src.Dispose()

        $widthBytes = [int]($targetWidth / 8)
        $raster = New-Object byte[] ($widthBytes * $targetHeight)

        # Fast pixel access via LockBits — O(w*h) but in raw memory,
        # 100-1000x faster than GetPixel in PowerShell 2.0.
        $rect = New-Object System.Drawing.Rectangle 0, 0, $targetWidth, $targetHeight
        $data = $bmp.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadOnly, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
        try {
            $stride = $data.Stride
            $totalBytes = $stride * $targetHeight
            $buffer = New-Object byte[] $totalBytes
            [System.Runtime.InteropServices.Marshal]::Copy($data.Scan0, $buffer, 0, $totalBytes)
        } finally {
            $bmp.UnlockBits($data)
        }
        $bmp.Dispose()

        # Buffer is BGRA. Threshold each pixel (below = black = print dot).
        for ($y = 0; $y -lt $targetHeight; $y++) {
            $rowOff = $y * $stride
            $rastRow = $y * $widthBytes
            for ($x = 0; $x -lt $targetWidth; $x++) {
                $off = $rowOff + ($x -shl 2)
                $luma = ($buffer[$off + 2] * 299 + $buffer[$off + 1] * 587 + $buffer[$off] * 114) / 1000
                if ($luma -lt 170) {
                    $raster[$rastRow + ($x -shr 3)] = [byte]($raster[$rastRow + ($x -shr 3)] -bor (1 -shl (7 - ($x -band 7))))
                }
            }
        }

        $xL = [byte]($widthBytes -band 0xFF)
        $xH = [byte](($widthBytes -shr 8) -band 0xFF)
        $yL = [byte]($targetHeight -band 0xFF)
        $yH = [byte](($targetHeight -shr 8) -band 0xFF)

        $out = New-Object System.Collections.Generic.List[byte]
        [void]$out.Add(0x1B); [void]$out.Add(0x61); [void]$out.Add(0x01)  # centre
        [void]$out.Add(0x1D); [void]$out.Add(0x76); [void]$out.Add(0x30); [void]$out.Add(0x00)
        [void]$out.Add($xL);  [void]$out.Add($xH);  [void]$out.Add($yL);  [void]$out.Add($yH)
        foreach ($b in $raster) { [void]$out.Add($b) }
        [void]$out.Add(0x0A)  # line feed after image
        Log-Line ("Logo encoded: {0}x{1} px" -f $targetWidth, $targetHeight)
        return ,($out.ToArray())
    } catch {
        Log-Line ("Logo encode failed: " + $_.Exception.Message)
        return $null
    }
}

# NOTE: logo encoding happens AFTER the HTTP listener starts so the health
# endpoint responds immediately even if encoding takes a moment.

# --- Win32 RAW printer API bindings ----------------------------------------
$typeSrc = @"
using System;
using System.Runtime.InteropServices;

public class RawPrinter {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
    public class DOCINFOA {
        [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
    }

    [DllImport("winspool.Drv", EntryPoint = "OpenPrinterA", SetLastError = true, CharSet = CharSet.Ansi, ExactSpelling = true)]
    public static extern bool OpenPrinter([MarshalAs(UnmanagedType.LPStr)] string szPrinter, out IntPtr hPrinter, IntPtr pd);

    [DllImport("winspool.Drv", EntryPoint = "ClosePrinter", SetLastError = true, ExactSpelling = true)]
    public static extern bool ClosePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "StartDocPrinterA", SetLastError = true, CharSet = CharSet.Ansi, ExactSpelling = true)]
    public static extern bool StartDocPrinter(IntPtr hPrinter, Int32 level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOA di);

    [DllImport("winspool.Drv", EntryPoint = "EndDocPrinter", SetLastError = true, ExactSpelling = true)]
    public static extern bool EndDocPrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "StartPagePrinter", SetLastError = true, ExactSpelling = true)]
    public static extern bool StartPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "EndPagePrinter", SetLastError = true, ExactSpelling = true)]
    public static extern bool EndPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "WritePrinter", SetLastError = true, ExactSpelling = true)]
    public static extern bool WritePrinter(IntPtr hPrinter, byte[] pBytes, Int32 dwCount, out Int32 dwWritten);

    public static bool SendBytes(string printerName, byte[] bytes) {
        IntPtr hPrinter;
        if (!OpenPrinter(printerName, out hPrinter, IntPtr.Zero)) return false;
        try {
            DOCINFOA di = new DOCINFOA();
            di.pDocName = "AUIB Ticket";
            di.pDataType = "RAW";
            if (!StartDocPrinter(hPrinter, 1, di)) return false;
            if (!StartPagePrinter(hPrinter)) { EndDocPrinter(hPrinter); return false; }
            Int32 written = 0;
            bool ok = WritePrinter(hPrinter, bytes, bytes.Length, out written);
            EndPagePrinter(hPrinter);
            EndDocPrinter(hPrinter);
            return ok && written == bytes.Length;
        } finally {
            ClosePrinter(hPrinter);
        }
    }
}
"@
try {
    Add-Type -TypeDefinition $typeSrc -Language CSharp -ErrorAction Stop
} catch {
    Log-Line ("Failed to load RawPrinter type: " + $_.Exception.Message)
    Start-Sleep 10
    exit 1
}

# --- ESC/POS builders -------------------------------------------------------
function Add-Bytes($list, $arr) { foreach ($b in $arr) { [void]$list.Add([byte]$b) } }
function Add-Text($list, [string]$text) {
    $bytes = [System.Text.Encoding]::GetEncoding(437).GetBytes($text)
    foreach ($b in $bytes) { [void]$list.Add([byte]$b) }
}

function Build-TicketBytes($number, $category, $date, $time, $position) {
    $buf = New-Object System.Collections.Generic.List[byte]

    Add-Bytes $buf @(0x1B, 0x40)                 # ESC @ - init
    Add-Bytes $buf @(0x1B, 0x61, 0x01)           # centre

    # --- Logo (centred) ----------------------------------------------------
    if ($LogoEscpos) { Add-Bytes $buf $LogoEscpos }

    # --- University name ---------------------------------------------------
    Add-Bytes $buf @(0x1D, 0x21, 0x01)           # double height
    Add-Bytes $buf @(0x1B, 0x45, 0x01)           # bold
    Add-Text  $buf "AUIB`n"
    Add-Bytes $buf @(0x1D, 0x21, 0x00)
    Add-Bytes $buf @(0x1B, 0x45, 0x00)
    Add-Text  $buf "American University of Iraq`n"
    Add-Text  $buf "- Baghdad -`n`n"

    # --- Heavy divider -----------------------------------------------------
    Add-Text  $buf "================================`n`n"

    # --- YOUR TICKET inverted banner --------------------------------------
    Add-Bytes $buf @(0x1D, 0x42, 0x01)           # GS B 1 = reverse ON
    Add-Bytes $buf @(0x1B, 0x45, 0x01)           # bold
    Add-Text  $buf "     Y O U R   T I C K E T     "
    Add-Bytes $buf @(0x1B, 0x45, 0x00)
    Add-Bytes $buf @(0x1D, 0x42, 0x00)           # GS B 0 = reverse OFF
    Add-Text  $buf "`n`n"

    # --- Huge ticket number -----------------------------------------------
    Add-Bytes $buf @(0x1D, 0x21, 0x77)           # 8x size (both dims)
    Add-Bytes $buf @(0x1B, 0x45, 0x01)
    Add-Text  $buf ("{0}`n" -f $number)
    Add-Bytes $buf @(0x1B, 0x45, 0x00)
    Add-Bytes $buf @(0x1D, 0x21, 0x00)
    Add-Text  $buf "`n"

    # --- Category pill -----------------------------------------------------
    if ($category) {
        Add-Bytes $buf @(0x1D, 0x21, 0x11)       # 2x size
        Add-Bytes $buf @(0x1B, 0x45, 0x01)
        Add-Text  $buf ("> {0} <`n" -f $category)
        Add-Bytes $buf @(0x1B, 0x45, 0x00)
        Add-Bytes $buf @(0x1D, 0x21, 0x00)
        Add-Text  $buf "`n"
    }

    # --- Info table --------------------------------------------------------
    Add-Text  $buf "- - - - - - - - - - - - - - - -`n"
    Add-Bytes $buf @(0x1B, 0x61, 0x00)           # left
    Add-Text  $buf ("  Date       : {0}`n" -f $date)
    Add-Text  $buf ("  Time       : {0}`n" -f $time)
    Add-Text  $buf ("  Position   : #{0}`n" -f $position)
    Add-Bytes $buf @(0x1B, 0x61, 0x01)           # centre
    Add-Text  $buf "- - - - - - - - - - - - - - - -`n`n"

    # --- Thank you ---------------------------------------------------------
    Add-Bytes $buf @(0x1D, 0x21, 0x11)           # 2x
    Add-Bytes $buf @(0x1B, 0x45, 0x01)
    Add-Text  $buf "THANK YOU`n"
    Add-Bytes $buf @(0x1B, 0x45, 0x00)
    Add-Bytes $buf @(0x1D, 0x21, 0x00)
    Add-Text  $buf "`n"
    Add-Text  $buf "Please wait for your number`n"
    Add-Text  $buf "   to be called at a counter.`n`n"

    # --- Footer ------------------------------------------------------------
    Add-Text  $buf "================================`n"
    Add-Bytes $buf @(0x1B, 0x45, 0x01)
    Add-Text  $buf "        auib.edu.iq`n"
    Add-Bytes $buf @(0x1B, 0x45, 0x00)
    Add-Text  $buf "`n`n`n"

    Add-Bytes $buf @(0x1D, 0x56, 0x01)           # partial cut

    return ,($buf.ToArray())
}

function Send-Response($ctx, [int]$status, [hashtable]$body) {
    $ctx.Response.StatusCode = $status
    $ctx.Response.ContentType = "application/json"
    $ctx.Response.Headers.Add("Access-Control-Allow-Origin", "*")
    $ctx.Response.Headers.Add("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
    $ctx.Response.Headers.Add("Access-Control-Allow-Headers", "Content-Type")
    $json = $serializer.Serialize($body)
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
    $ctx.Response.ContentLength64 = $bytes.Length
    $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    $ctx.Response.OutputStream.Close()
}

# --- HTTP listener ----------------------------------------------------------
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$ListenPort/")
$listener.Prefixes.Add("http://127.0.0.1:$ListenPort/")
try {
    $listener.Start()
} catch {
    Log-Line ("ERROR: Could not bind port {0}: {1}" -f $ListenPort, $_.Exception.Message)
    Start-Sleep 10
    exit 1
}
Log-Line "Agent ONLINE at http://localhost:$ListenPort"

# Prefer cached encoded logo (instant). Only re-encode if cache is missing
# or the source PNG is newer than the cache.
$LogoEscpos = $null
$needEncode = $true
if ((Test-Path $LogoCache) -and (Test-Path $LogoPath)) {
    $cacheTime = (Get-Item $LogoCache).LastWriteTimeUtc
    $pngTime   = (Get-Item $LogoPath).LastWriteTimeUtc
    if ($cacheTime -ge $pngTime) {
        try {
            $LogoEscpos = [System.IO.File]::ReadAllBytes($LogoCache)
            Log-Line ("Logo loaded from cache ({0} bytes)" -f $LogoEscpos.Length)
            $needEncode = $false
        } catch {
            Log-Line ("Cache read failed: " + $_.Exception.Message)
        }
    }
}
if ($needEncode) {
    $LogoEscpos = Encode-LogoEscpos $LogoPath $LogoWidthPx
    if ($LogoEscpos) {
        try {
            [System.IO.File]::WriteAllBytes($LogoCache, $LogoEscpos)
            Log-Line "Logo cache written"
        } catch {
            Log-Line ("Cache write failed: " + $_.Exception.Message)
        }
    }
}

while ($listener.IsListening) {
    try {
        $context = $listener.GetContext()
        $req = $context.Request
        $path = $req.Url.AbsolutePath

        if ($req.HttpMethod -eq "OPTIONS") {
            Send-Response $context 200 @{ ok = $true }
            continue
        }

        if ($path -eq "/" -or $path -eq "/health") {
            Send-Response $context 200 @{ ok = $true; printer = $PrinterName }
            continue
        }

        if ($path -eq "/print" -and $req.HttpMethod -eq "POST") {
            $reader = New-Object System.IO.StreamReader($req.InputStream, [System.Text.Encoding]::UTF8)
            $body = $reader.ReadToEnd()
            $reader.Close()

            try {
                $parsed = $serializer.DeserializeObject($body)
            } catch {
                Send-Response $context 400 @{ ok = $false; error = "invalid JSON" }
                continue
            }

            $number   = $parsed["number"]
            $category = $parsed["category"]
            $date     = $parsed["date"]
            $time     = $parsed["time"]
            $position = $parsed["position"]

            $bytes = Build-TicketBytes $number $category $date $time $position
            $ok = [RawPrinter]::SendBytes($PrinterName, $bytes)
            if ($ok) {
                Log-Line ("Printed #{0} [{1}]" -f $number, $category)
                Send-Response $context 200 @{ ok = $true }
            } else {
                $err = [System.Runtime.InteropServices.Marshal]::GetLastWin32Error()
                Log-Line ("Print FAILED (Win32={0}) printer='{1}'" -f $err, $PrinterName)
                Send-Response $context 500 @{ ok = $false; error = "print failed"; win32 = $err; printer = $PrinterName }
            }
            continue
        }

        Send-Response $context 404 @{ ok = $false; error = "not found" }
    } catch {
        Log-Line ("Request error: " + $_.Exception.Message)
    }
}
