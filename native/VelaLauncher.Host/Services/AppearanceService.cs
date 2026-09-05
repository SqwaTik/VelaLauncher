using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json.Nodes;

namespace VelaLauncher.Host.Services;

public sealed class AppearanceService
{
    private readonly HttpClient _http;

    public AppearanceService(HttpClient http) => _http = http;

    public async Task<JsonObject> GetAsync(JsonObject account)
    {
        var provider = account["type"]?.GetValue<string>() ?? "offline";
        if (provider == "microsoft") return await GetMicrosoftAsync(account);
        if (provider is "ely" or "littleskin") return await GetYggdrasilAsync(account, provider);
        return Empty(account["skinDataUrl"]?.GetValue<string>());
    }

    public async Task<JsonObject> UploadAsync(JsonObject account, string dataUrl, string model)
    {
        EnsureMicrosoft(account);
        var token = Required(account, "accessToken", "Сессия Microsoft отсутствует.");
        var (bytes, _) = DecodeDataUrl(dataUrl);
        using var request = new HttpRequestMessage(HttpMethod.Put, "https://api.minecraftservices.com/minecraft/profile/skins");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        using var content = new MultipartFormDataContent();
        content.Add(new StringContent(model.Equals("slim", StringComparison.OrdinalIgnoreCase) ? "slim" : "classic"), "variant");
        var image = new ByteArrayContent(bytes);
        image.Headers.ContentType = new MediaTypeHeaderValue("image/png");
        content.Add(image, "file", "vela-skin.png");
        request.Content = content;
        using var response = await _http.SendAsync(request);
        await EnsureSuccessAsync(response);
        return await GetMicrosoftAsync(account);
    }

    public async Task<JsonObject> ResetAsync(JsonObject account)
    {
        EnsureMicrosoft(account);
        await SendAuthorizedAsync(HttpMethod.Delete, "https://api.minecraftservices.com/minecraft/profile/skins/active", account);
        return await GetMicrosoftAsync(account);
    }

    public async Task<JsonObject> ShowCapeAsync(JsonObject account, string capeId)
    {
        EnsureMicrosoft(account);
        using var content = new StringContent(new JsonObject { ["capeId"] = capeId }.ToJsonString(), Encoding.UTF8, "application/json");
        await SendAuthorizedAsync(HttpMethod.Put, "https://api.minecraftservices.com/minecraft/profile/capes/active", account, content);
        return await GetMicrosoftAsync(account);
    }

    public async Task<JsonObject> HideCapeAsync(JsonObject account)
    {
        EnsureMicrosoft(account);
        await SendAuthorizedAsync(HttpMethod.Delete, "https://api.minecraftservices.com/minecraft/profile/capes/active", account);
        return await GetMicrosoftAsync(account);
    }

    private async Task<JsonObject> GetMicrosoftAsync(JsonObject account)
    {
        var token = Required(account, "accessToken", "Сессия Microsoft отсутствует.");
        using var request = new HttpRequestMessage(HttpMethod.Get, "https://api.minecraftservices.com/minecraft/profile");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        using var response = await _http.SendAsync(request);
        await EnsureSuccessAsync(response);
        var profile = JsonNode.Parse(await response.Content.ReadAsStringAsync())?.AsObject()
            ?? throw new InvalidOperationException("Minecraft вернул пустой профиль.");
        var skins = profile["skins"] as JsonArray ?? new JsonArray();
        var capes = profile["capes"] as JsonArray ?? new JsonArray();
        var active = skins.OfType<JsonObject>().FirstOrDefault(skin => skin["state"]?.GetValue<string>() == "ACTIVE")
            ?? skins.OfType<JsonObject>().FirstOrDefault();
        var texture = active?["url"]?.GetValue<string>();
        return new JsonObject
        {
            ["skinDataUrl"] = texture is null ? account["skinDataUrl"]?.DeepClone() : await DownloadDataUrlAsync(texture),
            ["skins"] = skins.DeepClone(),
            ["capes"] = capes.DeepClone(),
        };
    }

    private async Task<JsonObject> GetYggdrasilAsync(JsonObject account, string provider)
    {
        var uuid = Required(account, "uuid", "У аккаунта отсутствует UUID.").Replace("-", "");
        var roots = provider == "ely"
            ? new[]
            {
                $"https://authserver.ely.by/session/sessionserver/session/minecraft/profile/{uuid}",
                $"https://sessionserver.ely.by/session/minecraft/profile/{uuid}",
            }
            : new[] { $"https://littleskin.cn/api/yggdrasil/sessionserver/session/minecraft/profile/{uuid}" };
        foreach (var uri in roots)
        {
            try
            {
                using var response = await _http.GetAsync(uri);
                if (!response.IsSuccessStatusCode) continue;
                var profile = JsonNode.Parse(await response.Content.ReadAsStringAsync())?.AsObject();
                var encoded = profile?["properties"]?[0]?["value"]?.GetValue<string>();
                if (string.IsNullOrWhiteSpace(encoded)) continue;
                var textures = JsonNode.Parse(Encoding.UTF8.GetString(Convert.FromBase64String(encoded)));
                var skin = textures?["textures"]?["SKIN"];
                var url = skin?["url"]?.GetValue<string>();
                if (string.IsNullOrWhiteSpace(url)) continue;
                var variant = skin?["metadata"]?["model"]?.GetValue<string>()?.Equals("slim", StringComparison.OrdinalIgnoreCase) == true ? "SLIM" : "CLASSIC";
                return new JsonObject
                {
                    ["skinDataUrl"] = await DownloadDataUrlAsync(url),
                    ["skins"] = new JsonArray(new JsonObject { ["id"] = provider + "-skin", ["state"] = "ACTIVE", ["url"] = url, ["variant"] = variant }),
                    ["capes"] = new JsonArray(),
                };
            }
            catch
            {
                // Try the next documented-compatible session server endpoint.
            }
        }
        return Empty(account["skinDataUrl"]?.GetValue<string>());
    }

    private async Task SendAuthorizedAsync(HttpMethod method, string uri, JsonObject account, HttpContent? content = null)
    {
        using var request = new HttpRequestMessage(method, uri) { Content = content };
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", Required(account, "accessToken", "Сессия Microsoft отсутствует."));
        using var response = await _http.SendAsync(request);
        await EnsureSuccessAsync(response);
    }

    private async Task<string> DownloadDataUrlAsync(string uri)
    {
        var bytes = await _http.GetByteArrayAsync(uri);
        return "data:image/png;base64," + Convert.ToBase64String(bytes);
    }

    public static (byte[] Bytes, string Mime) DecodeDataUrl(string dataUrl)
    {
        var comma = dataUrl.IndexOf(',');
        if (!dataUrl.StartsWith("data:", StringComparison.OrdinalIgnoreCase) || comma < 0)
            throw new InvalidOperationException("Некорректное изображение.");
        var header = dataUrl[5..comma];
        if (!header.Contains(";base64", StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("Изображение должно быть передано в base64.");
        var mime = header.Split(';')[0];
        return (Convert.FromBase64String(dataUrl[(comma + 1)..]), mime);
    }

    private static JsonObject Empty(string? texture) => new()
    {
        ["skinDataUrl"] = texture,
        ["skins"] = new JsonArray(),
        ["capes"] = new JsonArray(),
    };

    private static void EnsureMicrosoft(JsonObject account)
    {
        if (account["type"]?.GetValue<string>() != "microsoft")
            throw new InvalidOperationException("Изменение скина и плаща доступно для Microsoft-аккаунта.");
    }

    private static string Required(JsonObject value, string key, string message) =>
        value[key]?.GetValue<string>() ?? throw new InvalidOperationException(message);

    private static async Task EnsureSuccessAsync(HttpResponseMessage response)
    {
        if (response.IsSuccessStatusCode) return;
        var detail = await response.Content.ReadAsStringAsync();
        if (response.StatusCode is HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden)
            throw new InvalidOperationException("Сессия аккаунта истекла. Войдите снова.");
        throw new InvalidOperationException(string.IsNullOrWhiteSpace(detail) ? $"Minecraft Services вернул ошибку {(int)response.StatusCode}." : detail);
    }
}
