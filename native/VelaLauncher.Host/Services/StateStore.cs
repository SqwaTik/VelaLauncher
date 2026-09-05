using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace VelaLauncher.Host.Services;

public sealed class StateStore
{
    public const string MicrosoftClientId = "66e755ad-931b-4da8-ba37-7242d585a21f";
    private readonly SemaphoreSlim _gate = new(1, 1);
    private readonly string _configDirectory;
    private readonly string _configPath;
    private JsonObject? _cache;

    public StateStore()
    {
        var appData = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
        _configDirectory = Path.Combine(appData, "Vela Launcher");
        _configPath = Path.Combine(_configDirectory, "vela-config.json");
    }

    public string ConfigDirectory => _configDirectory;

    public async Task<JsonObject> LoadAsync()
    {
        await _gate.WaitAsync();
        try
        {
            if (_cache is not null) return (JsonObject)_cache.DeepClone();
            Directory.CreateDirectory(_configDirectory);
            var source = File.Exists(_configPath) ? _configPath : FindLegacyConfig();
            JsonObject state;
            if (source is not null)
            {
                var json = await File.ReadAllTextAsync(source);
                state = JsonNode.Parse(json)?.AsObject() ?? DefaultState();
                UnprotectSecrets(state);
            }
            else
            {
                state = DefaultState();
            }
            Normalize(state);
            _cache = state;
            await PersistLockedAsync();
            return (JsonObject)state.DeepClone();
        }
        finally
        {
            _gate.Release();
        }
    }

    public async Task<JsonObject> SaveSettingsAsync(JsonNode? settings)
    {
        await MutateAsync(state => state["settings"] = settings?.DeepClone() ?? DefaultSettings());
        return await LoadAsync();
    }

    public async Task<JsonObject> SaveAccountsAsync(JsonNode? accounts, string? activeId)
    {
        await MutateAsync(state =>
        {
            state["accounts"] = accounts?.DeepClone() ?? new JsonArray();
            state["activeAccountId"] = activeId;
        });
        return await LoadAsync();
    }

    public async Task<JsonObject> SaveFriendsAsync(JsonNode? friends)
    {
        await MutateAsync(state => state["friends"] = friends?.DeepClone() ?? new JsonArray());
        return await LoadAsync();
    }

    public async Task<JsonObject> UpdateStatsAsync(Action<JsonObject> update)
    {
        await MutateAsync(state =>
        {
            var stats = state["stats"] as JsonObject ?? new JsonObject();
            state["stats"] = stats;
            update(stats);
        });
        return await LoadAsync();
    }

    public async Task<string> GameDirectoryAsync()
    {
        var state = await LoadAsync();
        return state["settings"]?["storagePath"]?.GetValue<string>()
            ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), ".vela");
    }

    public bool IsAllowedMediaPath(string path)
    {
        try
        {
            var full = Path.GetFullPath(path);
            var state = LoadAsync().GetAwaiter().GetResult();
            var settings = state["settings"] as JsonObject;
            var allowed = new List<string>();
            foreach (var key in new[] { "backgroundMediaPath", "backgroundImagePath" })
            {
                var candidate = settings?[key]?.GetValue<string>();
                if (!string.IsNullOrWhiteSpace(candidate)) allowed.Add(Path.GetFullPath(candidate));
            }
            if (settings?["galleryImagePaths"] is JsonArray gallery)
            {
                allowed.AddRange(gallery.Select(item => item?.GetValue<string>())
                    .Where(item => !string.IsNullOrWhiteSpace(item))
                    .Select(item => Path.GetFullPath(item!)));
            }
            var screenshots = Path.GetFullPath(Path.Combine(GameDirectoryAsync().GetAwaiter().GetResult(), "screenshots"));
            return allowed.Any(item => string.Equals(item, full, StringComparison.OrdinalIgnoreCase))
                || full.StartsWith(screenshots + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase);
        }
        catch
        {
            return false;
        }
    }

    private async Task MutateAsync(Action<JsonObject> mutation)
    {
        await LoadAsync();
        await _gate.WaitAsync();
        try
        {
            mutation(_cache!);
            Normalize(_cache!);
            await PersistLockedAsync();
        }
        finally
        {
            _gate.Release();
        }
    }

    private string? FindLegacyConfig()
    {
        var appData = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
        return new[]
        {
            Path.Combine(appData, "royale-launcher", "royale-config.json"),
            Path.Combine(appData, "Royale Launcher", "royale-config.json"),
        }.FirstOrDefault(File.Exists);
    }

    private async Task PersistLockedAsync()
    {
        if (_cache is null) return;
        Directory.CreateDirectory(_configDirectory);
        var temporary = _configPath + ".tmp";
        var persisted = (JsonObject)_cache.DeepClone();
        ProtectSecrets(persisted);
        var json = persisted.ToJsonString(new JsonSerializerOptions { WriteIndented = true });
        await File.WriteAllTextAsync(temporary, json);
        File.Move(temporary, _configPath, true);
    }

    private static void Normalize(JsonObject state)
    {
        var defaults = DefaultState();
        var settings = state["settings"] as JsonObject ?? new JsonObject();
        var defaultSettings = (JsonObject)defaults["settings"]!;
        foreach (var property in defaultSettings)
            if (!settings.ContainsKey(property.Key)) settings[property.Key] = property.Value?.DeepClone();
        if (string.IsNullOrWhiteSpace(settings["microsoftClientId"]?.GetValue<string>()))
            settings["microsoftClientId"] = MicrosoftClientId;
        state["settings"] = settings;
        state["accounts"] ??= new JsonArray();
        state["activeAccountId"] ??= null;
        state["friends"] ??= new JsonArray();
        var stats = state["stats"] as JsonObject ?? new JsonObject();
        foreach (var property in (JsonObject)defaults["stats"]!)
            if (!stats.ContainsKey(property.Key)) stats[property.Key] = property.Value?.DeepClone();
        state["stats"] = stats;
    }

    private static void ProtectSecrets(JsonObject state)
    {
        if (state["accounts"] is not JsonArray accounts) return;
        foreach (var account in accounts.OfType<JsonObject>())
            foreach (var key in new[] { "accessToken", "refreshToken", "clientToken" })
            {
                var value = account[key]?.GetValue<string>();
                if (string.IsNullOrWhiteSpace(value) || value.StartsWith("dpapi:", StringComparison.Ordinal)) continue;
                var protectedBytes = ProtectedData.Protect(Encoding.UTF8.GetBytes(value), null, DataProtectionScope.CurrentUser);
                account[key] = "dpapi:" + Convert.ToBase64String(protectedBytes);
            }
    }

    private static void UnprotectSecrets(JsonObject state)
    {
        if (state["accounts"] is not JsonArray accounts) return;
        foreach (var account in accounts.OfType<JsonObject>())
            foreach (var key in new[] { "accessToken", "refreshToken", "clientToken" })
            {
                var value = account[key]?.GetValue<string>();
                if (string.IsNullOrWhiteSpace(value) || !value.StartsWith("dpapi:", StringComparison.Ordinal)) continue;
                try
                {
                    var bytes = Convert.FromBase64String(value[6..]);
                    account[key] = Encoding.UTF8.GetString(ProtectedData.Unprotect(bytes, null, DataProtectionScope.CurrentUser));
                }
                catch
                {
                    account.Remove(key);
                }
            }
    }

    private static JsonObject DefaultState() => new()
    {
        ["settings"] = DefaultSettings(),
        ["accounts"] = new JsonArray(),
        ["activeAccountId"] = null,
        ["friends"] = new JsonArray(),
        ["stats"] = new JsonObject
        {
            ["playtimeMinutes"] = 0,
            ["lastPlayed"] = null,
            ["installed"] = false,
            ["installedCommitSha"] = null,
            ["installedClientVersion"] = null,
            ["lastUpdateCheck"] = null,
        },
    };

    private static JsonObject DefaultSettings() => new()
    {
        ["language"] = "ru",
        ["storagePath"] = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), ".vela"),
        ["telemetry"] = false,
        ["gpuDedicated"] = true,
        ["gpuProfile"] = "auto",
        ["discordRpc"] = false,
        ["devMode"] = false,
        ["streamerMode"] = false,
        ["quickLaunch"] = false,
        ["preLaunchCommand"] = "",
        ["minecraftArgs"] = "",
        ["environmentVariables"] = "",
        ["authlibInjector"] = false,
        ["elyAuthlib"] = false,
        ["replaceNativeLibraries"] = "old-only",
        ["autoInstallJava"] = true,
        ["onboardingCompleted"] = false,
        ["memoryAuto"] = true,
        ["memoryMode"] = "auto",
        ["memoryMinMb"] = 2048,
        ["memoryMb"] = 4096,
        ["jvmArgs"] = "",
        ["closeOnLaunch"] = false,
        ["showLog"] = true,
        ["javaPath"] = null,
        ["backgroundImagePath"] = null,
        ["backgroundMediaPath"] = null,
        ["backgroundFit"] = "cover",
        ["galleryImagePaths"] = new JsonArray(),
        ["confirmAccountDelete"] = true,
        ["confirmModDelete"] = true,
        ["microsoftClientId"] = MicrosoftClientId,
    };
}
