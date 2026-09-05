using System.Diagnostics;
using System.IO;
using System.Net.Http;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Nodes;
using CmlLib.Core;
using CmlLib.Core.Auth;
using CmlLib.Core.ProcessBuilder;

namespace VelaLauncher.Host.Services;

public sealed class GameService
{
    private const string MinecraftVersion = "26.2";
    private const string FabricLoader = "0.19.4";
    private const string FabricApiProject = "P7dR8mSH";
    private readonly HttpClient _http;
    private readonly StateStore _state;
    private CancellationTokenSource? _operation;
    private Process? _gameProcess;

    public event Action<JsonObject>? Progress;
    public event Action<JsonObject>? LaunchStatus;

    public GameService(HttpClient http, StateStore state)
    {
        _http = http;
        _state = state;
    }

    public async Task InstallAsync()
    {
        if (_operation is not null) throw new InvalidOperationException("Установка уже выполняется.");
        _operation = new CancellationTokenSource();
        var cancellation = _operation.Token;
        try
        {
            var root = await _state.GameDirectoryAsync();
            Directory.CreateDirectory(root);
            var launcher = CreateLauncher(root);
            Report("metadata", 0.03, $"Проверка Minecraft {MinecraftVersion}");
            await launcher.InstallAsync(MinecraftVersion, cancellation);
            cancellation.ThrowIfCancellationRequested();

            Report("fabric", 0.72, $"Установка Fabric {FabricLoader}");
            var fabricId = await InstallFabricProfileAsync(root, cancellation);
            await launcher.InstallAsync(fabricId, cancellation);
            cancellation.ThrowIfCancellationRequested();

            Report("client", 0.88, "Установка Fabric API");
            var mods = Path.Combine(root, "mods");
            Directory.CreateDirectory(mods);
            await InstallFabricApiAsync(mods, cancellation);

            Report("verify", 0.95, "Установка Vela Client");
            await InstallVelaClientAsync(mods, cancellation);
            await _state.UpdateStatsAsync(stats =>
            {
                stats["installed"] = true;
                stats["installedClientVersion"] = "0.1.0";
                stats["lastUpdateCheck"] = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            });
            Report("done", 1, "Vela Client готов к запуску");
        }
        catch (OperationCanceledException)
        {
            Report("idle", 0, "Установка отменена");
        }
        catch (Exception error)
        {
            Report("error", 0, "Ошибка установки", error.Message);
            throw;
        }
        finally
        {
            _operation.Dispose();
            _operation = null;
        }
    }

    public bool Cancel()
    {
        if (_operation is null) return false;
        _operation.Cancel();
        return true;
    }

    public bool Pause() => false;
    public bool Resume() => false;

    public async Task<JsonObject> CheckUpdateAsync()
    {
        var root = await _state.GameDirectoryAsync();
        var mods = Path.Combine(root, "mods");
        var installed = File.Exists(Path.Combine(root, "versions", FabricVersionId, FabricVersionId + ".json"))
            && Directory.Exists(mods)
            && Directory.EnumerateFiles(mods, "Vela-Client-*.jar").Any();
        return new JsonObject
        {
            ["checkedAt"] = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            ["available"] = !installed,
            ["installed"] = installed,
            ["localCommitSha"] = null,
            ["remoteCommitSha"] = null,
            ["remoteVersion"] = "0.1.0",
            ["commitMessage"] = null,
            ["commitDate"] = null,
            ["delivery"] = "release",
        };
    }

    public async Task LaunchAsync(JsonObject account)
    {
        if (_gameProcess is { HasExited: false }) throw new InvalidOperationException("Minecraft уже запущен.");
        var root = await _state.GameDirectoryAsync();
        var versionJson = Path.Combine(root, "versions", FabricVersionId, FabricVersionId + ".json");
        if (!File.Exists(versionJson)) throw new InvalidOperationException("Сначала установите Minecraft и Vela Client.");

        var state = await _state.LoadAsync();
        var settings = state["settings"] as JsonObject ?? new JsonObject();
        var type = account["type"]?.GetValue<string>() ?? "offline";
        var username = Required(account, "username", "В аккаунте отсутствует никнейм.");
        var session = type == "offline"
            ? MSession.CreateOfflineSession(username)
            : new MSession
            {
                Username = username,
                UUID = Required(account, "uuid", "В аккаунте отсутствует UUID."),
                AccessToken = Required(account, "accessToken", "Сессия аккаунта отсутствует."),
            };

        var arguments = new List<MArgument>();
        if (type is "ely" or "littleskin")
        {
            var injector = await EnsureAuthlibInjectorAsync(root);
            var api = type == "ely" ? "https://authserver.ely.by" : "https://littleskin.cn/api/yggdrasil";
            arguments.Add(MArgument.FromCommandLine($"-javaagent:\"{injector}\"={api}"));
        }
        var customJvm = settings["jvmArgs"]?.GetValue<string>();
        if (!string.IsNullOrWhiteSpace(customJvm)) arguments.Add(MArgument.FromCommandLine(customJvm));

        var memory = settings["memoryMb"]?.GetValue<int>() ?? 4096;
        var launcher = CreateLauncher(root);
        EmitLaunch("launching", "Запуск Minecraft…");
        var process = await launcher.BuildProcessAsync(FabricVersionId, new MLaunchOption
        {
            Session = session,
            MaximumRamMb = Math.Max(1024, memory),
            MinimumRamMb = Math.Min(2048, Math.Max(512, memory / 2)),
            GameLauncherName = "Vela Launcher",
            GameLauncherVersion = "0.2.0",
            ExtraJvmArguments = arguments,
        });
        _gameProcess = process;
        process.EnableRaisingEvents = true;
        process.Exited += async (_, _) =>
        {
            var code = process.ExitCode;
            EmitLaunch(code == 0 ? "exited" : "crashed", code == 0 ? "Minecraft закрыт." : $"Minecraft завершился с кодом {code}.", code);
            await _state.UpdateStatsAsync(stats => stats["lastPlayed"] = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
        };
        process.Start();
        EmitLaunch("running", "Minecraft запущен.");
    }

    private MinecraftLauncher CreateLauncher(string root)
    {
        var launcher = new MinecraftLauncher(new MinecraftPath(root));
        launcher.FileProgressChanged += (_, progress) =>
        {
            var fraction = progress.TotalTasks > 0 ? (double)progress.ProgressedTasks / progress.TotalTasks : 0;
            Report("libraries", 0.05 + fraction * 0.65, "Загрузка файлов Minecraft", progress.Name);
        };
        launcher.ByteProgressChanged += (_, progress) =>
        {
            if (progress.TotalBytes <= 0) return;
            var fraction = Math.Clamp((double)progress.ProgressedBytes / progress.TotalBytes, 0, 1);
            Report("assets", 0.05 + fraction * 0.65, "Загрузка ресурсов", null, progress.ProgressedBytes, progress.TotalBytes);
        };
        return launcher;
    }

    private async Task<string> InstallFabricProfileAsync(string root, CancellationToken cancellation)
    {
        var uri = $"https://meta.fabricmc.net/v2/versions/loader/{MinecraftVersion}/{FabricLoader}/profile/json";
        using var response = await _http.GetAsync(uri, cancellation);
        response.EnsureSuccessStatusCode();
        var json = await response.Content.ReadAsStringAsync(cancellation);
        var profile = JsonNode.Parse(json)?.AsObject() ?? throw new InvalidOperationException("Fabric Meta вернул пустой профиль.");
        var id = profile["id"]?.GetValue<string>() ?? FabricVersionId;
        var directory = Path.Combine(root, "versions", id);
        Directory.CreateDirectory(directory);
        await File.WriteAllTextAsync(Path.Combine(directory, id + ".json"), json, cancellation);
        return id;
    }

    private async Task InstallFabricApiAsync(string mods, CancellationToken cancellation)
    {
        var query = Uri.EscapeDataString($"[\"{MinecraftVersion}\"]");
        var loaders = Uri.EscapeDataString("[\"fabric\"]");
        using var response = await _http.GetAsync($"https://api.modrinth.com/v2/project/{FabricApiProject}/version?game_versions={query}&loaders={loaders}", cancellation);
        response.EnsureSuccessStatusCode();
        var versions = JsonNode.Parse(await response.Content.ReadAsStringAsync(cancellation))?.AsArray();
        var file = versions?[0]?["files"]?.AsArray().FirstOrDefault(item => item?["primary"]?.GetValue<bool>() == true)
            ?? versions?[0]?["files"]?[0]
            ?? throw new InvalidOperationException($"Fabric API для Minecraft {MinecraftVersion} не найден.");
        var filename = file["filename"]?.GetValue<string>() ?? "fabric-api.jar";
        var url = file["url"]?.GetValue<string>() ?? throw new InvalidOperationException("Modrinth не вернул ссылку Fabric API.");
        var sha1 = file["hashes"]?["sha1"]?.GetValue<string>();
        await DownloadVerifiedAsync(url, Path.Combine(mods, filename), sha1, cancellation);
    }

    private static async Task InstallVelaClientAsync(string mods, CancellationToken cancellation)
    {
        var bundled = Path.Combine(AppContext.BaseDirectory, "Assets", "vela-client.jar");
        if (!File.Exists(bundled)) throw new InvalidOperationException("В установке Vela Launcher отсутствует Vela Client JAR.");
        var backup = Path.Combine(mods, ".vela-backup", DateTimeOffset.Now.ToString("yyyyMMdd-HHmmss"));
        var old = Directory.EnumerateFiles(mods)
            .Where(path => Path.GetFileName(path).Contains("royale", StringComparison.OrdinalIgnoreCase)
                || Path.GetFileName(path).Contains("storage-organ", StringComparison.OrdinalIgnoreCase))
            .ToArray();
        if (old.Length > 0)
        {
            Directory.CreateDirectory(backup);
            foreach (var path in old) File.Move(path, Path.Combine(backup, Path.GetFileName(path)), true);
        }
        foreach (var previous in Directory.EnumerateFiles(mods, "Vela-Client-*.jar")) File.Delete(previous);
        var destination = Path.Combine(mods, "Vela-Client-26.2-0.1.0.jar");
        await using var source = File.OpenRead(bundled);
        await using var target = File.Create(destination);
        await source.CopyToAsync(target, cancellation);
    }

    private async Task<string> EnsureAuthlibInjectorAsync(string root)
    {
        var directory = Path.Combine(root, "authlib-injector");
        var destination = Path.Combine(directory, "authlib-injector.jar");
        Directory.CreateDirectory(directory);
        using var response = await _http.GetAsync("https://authlib-injector.yushi.moe/artifact/latest.json");
        response.EnsureSuccessStatusCode();
        var metadata = JsonNode.Parse(await response.Content.ReadAsStringAsync());
        var url = metadata?["download_url"]?.GetValue<string>() ?? throw new InvalidOperationException("Не найдена ссылка authlib-injector.");
        var sha256 = metadata?["checksums"]?["sha256"]?.GetValue<string>();
        if (!File.Exists(destination) || !await HashMatchesAsync(destination, sha256, SHA256.Create()))
            await DownloadVerifiedAsync(url, destination, sha256, CancellationToken.None, "sha256");
        return destination;
    }

    private async Task DownloadVerifiedAsync(string uri, string destination, string? expectedHash, CancellationToken cancellation, string algorithm = "sha1")
    {
        var temporary = destination + ".part";
        Directory.CreateDirectory(Path.GetDirectoryName(destination)!);
        using var response = await _http.GetAsync(uri, HttpCompletionOption.ResponseHeadersRead, cancellation);
        response.EnsureSuccessStatusCode();
        await using (var source = await response.Content.ReadAsStreamAsync(cancellation))
        await using (var target = File.Create(temporary))
            await source.CopyToAsync(target, cancellation);
        if (!string.IsNullOrWhiteSpace(expectedHash))
        {
            using HashAlgorithm hash = algorithm == "sha256" ? SHA256.Create() : SHA1.Create();
            if (!await HashMatchesAsync(temporary, expectedHash, hash))
            {
                File.Delete(temporary);
                throw new InvalidOperationException("Загруженный файл не прошёл проверку целостности.");
            }
        }
        File.Move(temporary, destination, true);
    }

    private static async Task<bool> HashMatchesAsync(string path, string? expected, HashAlgorithm hash)
    {
        if (string.IsNullOrWhiteSpace(expected)) return false;
        await using var stream = File.OpenRead(path);
        var actual = Convert.ToHexString(await hash.ComputeHashAsync(stream)).ToLowerInvariant();
        return string.Equals(actual, expected, StringComparison.OrdinalIgnoreCase);
    }

    private void Report(string phase, double progress, string message, string? detail = null, long? downloaded = null, long? total = null) =>
        Progress?.Invoke(new JsonObject
        {
            ["phase"] = phase,
            ["progress"] = Math.Clamp(progress, 0, 1),
            ["message"] = message,
            ["detail"] = detail,
            ["downloadedBytes"] = downloaded,
            ["totalBytes"] = total,
            ["canPause"] = false,
        });

    private void EmitLaunch(string state, string message, int? code = null) => LaunchStatus?.Invoke(new JsonObject
    {
        ["state"] = state,
        ["message"] = message,
        ["code"] = code,
    });

    private static string Required(JsonObject value, string key, string message) =>
        value[key]?.GetValue<string>() ?? throw new InvalidOperationException(message);

    private static string FabricVersionId => $"fabric-loader-{FabricLoader}-{MinecraftVersion}";
}
