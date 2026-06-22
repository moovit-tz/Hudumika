$body = @{ email = 'admin@msomi.co'; password = 'password123' } | ConvertTo-Json
$response = Invoke-RestMethod -Method Post -Uri http://localhost:3000/auth/login -Headers @{ 'Content-Type' = 'application/json' } -Body $body
Write-Output $response.access_token
