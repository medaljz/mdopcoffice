$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
New-Item -ItemType Directory -Force (Join-Path $root 'dist') | Out-Null
$target = Join-Path $root 'dist\OPC.exe'
if (Test-Path $target) { Remove-Item $target }
Add-Type -TypeDefinition (Get-Content -Raw (Join-Path $root 'native\Launcher.cs')) -Language CSharp -ReferencedAssemblies 'System.Windows.Forms.dll' -OutputAssembly $target -OutputType WindowsApplication
Write-Output $target
