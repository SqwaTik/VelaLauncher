using System.Security.Cryptography;
using System.Net.Http;
using System.Text;
using System.Text.Json.Nodes;

namespace VelaLauncher.Host.Services;

public sealed class YggdrasilAuthService
{
    private readonly HttpClient _http;

    public YggdrasilAuthService(HttpClient http) => _http = http;

    public JsonObject CreateOffline(string username)
    {
        var name = username.Trim();
        if (name.Length is < 3 or > 16 || name.Any(character => !(char.IsLetterOrDigit(character) || character == '_')))
            throw new InvalidOperationException("Никнейм должен содержать 3–16 латинских букв, цифр или символов _.");
        var hash = MD5.HashData(Encoding.UTF8.GetBytes("OfflinePlayer:" + name));
        hash[6] = (byte)((hash[6] & 0x0F) | 0x30);
        hash[8] = (byte)((hash[8] & 0x3F) | 0x80);
        var uuid = new Guid(hash).ToString();
        return new JsonObject
        {
            ["id"] = "offline-" + uuid.Replace("-", ""),
            ["username"] = name,
            ["uuid"] = uuid,
            ["type"] = "offline",
            ["skinModel"] = "classic",
        };
    }

    public Task<JsonObject> LoginElyAsync(JsonObject input) => LoginAsync(
        "https://authserver.ely.by/auth",
        "ely",
        input,
        includeAgent: false,
        appendTotp: true);

    public Task<JsonObject> LoginLittleSkinAsync(JsonObject input) => LoginAsync(
        "https://littleskin.cn/api/yggdrasil/authserver",
        "littleskin",
        input,
        includeAgent: true,
        appendTotp: false);

    public Task<JsonObject> RefreshElyAsync(JsonObject account) =>
        RefreshAsync("https://authserver.ely.by/auth", account);

    public Task<JsonObject> RefreshLittleSkinAsync(JsonObject account) =>
        RefreshAsync("https://littleskin.cn/api/yggdrasil/authserver", account);

    private async Task<JsonObject> LoginAsync(
        string root,
        string provider,
        JsonObject input,
        bool includeAgent,
        bool appendTotp)
    {
        var username = input["username"]?.GetValue<string>()?.Trim();
        var password = input["password"]?.GetValue<string>();
        if (string.IsNullOrWhiteSpace(username) || string.IsNullOrWhiteSpace(password))
            throw new InvalidOperationException($"Введите логин и пароль {ProviderName(provider)}.");
        var totp = input["totp"]?.GetValue<string>()?.Trim();
        if (appendTotp && !string.IsNullOrWhiteSpace(totp)) password += ":" + totp;
        var clientToken = Guid.NewGuid().ToString();
        var body = new JsonObject
        {
            ["username"] = username,
            ["password"] = password,
            ["clientToken"] = clientToken,
            ["requestUser"] = true,
        };
        if (includeAgent) body["agent"] = new JsonObject { ["name"] = "Minecraft", ["version"] = 1 };
        var result = await SendAsync(root + "/authenticate", body, ProviderName(provider));
        var profile = result["selectedProfile"] as JsonObject
            ?? result["availableProfiles"]?[0] as JsonObject
            ?? throw new InvalidOperationException($"У аккаунта {ProviderName(provider)} нет игрового профиля.");
        if (result["selectedProfile"] is null && includeAgent)
        {
            result = await SendAsync(root + "/refresh", new JsonObject
            {
                ["accessToken"] = result["accessToken"]?.DeepClone(),
                ["clientToken"] = result["clientToken"]?.DeepClone(),
                ["selectedProfile"] = profile.DeepClone(),
                ["requestUser"] = true,
            }, ProviderName(provider));
            profile = result["selectedProfile"] as JsonObject ?? profile;
        }
        return Account(provider, result, profile);
    }

    private async Task<JsonObject> RefreshAsync(string root, JsonObject account)
    {
        var access = account["accessToken"]?.GetValue<string>();
        var client = account["clientToken"]?.GetValue<string>();
        if (string.IsNullOrWhiteSpace(access) || string.IsNullOrWhiteSpace(client))
            throw new InvalidOperationException("Сессия устарела. Войдите заново.");
        var profile = new JsonObject
        {
            ["id"] = account["uuid"]?.GetValue<string>()?.Replace("-", ""),
            ["name"] = account["username"]?.GetValue<string>(),
        };
        var result = await SendAsync(root + "/refresh", new JsonObject
        {
            ["accessToken"] = access,
            ["clientToken"] = client,
            ["selectedProfile"] = profile,
            ["requestUser"] = true,
        }, account["type"]?.GetValue<string>() == "ely" ? "Ely.by" : "LittleSkin");
        var refreshed = result["selectedProfile"] as JsonObject ?? profile;
        var provider = account["type"]?.GetValue<string>() ?? "ely";
        var updated = Account(provider, result, refreshed);
        updated["id"] = account["id"]?.DeepClone();
        return updated;
    }

    private async Task<JsonObject> SendAsync(string uri, JsonObject body, string provider)
    {
        using var content = new StringContent(body.ToJsonString(), Encoding.UTF8, "application/json");
        using var request = new HttpRequestMessage(HttpMethod.Post, uri) { Content = content };
        request.Headers.UserAgent.ParseAdd("VelaLauncher/0.2");
        using var response = await _http.SendAsync(request);
        var raw = await response.Content.ReadAsStringAsync();
        var result = string.IsNullOrWhiteSpace(raw) ? new JsonObject() : JsonNode.Parse(raw)?.AsObject() ?? new JsonObject();
        if (!response.IsSuccessStatusCode)
            throw new InvalidOperationException(
                result["errorMessage"]?.GetValue<string>()
                ?? result["error"]?.GetValue<string>()
                ?? $"{provider} вернул ошибку {(int)response.StatusCode}.");
        return result;
    }

    private static JsonObject Account(string provider, JsonObject response, JsonObject profile)
    {
        var id = profile["id"]?.GetValue<string>() ?? throw new InvalidOperationException("Провайдер не вернул UUID.");
        var name = profile["name"]?.GetValue<string>() ?? throw new InvalidOperationException("Провайдер не вернул никнейм.");
        return new JsonObject
        {
            ["id"] = provider + "-" + id,
            ["username"] = name,
            ["uuid"] = id,
            ["type"] = provider,
            ["skinModel"] = "classic",
            ["accessToken"] = response["accessToken"]?.DeepClone(),
            ["clientToken"] = response["clientToken"]?.DeepClone(),
        };
    }

    private static string ProviderName(string provider) => provider == "ely" ? "Ely.by" : "LittleSkin";
}
