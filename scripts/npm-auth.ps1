<#
.SYNOPSIS
  Run an npm command that needs the maintainer token, without the token ever living in a file.

.DESCRIPTION
  The token is stored as a generic credential in the Windows Credential Manager - the same store
  `gh` uses, protected per-user by DPAPI - under the target name below. Nothing is written to
  ~\.npmrc, so no other tool, agent or dotfile sync on this machine can read it by accident.

  `run` pulls it out, writes a throwaway npmrc into the user's temp directory, invokes npm with
  `--userconfig <that file>`, and deletes the file in a finally block. The alternative - passing the
  token as a CLI flag or an env var - leaves it visible in the process list to anything running as
  this user for the lifetime of the command.

  Publishing from CI never touches any of this: releases go through npm's OIDC trusted publishing,
  which needs no credential in the repository or on any runner. This exists for the small number of
  local maintenance commands (dist-tag, owner, unpublish, deprecate) that OIDC cannot do.

.EXAMPLE
  Set-Content token.txt | .\scripts\npm-auth.ps1 save      # store from stdin (never on the command line)
  .\scripts\npm-auth.ps1 status
  .\scripts\npm-auth.ps1 run npm whoami --registry=https://registry.npmjs.org/
  .\scripts\npm-auth.ps1 delete
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true, Position = 0)]
  [ValidateSet('save', 'run', 'status', 'delete')]
  [string]$Action,

  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$Rest
)

$ErrorActionPreference = 'Stop'
$Target = 'cline-kit/npm-maintainer-token'
$RegistryHost = 'registry.npmjs.org'

if (-not ('CredStore' -as [type])) {
  Add-Type -Namespace CredStore -Name Native -MemberDefinition @'
[System.Runtime.InteropServices.DllImport("advapi32.dll", SetLastError = true, CharSet = System.Runtime.InteropServices.CharSet.Unicode)]
public static extern bool CredWrite(ref CREDENTIAL Credential, int Flags);

[System.Runtime.InteropServices.DllImport("advapi32.dll", SetLastError = true, CharSet = System.Runtime.InteropServices.CharSet.Unicode)]
public static extern bool CredRead(string target, int type, int flags, ref System.IntPtr Credential);

[System.Runtime.InteropServices.DllImport("advapi32.dll", SetLastError = true, CharSet = System.Runtime.InteropServices.CharSet.Unicode)]
public static extern bool CredDelete(string target, int type, int flags);

[System.Runtime.InteropServices.DllImport("advapi32.dll", SetLastError = true)]
public static extern void CredFree(System.IntPtr cred);

[System.Runtime.InteropServices.StructLayout(System.Runtime.InteropServices.LayoutKind.Sequential, CharSet = System.Runtime.InteropServices.CharSet.Unicode)]
public struct CREDENTIAL {
  public int Flags;
  public int Type;
  public string TargetName;
  public string Comment;
  public long LastWritten;
  public int CredentialBlobSize;
  public System.IntPtr CredentialBlob;
  public int Persist;
  public int AttributeCount;
  public System.IntPtr Attributes;
  public string TargetAlias;
  public string UserName;
}
'@
}

$CRED_TYPE_GENERIC = 1
$CRED_PERSIST_LOCAL_MACHINE = 2

function Get-StoredToken {
  $ptr = [System.IntPtr]::Zero
  if (-not [CredStore.Native]::CredRead($Target, $CRED_TYPE_GENERIC, 0, [ref]$ptr)) { return $null }
  try {
    $cred = [System.Runtime.InteropServices.Marshal]::PtrToStructure($ptr, [type][CredStore.Native+CREDENTIAL])
    if ($cred.CredentialBlobSize -le 0) { return $null }
    return [System.Runtime.InteropServices.Marshal]::PtrToStringUni($cred.CredentialBlob, [int]($cred.CredentialBlobSize / 2))
  } finally {
    [CredStore.Native]::CredFree($ptr)
  }
}

function Set-StoredToken([string]$Secret) {
  $bytes = [System.Text.Encoding]::Unicode.GetBytes($Secret)
  $blob = [System.Runtime.InteropServices.Marshal]::AllocHGlobal($bytes.Length)
  [System.Runtime.InteropServices.Marshal]::Copy($bytes, 0, $blob, $bytes.Length)
  try {
    $cred = New-Object CredStore.Native+CREDENTIAL
    $cred.Type = $CRED_TYPE_GENERIC
    $cred.TargetName = $Target
    $cred.UserName = 'npm-maintainer'
    $cred.Comment = 'cline-kit local maintenance; CI releases use OIDC and never read this'
    $cred.CredentialBlob = $blob
    $cred.CredentialBlobSize = $bytes.Length
    $cred.Persist = $CRED_PERSIST_LOCAL_MACHINE
    if (-not [CredStore.Native]::CredWrite([ref]$cred, 0)) {
      throw ("CredWrite failed with Win32 error " + [System.Runtime.InteropServices.Marshal]::GetLastWin32Error())
    }
  } finally {
    [System.Runtime.InteropServices.Marshal]::FreeHGlobal($blob)
  }
}

switch ($Action) {

  'save' {
    # Read from the pipeline so the secret never appears in the command line or shell history.
    $Secret = ([Console]::In.ReadToEnd()).Trim()
    if (-not $Secret) { throw 'nothing received on stdin; refusing to store an empty token' }
    if ($Secret -notmatch '^npm_[A-Za-z0-9]{20,}$') { throw 'input does not look like an npm access token' }
    Set-StoredToken $Secret
    Write-Output ("stored in Windows Credential Manager as '" + $Target + "' (" + $Secret.Length + " chars)")
  }

  'status' {
    $t = Get-StoredToken
    if ($t) { Write-Output ("present: " + $Target + " (" + $t.Length + " chars)") }
    else { Write-Output "absent: $Target" }
  }

  'delete' {
    if ([CredStore.Native]::CredDelete($Target, $CRED_TYPE_GENERIC, 0)) { Write-Output "deleted: $Target" }
    else { Write-Output "nothing to delete" }
  }

  'run' {
    if (-not $Rest -or $Rest.Count -lt 1) { throw 'usage: npm-auth.ps1 run npm <args...>' }
    $Secret = Get-StoredToken
    if (-not $Secret) { throw "no token stored; run 'save' first" }

    # A one-off npmrc, created only for the lifetime of this process, then removed even on failure.
    $Tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("cline-kit-npmrc-" + [Guid]::NewGuid().ToString('N') + ".txt")
    try {
      $lines = @("//${RegistryHost}/:_authToken=$Secret")
      # Keep whatever registry the user configured; only the auth line is ours.
      $userNpmrc = Join-Path $env:USERPROFILE '.npmrc'
      if (Test-Path $userNpmrc) {
        $lines += (Get-Content $userNpmrc | Where-Object { $_ -notmatch '_authToken' })
      }
      [System.IO.File]::WriteAllText($Tmp, ($lines -join "`r`n") + "`r`n", (New-Object System.Text.UTF8Encoding($false)))
      # Splat a variable. `& exe @(a + b)` passes the array as ONE joined argument, which is how npm
      # ends up seeing "config get registry --userconfig C:\..." as a single command name.
      $argList = @()
      if ($Rest.Count -gt 1) {
        $argList += $Rest[1..($Rest.Count - 1)]
      }
      $argList += @('--userconfig', $Tmp)
      & $Rest[0] @argList
      exit $LASTEXITCODE
    } finally {
      Remove-Item -LiteralPath $Tmp -Force -ErrorAction SilentlyContinue
    }
  }
}
