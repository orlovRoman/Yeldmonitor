# Скрипт для регистрации/проверки вебхука Telegram
# Запускайте из папки проекта

param(
    [Parameter(Mandatory=$true)]
    [string]$BotToken
)

$WebhookUrl = "https://tkivtvokrnmiimecuowh.supabase.co/functions/v1/telegram-webhook"

Write-Host "=== Проверка текущего вебхука ===" -ForegroundColor Cyan
$info = Invoke-RestMethod -Uri "https://api.telegram.org/bot$BotToken/getWebhookInfo" -Method GET
Write-Host "Текущий URL: $($info.result.url)" -ForegroundColor Yellow
Write-Host "Последняя ошибка: $($info.result.last_error_message)" -ForegroundColor $(if ($info.result.last_error_message) { "Red" } else { "Green" })
Write-Host "Ожидает обработки: $($info.result.pending_update_count)" -ForegroundColor Yellow

Write-Host ""
Write-Host "=== Регистрация нового вебхука ===" -ForegroundColor Cyan
Write-Host "URL: $WebhookUrl"

$body = @{
    url = $WebhookUrl
    allowed_updates = @("message", "callback_query")
} | ConvertTo-Json

$result = Invoke-RestMethod -Uri "https://api.telegram.org/bot$BotToken/setWebhook" `
    -Method POST `
    -ContentType "application/json" `
    -Body $body

if ($result.ok) {
    Write-Host "✅ Вебхук успешно зарегистрирован!" -ForegroundColor Green
    Write-Host $result.description
} else {
    Write-Host "❌ Ошибка: $($result.description)" -ForegroundColor Red
}

Write-Host ""
Write-Host "=== Проверка после регистрации ===" -ForegroundColor Cyan
$info2 = Invoke-RestMethod -Uri "https://api.telegram.org/bot$BotToken/getWebhookInfo" -Method GET
Write-Host "Активный URL: $($info2.result.url)" -ForegroundColor Green
