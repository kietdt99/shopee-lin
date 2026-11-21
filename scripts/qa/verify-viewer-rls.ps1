# Interactive Viewer Auth/RLS smoke check. Run without arguments after configuring
# the project root URL and publishable key in ignored .env.local. The target must
# be localhost/loopback or the explicitly confirmed project; never pass credentials
# on the command line. Password input is SecureString and no session data is logged.
param()

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Net.Http

if ($args.Count -gt 0) {
  Write-Error 'This script does not accept command-line arguments.'
  exit 2
}

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$envPath = Join-Path $projectRoot '.env.local'
$expectedProjectRef = 'wrcaejfcifbvmzcuukrd'

function Stop-WithMessage([string]$Message) {
  throw $Message
}

function Read-LocalEnv([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    Stop-WithMessage 'Missing ignored .env.local. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY for local Supabase first.'
  }

  $values = @{}
  foreach ($line in Get-Content -LiteralPath $Path) {
    if ($line -match '^\s*(#|$)') { continue }
    $separator = $line.IndexOf('=')
    if ($separator -lt 1) { continue }
    $name = $line.Substring(0, $separator).Trim()
    if ($name -notin @('VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY')) { continue }
    $value = $line.Substring($separator + 1).Trim()
    if ($value.Length -ge 2 -and (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'")))) {
      $value = $value.Substring(1, $value.Length - 2)
    }
    $values[$name] = $value
  }

  if ([string]::IsNullOrWhiteSpace($values['VITE_SUPABASE_URL']) -or [string]::IsNullOrWhiteSpace($values['VITE_SUPABASE_PUBLISHABLE_KEY'])) {
    Stop-WithMessage '.env.local must contain VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.'
  }
  return $values
}

function Convert-ResponseJson([string]$Content) {
  try {
    return ($Content | ConvertFrom-Json -ErrorAction Stop)
  } catch {
    Stop-WithMessage 'Local Supabase returned an unexpected response format.'
  }
}

function Invoke-SupabaseRequest {
  param(
    [Parameter(Mandatory = $true)][string]$Method,
    [Parameter(Mandatory = $true)][string]$Path,
    [string]$JsonBody,
    [hashtable]$AdditionalHeaders = @{}
  )

  $request = $null
  $httpResponse = $null
  try {
    $uri = [Uri]::new($baseUrl.TrimEnd('/') + $Path)
    $httpMethod = [System.Net.Http.HttpMethod]::new($Method)
    $request = [System.Net.Http.HttpRequestMessage]::new($httpMethod, $uri)
    $null = $request.Headers.TryAddWithoutValidation('apikey', $publishableKey)
    if (-not [string]::IsNullOrWhiteSpace($accessToken)) {
      $request.Headers.Authorization = [System.Net.Http.Headers.AuthenticationHeaderValue]::new('Bearer', $accessToken)
    }
    foreach ($headerName in $AdditionalHeaders.Keys) {
      $null = $request.Headers.TryAddWithoutValidation([string]$headerName, [string]$AdditionalHeaders[$headerName])
    }
    if ($PSBoundParameters.ContainsKey('JsonBody')) {
      $request.Content = [System.Net.Http.StringContent]::new($JsonBody, [System.Text.Encoding]::UTF8, 'application/json')
    }

    $httpResponse = $httpClient.SendAsync($request).GetAwaiter().GetResult()
    $content = $httpResponse.Content.ReadAsStringAsync().GetAwaiter().GetResult()
    return [pscustomobject]@{
      StatusCode = [int]$httpResponse.StatusCode
      Content = $content
    }
  } catch {
    Stop-WithMessage ("Request to local Supabase failed for {0}. Check that local Supabase services are running." -f $Path.Split('?')[0])
  } finally {
    if ($null -ne $httpResponse) { $httpResponse.Dispose() }
    if ($null -ne $request) { $request.Dispose() }
  }
}

function Assert-HttpSuccess($Response, [string]$Operation) {
  if ($Response.StatusCode -lt 200 -or $Response.StatusCode -ge 300) {
    Stop-WithMessage ("{0} failed with HTTP {1}; response contents are intentionally suppressed." -f $Operation, $Response.StatusCode)
  }
}

function Assert-ViewerDeniedRpc([string]$Name, [hashtable]$Body) {
  $json = $Body | ConvertTo-Json -Depth 8 -Compress
  $response = Invoke-SupabaseRequest -Method 'POST' -Path ("/rest/v1/rpc/{0}" -f $Name) -JsonBody $json
  if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 300) {
    Stop-WithMessage ("Viewer unexpectedly executed admin RPC {0}." -f $Name)
  }
  $errorData = Convert-ResponseJson $response.Content
  if ($errorData.code -ne 'P0001' -or [string]$errorData.message -notmatch '^Only an admin can') {
    Stop-WithMessage ("RPC {0} did not reject the Viewer through its Admin role guard (HTTP {1}); response contents are suppressed." -f $Name, $response.StatusCode)
  }
  Write-Host ("PASS: Viewer denied by Admin guard for {0}." -f $Name)
}

$httpClient = $null
$publishableKey = $null
$accessToken = $null
$securePassword = $null
$plainPassword = $null
$authJson = $null
$bstr = [IntPtr]::Zero

try {
  $settings = Read-LocalEnv $envPath
  $baseUri = [Uri]::new($settings['VITE_SUPABASE_URL'])
  $isLocalTarget = $baseUri.Scheme -eq 'http' -and $baseUri.IsLoopback
  $isProductionTarget = $baseUri.Scheme -eq 'https' -and $baseUri.Host -eq ($expectedProjectRef + '.supabase.co')
  if (-not $isLocalTarget -and -not $isProductionTarget) {
    Stop-WithMessage 'Refusing to run: target must be loopback HTTP for local QA or this exact project HTTPS host. Arbitrary hosts are blocked.'
  }
  if ($baseUri.AbsolutePath -notin @('', '/')) {
    Stop-WithMessage 'VITE_SUPABASE_URL must be the project root URL, without a REST path.'
  }
  $baseUrl = $baseUri.GetLeftPart([System.UriPartial]::Authority)
  $publishableKey = $settings['VITE_SUPABASE_PUBLISHABLE_KEY']
  $settings = $null

  Write-Host ("Configured Supabase target host: {0}" -f $baseUri.Host)
  $typedProjectRef = Read-Host ("Type the exact project ref {0} to continue" -f $expectedProjectRef)
  if ($typedProjectRef -cne $expectedProjectRef) {
    Stop-WithMessage 'Project ref confirmation did not match; no API requests were sent.'
  }
  $typedProjectRef = $null
  if ($isLocalTarget) {
    Write-Host 'Target confirmed as local loopback; using only the local harness/development project.'
  } else {
    Write-Host 'Target confirmed as the configured project.'
  }

  $email = Read-Host 'Viewer email'
  if ([string]::IsNullOrWhiteSpace($email) -or $email -notmatch '^[^\s@]+@[^\s@]+\.[^\s@]+$') {
    Stop-WithMessage 'Enter a valid Viewer email address.'
  }
  $securePassword = Read-Host 'Viewer password' -AsSecureString
  if ($null -eq $securePassword -or $securePassword.Length -eq 0) {
    Stop-WithMessage 'Viewer password cannot be empty.'
  }

  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
  $plainPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  $authJson = @{ email = $email; password = $plainPassword } | ConvertTo-Json -Compress
  $httpClient = [System.Net.Http.HttpClient]::new()
  $httpClient.Timeout = [TimeSpan]::FromSeconds(20)

  $authResponse = Invoke-SupabaseRequest -Method 'POST' -Path '/auth/v1/token?grant_type=password' -JsonBody $authJson
  $authJson = $null
  $plainPassword = $null
  if ($bstr -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    $bstr = [IntPtr]::Zero
  }
  $securePassword.Dispose()
  $securePassword = $null
  if ($authResponse.StatusCode -ne 200) {
    Stop-WithMessage 'Viewer password sign-in failed; response contents are intentionally suppressed.'
  }
  $authData = Convert-ResponseJson $authResponse.Content
  $authResponse = $null
  if ([string]::IsNullOrWhiteSpace([string]$authData.access_token) -or [string]::IsNullOrWhiteSpace([string]$authData.user.id)) {
    Stop-WithMessage 'Local Auth response did not contain the expected session; contents are suppressed.'
  }
  $accessToken = [string]$authData.access_token
  $userId = [string]$authData.user.id
  $authData = $null

  $profileResponse = Invoke-SupabaseRequest -Method 'GET' -Path ("/rest/v1/profiles?select=id,role&id=eq.{0}" -f [Uri]::EscapeDataString($userId))
  Assert-HttpSuccess $profileResponse 'Viewer profile read'
  $profileRows = @(Convert-ResponseJson $profileResponse.Content)
  $profileResponse = $null
  if ($profileRows.Count -ne 1 -or $profileRows[0].id -ne $userId -or $profileRows[0].role -ne 'viewer') {
    Stop-WithMessage 'The signed-in account does not have exactly one Viewer profile.'
  }
  $profileRows = $null
  Write-Host 'PASS: signed-in profile has Viewer role.'

  $readPaths = @(
    '/rest/v1/orders?select=id&limit=1',
    '/rest/v1/payments?select=id&limit=1',
    '/rest/v1/payment_allocations?select=payment_id&limit=1',
    '/rest/v1/billing_cycles?select=id&limit=1',
    '/rest/v1/installment_plans?select=id&limit=1',
    '/rest/v1/installment_payments?select=id&limit=1',
    '/rest/v1/installment_summary?select=id&limit=1',
    '/rest/v1/ledger_entries?select=id&limit=1',
    '/rest/v1/cycle_closings?select=billing_cycle_id&limit=1'
  )
  foreach ($path in $readPaths) {
    $response = Invoke-SupabaseRequest -Method 'GET' -Path $path
    Assert-HttpSuccess $response ("Viewer read {0}" -f $path.Split('?')[0])
    Write-Host ("PASS: Viewer can read {0}." -f $path.Split('?')[0])
    $response = $null
  }

  $invalidPlan = @{ name = '__viewer_rls_probe__'; total_amount = 0 } | ConvertTo-Json -Compress
  $writeResponse = Invoke-SupabaseRequest -Method 'POST' -Path '/rest/v1/installment_plans' -JsonBody $invalidPlan -AdditionalHeaders @{ Prefer = 'return=minimal' }
  $invalidPlan = $null
  if ($writeResponse.StatusCode -ge 200 -and $writeResponse.StatusCode -lt 300) {
    Stop-WithMessage 'Viewer installment-plan write unexpectedly succeeded; stopping immediately.'
  }
  $writeError = Convert-ResponseJson $writeResponse.Content
  if ($writeError.code -ne '42501' -or [string]$writeError.message -notmatch 'row-level security|row level security') {
    Stop-WithMessage ("Viewer insert did not fail specifically at RLS (HTTP {0}); response contents are suppressed." -f $writeResponse.StatusCode)
  }
  $writeError = $null
  $writeResponse = $null
  Write-Host 'PASS: Viewer installment-plan insert was rejected by RLS before the positive-amount check; payload used amount zero.'

  $dummyId = '00000000-0000-0000-0000-000000000000'
  Assert-ViewerDeniedRpc 'record_order_payment' @{
    p_order_ids = @($dummyId)
    p_amount = 1
    p_paid_at = (Get-Date).ToString('yyyy-MM-dd')
    p_note = '__viewer_rls_probe__'
  }
  Assert-ViewerDeniedRpc 'cancel_order' @{
    p_order_id = $dummyId
    p_refund_amount = 0
    p_note = '__viewer_rls_probe__'
  }
  Assert-ViewerDeniedRpc 'close_billing_cycle' @{ p_cycle_id = $dummyId }
  Assert-ViewerDeniedRpc 'reopen_billing_cycle' @{ p_cycle_id = $dummyId }

  $functionBody = @{
    targetUserId = $dummyId
    redirectUrl = 'http://127.0.0.1:5173/'
  } | ConvertTo-Json -Compress
  $functionResponse = Invoke-SupabaseRequest -Method 'POST' -Path '/functions/v1/admin-reset-password-link' -JsonBody $functionBody -AdditionalHeaders @{ Origin = 'http://127.0.0.1:5173' }
  $functionBody = $null
  if ($functionResponse.StatusCode -ne 403) {
    Stop-WithMessage ("Recovery function returned HTTP {0}; expected Viewer role denial (403). Response contents are suppressed." -f $functionResponse.StatusCode)
  }
  $functionError = Convert-ResponseJson $functionResponse.Content
  if ($functionError.error -ne 'Admin access required') {
    Stop-WithMessage 'Recovery function did not reject the Viewer at the Admin role check; response contents are suppressed.'
  }
  $functionError = $null
  $functionResponse = $null
  Write-Host 'PASS: Viewer is rejected by the Admin recovery function before target lookup or link generation.'
  Write-Host 'PASS: Viewer RLS check completed. No valid records were created and no email was requested.'
} catch {
  Write-Error $_.Exception.Message
  exit 1
} finally {
  if ($bstr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
  if ($null -ne $securePassword) { $securePassword.Dispose() }
  $plainPassword = $null
  $authJson = $null
  $accessToken = $null
  $publishableKey = $null
  $email = $null
  if ($null -ne $httpClient) { $httpClient.Dispose() }
}
