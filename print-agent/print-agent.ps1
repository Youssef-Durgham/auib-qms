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

    Add-Bytes $buf @(0x1D, 0x21, 0x00)           # normal size
    Add-Bytes $buf @(0x1B, 0x45, 0x01)           # bold on
    Add-Text  $buf "AUIB`n"
    Add-Bytes $buf @(0x1B, 0x45, 0x00)           # bold off
    Add-Text  $buf "American University in Iraq, Baghdad`n"
    Add-Text  $buf "------------------------------`n"
    Add-Text  $buf "YOUR TICKET`n`n"

    Add-Bytes $buf @(0x1D, 0x21, 0x77)           # huge 8x8
    Add-Bytes $buf @(0x1B, 0x45, 0x01)
    Add-Text  $buf ("{0}`n" -f $number)
    Add-Bytes $buf @(0x1B, 0x45, 0x00)
    Add-Bytes $buf @(0x1D, 0x21, 0x00)

    if ($category) {
        Add-Text  $buf "`n"
        Add-Bytes $buf @(0x1D, 0x21, 0x11)       # medium 2x2
        Add-Text  $buf ("[ {0} ]`n" -f $category)
        Add-Bytes $buf @(0x1D, 0x21, 0x00)
    }

    Add-Text  $buf "`n"
    Add-Bytes $buf @(0x1B, 0x61, 0x00)           # left align
    Add-Text  $buf "------------------------------`n"
    Add-Text  $buf ("Date     : {0}`n" -f $date)
    Add-Text  $buf ("Time     : {0}`n" -f $time)
    Add-Text  $buf ("Position : #{0}`n" -f $position)
    Add-Text  $buf "------------------------------`n"
    Add-Bytes $buf @(0x1B, 0x61, 0x01)
    Add-Text  $buf "Thank you`n`n`n`n"

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
