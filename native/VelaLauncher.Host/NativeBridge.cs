using System.Diagnostics;
using System.IO;
using System.Net.Http;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Windows;
using Microsoft.Web.WebView2.Core;
using Microsoft.Win32;
using VelaLauncher.Host.Services;

namespace VelaLauncher.Host;

public sealed class NativeBridge
{
    private readonly MainWindow _window;
    private readonly CoreWebView2 _webView;
    private readonly StateStore _state;
    private readonly HttpClient _http = new();
    private readonly MicrosoftAuthService _microsoft;
    private readonly YggdrasilAuthService _yggdrasil;
    private readonly AppearanceService _appearance;
    private readonly GameService _game;

    public NativeBridge(MainWindow window, CoreWebView2 webView, StateStore state)
    {
        _window = window;
        _webView = webView;
        _state = state;
        _http.DefaultRequestHeaders.UserAgent.ParseAdd("VelaLauncher/0.2");
        _microsoft = new MicrosoftAuthService(_http, state);
        _microsoft.Status += status => Emit("auth.status", status);
        _yggdrasil = new YggdrasilAuthService(_http);
        _appearance = new AppearanceService(_http);
        _game = new GameService(_http, state);
        _game.Progress += progress => Emit("game.progress", progress);
        _game.LaunchStatus += status => Emit("game.launchStatus", status);
    }

    public async void OnMessageReceived(object? sender, CoreWebView2WebMessageReceivedEventArgs eventArgs)
    {
        long id = 0;
        try
        {
            var message = JsonNode.Parse(eventArgs.WebMessageAsJson)?.AsObject()
                ?? throw new InvalidOperationException("Пустой запрос WebView.");
            id = message["id"]?.GetValue<long>() ?? 0;
            var method = message["method"]?.GetValue<string>()
                ?? throw new InvalidOperationException("Не указан метод WebView bridge.");
            var args = message["args"] as JsonArray ?? new JsonArray();
            var result = await DispatchAsync(method, args);
            Reply(new JsonObject { ["id"] = id, ["ok"] = true, ["result"] = result });
        }
        catch (Exception error)
        {
            Reply(new JsonObject { ["id"] = id, ["ok"] = false, ["error"] = Friendly(error) });
        }
    }

    private async Task<JsonNode?> DispatchAsync(string method, JsonArray args)
    {
        switch (method)
        {
            case "app.getVersion": return "0.2.0";
            case "app.openExternal": OpenExternal(StringArg(args, 0)); return null;
            case "app.pickFolder": return PickFolder();
            case "app.pickImage": return PickFile("Изображения|*.png;*.jpg;*.jpeg;*.webp", false);
            case "app.pickMedia": return PickFile("Медиа|*.png;*.jpg;*.jpeg;*.webp;*.gif;*.mp4;*.webm", false);
            case "app.pickGallery": return PickFiles("Изображения|*.png;*.jpg;*.jpeg;*.webp");
            case "app.readImage": return await ReadDataUrlAsync(StringArg(args, 0));
            case "app.importJson": return await ImportJsonAsync();
            case "app.exportJson": return await ExportJsonAsync(StringArg(args, 0), args.ElementAtOrDefault(1));
            case "app.systemMemory": return SystemMemory();
            case "app.screenshots": return await ScreenshotsAsync();
            case "app.contentSummary": return await ContentSummaryAsync();
            case "window.drag":
                if (_window.WindowState == WindowState.Normal && System.Windows.Input.Mouse.LeftButton == System.Windows.Input.MouseButtonState.Pressed)
                {
                    try { _window.DragMove(); }
                    catch (InvalidOperationException) { }
                }
                return null;
            case "window.minimize": _window.WindowState = WindowState.Minimized; return null;
            case "window.maximize": _window.WindowState = _window.WindowState == WindowState.Maximized ? WindowState.Normal : WindowState.Maximized; return null;
            case "window.close": _window.Close(); return null;
            case "window.isMaximized": return _window.WindowState == WindowState.Maximized;
            case "state.get": return await _state.LoadAsync();
            case "state.saveSettings": return await _state.SaveSettingsAsync(args.ElementAtOrDefault(0));
            case "state.saveAccounts": return await _state.SaveAccountsAsync(args.ElementAtOrDefault(0), args.ElementAtOrDefault(1)?.GetValue<string>());
            case "state.saveFriends": return await _state.SaveFriendsAsync(args.ElementAtOrDefault(0));
            case "friends.resolve": return await ResolveProfileAsync(StringArg(args, 0));
            case "auth.msStart": return await _microsoft.StartAsync();
            case "auth.msCancel": _microsoft.Cancel(); return null;
            case "auth.msRefresh": return await _microsoft.RefreshAsync(ObjectArg(args, 0));
            case "auth.offlineCreate": return _yggdrasil.CreateOffline(StringArg(args, 0));
            case "auth.elyLogin": return await _yggdrasil.LoginElyAsync(ObjectArg(args, 0));
            case "auth.elyRefresh": return await _yggdrasil.RefreshElyAsync(ObjectArg(args, 0));
            case "auth.littleSkinLogin": return await _yggdrasil.LoginLittleSkinAsync(ObjectArg(args, 0));
            case "auth.littleSkinRefresh": return await _yggdrasil.RefreshLittleSkinAsync(ObjectArg(args, 0));
            case "appearance.get": return await _appearance.GetAsync(ObjectArg(args, 0));
            case "appearance.pickSkin": return PickFile("Скин Minecraft PNG|*.png", false);
            case "appearance.exportSkin": return await ExportSkinAsync(StringArg(args, 0));
            case "appearance.uploadSkin": return await _appearance.UploadAsync(ObjectArg(args, 0), StringArg(args, 1), StringArg(args, 2));
            case "appearance.resetSkin": return await _appearance.ResetAsync(ObjectArg(args, 0));
            case "appearance.showCape": return await _appearance.ShowCapeAsync(ObjectArg(args, 0), StringArg(args, 1));
            case "appearance.hideCape": return await _appearance.HideCapeAsync(ObjectArg(args, 0));
            case "game.install": await _game.InstallAsync(); return null;
            case "game.pause": return _game.Pause();
            case "game.resume": return _game.Resume();
            case "game.cancel": return _game.Cancel();
            case "game.checkUpdate": return await _game.CheckUpdateAsync();
            case "game.launch": await _game.LaunchAsync(ObjectArg(args, 0)); return null;
            case "discord.activity": return null;
            default: throw new NotSupportedException($"Функция {method} ещё не подключена к native backend.");
        }
    }

    private async Task<JsonObject> ResolveProfileAsync(string username)
    {
        if (string.IsNullOrWhiteSpace(username)) throw new InvalidOperationException("Введите никнейм.");
        using var response = await _http.GetAsync("https://api.mojang.com/users/profiles/minecraft/" + Uri.EscapeDataString(username.Trim()));
        if (response.StatusCode == System.Net.HttpStatusCode.NoContent || response.StatusCode == System.Net.HttpStatusCode.NotFound)
            throw new InvalidOperationException("Игрок с таким никнеймом не найден.");
        response.EnsureSuccessStatusCode();
        var profile = JsonNode.Parse(await response.Content.ReadAsStringAsync())?.AsObject()
            ?? throw new InvalidOperationException("Mojang вернул пустой профиль.");
        var id = profile["id"]?.GetValue<string>() ?? "";
        var uuid = id.Length == 32 ? $"{id[..8]}-{id[8..12]}-{id[12..16]}-{id[16..20]}-{id[20..]}" : id;
        return new JsonObject { ["username"] = profile["name"]?.DeepClone(), ["uuid"] = uuid };
    }

    private async Task<JsonArray> ScreenshotsAsync()
    {
        var directory = Path.Combine(await _state.GameDirectoryAsync(), "screenshots");
        if (!Directory.Exists(directory)) return new JsonArray();
        return new JsonArray(Directory.EnumerateFiles(directory)
            .Where(IsImage)
            .OrderByDescending(File.GetLastWriteTimeUtc)
            .Select(path => (JsonNode?)JsonValue.Create(path))
            .ToArray<JsonNode?>());
    }

    private async Task<JsonObject> ContentSummaryAsync()
    {
        var root = await _state.GameDirectoryAsync();
        return new JsonObject
        {
            ["mods"] = CountFiles(Path.Combine(root, "mods"), "*.jar"),
            ["resourcePacks"] = CountEntries(Path.Combine(root, "resourcepacks")),
            ["shaderPacks"] = CountEntries(Path.Combine(root, "shaderpacks")),
            ["worlds"] = CountDirectories(Path.Combine(root, "saves")),
            ["screenshots"] = CountEntries(Path.Combine(root, "screenshots")),
        };
    }

    private void Emit(string eventName, JsonNode payload) => Reply(new JsonObject
    {
        ["event"] = eventName,
        ["payload"] = payload.DeepClone(),
    });

    private void Reply(JsonObject message)
    {
        var json = message.ToJsonString(new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase });
        _window.Dispatcher.Invoke(() => _webView.PostWebMessageAsJson(json));
    }

    private static void OpenExternal(string uri)
    {
        if (!Uri.TryCreate(uri, UriKind.Absolute, out var parsed) || parsed.Scheme is not ("https" or "http"))
            throw new InvalidOperationException("Разрешены только внешние HTTP(S)-ссылки.");
        Process.Start(new ProcessStartInfo(parsed.AbsoluteUri) { UseShellExecute = true });
    }

    private static string? PickFolder()
    {
        var dialog = new OpenFolderDialog { Title = "Выберите папку Vela" };
        return dialog.ShowDialog() == true ? dialog.FolderName : null;
    }

    private static string? PickFile(string filter, bool multi)
    {
        var dialog = new OpenFileDialog { Filter = filter, Multiselect = multi };
        return dialog.ShowDialog() == true ? dialog.FileName : null;
    }

    private static JsonArray PickFiles(string filter)
    {
        var dialog = new OpenFileDialog { Filter = filter, Multiselect = true };
        return dialog.ShowDialog() == true
            ? new JsonArray(dialog.FileNames.Select(path => (JsonNode?)JsonValue.Create(path)).ToArray<JsonNode?>())
            : new JsonArray();
    }

    private static async Task<string> ReadDataUrlAsync(string path)
    {
        var bytes = await File.ReadAllBytesAsync(path);
        var mime = Path.GetExtension(path).ToLowerInvariant() switch
        {
            ".png" => "image/png",
            ".jpg" or ".jpeg" => "image/jpeg",
            ".webp" => "image/webp",
            _ => "application/octet-stream",
        };
        return $"data:{mime};base64,{Convert.ToBase64String(bytes)}";
    }

    private static async Task<bool> ExportSkinAsync(string dataUrl)
    {
        var dialog = new SaveFileDialog { Filter = "PNG|*.png", FileName = "vela-skin.png", AddExtension = true };
        if (dialog.ShowDialog() != true) return false;
        var (bytes, _) = AppearanceService.DecodeDataUrl(dataUrl);
        await File.WriteAllBytesAsync(dialog.FileName, bytes);
        return true;
    }

    private static async Task<JsonNode?> ImportJsonAsync()
    {
        var dialog = new OpenFileDialog { Filter = "Vela config|*.json", Multiselect = false };
        if (dialog.ShowDialog() != true) return null;
        return JsonNode.Parse(await File.ReadAllTextAsync(dialog.FileName));
    }

    private static async Task<bool> ExportJsonAsync(string suggestedName, JsonNode? value)
    {
        var safeName = string.Join("-", (string.IsNullOrWhiteSpace(suggestedName) ? "vela-config" : suggestedName)
            .Split(Path.GetInvalidFileNameChars(), StringSplitOptions.RemoveEmptyEntries));
        var dialog = new SaveFileDialog { Filter = "Vela config|*.json", FileName = safeName + ".json", AddExtension = true };
        if (dialog.ShowDialog() != true) return false;
        await File.WriteAllTextAsync(dialog.FileName, value?.ToJsonString(new JsonSerializerOptions { WriteIndented = true }) ?? "{}");
        return true;
    }

    private static JsonObject SystemMemory()
    {
        var status = new MemoryStatusEx();
        if (!GlobalMemoryStatusEx(status)) throw new InvalidOperationException("Не удалось определить объём памяти.");
        return new JsonObject
        {
            ["totalMb"] = (long)(status.TotalPhysical / 1024 / 1024),
            ["freeMb"] = (long)(status.AvailablePhysical / 1024 / 1024),
        };
    }

    private static int CountFiles(string path, string pattern) => Directory.Exists(path) ? Directory.EnumerateFiles(path, pattern).Count() : 0;
    private static int CountEntries(string path) => Directory.Exists(path) ? Directory.EnumerateFileSystemEntries(path).Count() : 0;
    private static int CountDirectories(string path) => Directory.Exists(path) ? Directory.EnumerateDirectories(path).Count() : 0;
    private static bool IsImage(string path) => Path.GetExtension(path).ToLowerInvariant() is ".png" or ".jpg" or ".jpeg" or ".webp";
    private static string StringArg(JsonArray args, int index) => args.ElementAtOrDefault(index)?.GetValue<string>() ?? "";
    private static JsonObject ObjectArg(JsonArray args, int index) => args.ElementAtOrDefault(index) as JsonObject ?? throw new InvalidOperationException("Некорректные параметры вызова.");
    private static string Friendly(Exception error) => error is AggregateException aggregate ? aggregate.GetBaseException().Message : error.Message;

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Auto)]
    private sealed class MemoryStatusEx
    {
        public uint Length = (uint)Marshal.SizeOf<MemoryStatusEx>();
        public uint MemoryLoad;
        public ulong TotalPhysical;
        public ulong AvailablePhysical;
        public ulong TotalPageFile;
        public ulong AvailablePageFile;
        public ulong TotalVirtual;
        public ulong AvailableVirtual;
        public ulong AvailableExtendedVirtual;
    }

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool GlobalMemoryStatusEx([In, Out] MemoryStatusEx buffer);
}
