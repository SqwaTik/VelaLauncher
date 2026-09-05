# Vela Launcher

Компактный Windows-лаунчер для Vela Client на Minecraft 26.2 и Fabric. Интерфейс работает в WebView2, а установка игры, авторизация и хранение данных выполняются нативным .NET-хостом.

## Возможности

- аккаунты Microsoft, Offline, Ely.by и LittleSkin в одном Account Manager;
- отображение настоящей головы скина для Microsoft, Ely.by и LittleSkin;
- безопасный Microsoft OAuth Authorization Code + PKCE без client secret;
- шифрование токенов через Windows DPAPI, пароли Ely.by и LittleSkin не сохраняются;
- установка Minecraft 26.2, Fabric Loader, Fabric API и Vela Client;
- автоматическое обновление встроенного Vela Client и резервное копирование старых Royale/Storage Organizer JAR;
- единый поиск по функциям, бинды Toggle/Hold через контекстное меню;
- сохранение модулей, настроек интерфейса, цветов, друзей, маркеров и конфигов;
- импорт и экспорт конфигов через системные диалоги Windows;
- фирменный тёмный интерфейс, собственный RGB/HEX-пикер и масштабирование UI.

Для входа Microsoft одного Entra Client ID недостаточно: идентификатор стороннего лаунчера должен быть разрешён Minecraft Services. Если сервис возвращает `Invalid app registration`, подайте приложение на проверку через [App Registration Info](https://aka.ms/AppRegInfo). Лаунчер показывает это ограничение понятным сообщением и не подменяет чужие Client ID.

## Разработка

Требования: Node.js 20+, npm, .NET SDK 9 и Windows 10/11 с Microsoft Edge WebView2 Runtime.

```powershell
npm install
npm run typecheck
npm run build
dotnet build native/VelaLauncher.Host/VelaLauncher.Host.csproj -c Release
```

Публикация x64-сборки:

```powershell
npm run build
dotnet publish native/VelaLauncher.Host/VelaLauncher.Host.csproj -c Release -r win-x64 --self-contained false -p:PublishSingleFile=true -o outputs/VelaLauncher
```

## Структура

```text
src/webview/                    React-интерфейс WebView2
src/shared/                     общие версии и типы
native/VelaLauncher.Host/       WPF/.NET-хост, bridge и игровые сервисы
native/VelaLauncher.Host/Assets встроенный Vela Client и ресурсы лаунчера
```

Данные лаунчера и игровая сборка хранятся в пользовательском каталоге `.vela`. Исходный код не содержит паролей, client secret или пользовательских токенов.
