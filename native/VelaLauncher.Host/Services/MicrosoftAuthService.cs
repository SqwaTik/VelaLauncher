using System.Diagnostics;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Nodes;

namespace VelaLauncher.Host.Services;

public sealed class MicrosoftAuthService
{
    private const string AuthorizeEndpoint = "https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize";
    private const string TokenEndpoint = "https://login.microsoftonline.com/consumers/oauth2/v2.0/token";
    private const string Scope = "XboxLive.signin offline_access";
    private readonly HttpClient _http;
    private readonly StateStore _state;
    private CancellationTokenSource? _flowCancellation;
    public event Action<JsonObject>? Status;

    public MicrosoftAuthService(HttpClient http, StateStore state)
    {
        _http = http;
        _state = state;
    }

    public async Task<JsonObject> StartAsync()
    {
        Cancel();
        var state = await _state.LoadAsync();
        var clientId = state["settings"]?["microsoftClientId"]?.GetValue<string>()?.Trim();
        if (string.IsNullOrWhiteSpace(clientId))
            throw new InvalidOperationException("Укажите Application (client) ID Microsoft Entra в настройках.");

        _flowCancellation = new CancellationTokenSource(TimeSpan.FromMinutes(5));
        var cancellation = _flowCancellation;
        var verifier = Base64Url(RandomNumberGenerator.GetBytes(64));
        var challenge = Base64Url(SHA256.HashData(Encoding.ASCII.GetBytes(verifier)));
        var expectedState = Base64Url(RandomNumberGenerator.GetBytes(24));
        var port = ReservePort();
        var redirectUri = $"http://localhost:{port}/";
        var listener = new HttpListener();
        listener.Prefixes.Add(redirectUri);
        listener.Start();

        var authorize = new UriBuilder(AuthorizeEndpoint)
        {
            Query = Form(new Dictionary<string, string>
            {
                ["client_id"] = clientId,
                ["response_type"] = "code",
                ["redirect_uri"] = redirectUri,
                ["response_mode"] = "query",
                ["scope"] = Scope,
                ["state"] = expectedState,
                ["code_challenge"] = challenge,
                ["code_challenge_method"] = "S256",
                ["prompt"] = "select_account",
            }),
        }.Uri;

        Process.Start(new ProcessStartInfo(authorize.AbsoluteUri) { UseShellExecute = true });
        Emit("waiting", "Завершите вход в системном браузере.");
        _ = CompleteBrowserFlowAsync(listener, cancellation, clientId, redirectUri, verifier, expectedState);
        return new JsonObject { ["redirectUri"] = redirectUri, ["expiresIn"] = 300 };
    }

    public void Cancel()
    {
        if (_flowCancellation is null) return;
        _flowCancellation.Cancel();
        _flowCancellation.Dispose();
        _flowCancellation = null;
        Emit("cancelled");
    }

    public async Task<JsonObject> RefreshAsync(JsonObject account)
    {
        var state = await _state.LoadAsync();
        var clientId = state["settings"]?["microsoftClientId"]?.GetValue<string>()?.Trim();
        var refreshToken = account["refreshToken"]?.GetValue<string>();
        if (string.IsNullOrWhiteSpace(clientId) || string.IsNullOrWhiteSpace(refreshToken))
            throw new InvalidOperationException("Сессия Microsoft истекла. Войдите снова.");
        var token = await PostFormAsync(TokenEndpoint, new Dictionary<string, string>
        {
            ["client_id"] = clientId,
            ["grant_type"] = "refresh_token",
            ["refresh_token"] = refreshToken,
            ["scope"] = Scope,
        }, CancellationToken.None);
        return await CompleteXboxChainAsync(token, CancellationToken.None);
    }

    private async Task CompleteBrowserFlowAsync(
        HttpListener listener,
        CancellationTokenSource flow,
        string clientId,
        string redirectUri,
        string verifier,
        string expectedState)
    {
        try
        {
            using var registration = flow.Token.Register(listener.Stop);
            var context = await listener.GetContextAsync().WaitAsync(flow.Token);
            var query = context.Request.QueryString;
            var code = query["code"];
            var returnedState = query["state"];
            var oauthError = FriendlyMicrosoftError(query["error_description"] ?? query["error"]);
            var returnedStateBytes = Encoding.UTF8.GetBytes(returnedState ?? "");
            var expectedStateBytes = Encoding.UTF8.GetBytes(expectedState);
            var stateMatches = returnedStateBytes.Length == expectedStateBytes.Length
                && CryptographicOperations.FixedTimeEquals(returnedStateBytes, expectedStateBytes);
            var valid = string.IsNullOrWhiteSpace(oauthError)
                && !string.IsNullOrWhiteSpace(code)
                && stateMatches;
            var page = valid
                ? CallbackPage(true, "Аккаунт подключён. Можно вернуться в Vela Launcher.")
                : CallbackPage(false, oauthError ?? "Microsoft вернул некорректный ответ.");
            var body = Encoding.UTF8.GetBytes(page);
            context.Response.StatusCode = valid ? 200 : 400;
            context.Response.ContentType = "text/html; charset=utf-8";
            context.Response.ContentLength64 = body.Length;
            await context.Response.OutputStream.WriteAsync(body, flow.Token);
            context.Response.Close();
            listener.Stop();
            if (!valid) throw new InvalidOperationException(oauthError ?? "Не удалось подтвердить вход Microsoft.");

            var token = await PostFormAsync(TokenEndpoint, new Dictionary<string, string>
            {
                ["client_id"] = clientId,
                ["grant_type"] = "authorization_code",
                ["code"] = code!,
                ["redirect_uri"] = redirectUri,
                ["code_verifier"] = verifier,
                ["scope"] = Scope,
            }, flow.Token);
            var account = await CompleteXboxChainAsync(token, flow.Token);
            Emit("success", account: account);
        }
        catch (OperationCanceledException)
        {
            Emit("cancelled");
        }
        catch (Exception error)
        {
            Emit("error", error.Message);
        }
        finally
        {
            if (listener.IsListening) listener.Stop();
            if (ReferenceEquals(_flowCancellation, flow))
            {
                _flowCancellation.Dispose();
                _flowCancellation = null;
            }
        }
    }

    private async Task<JsonObject> CompleteXboxChainAsync(JsonObject microsoftToken, CancellationToken cancellation)
    {
        var msAccessToken = Required(microsoftToken, "access_token", "Microsoft не вернул access token.");
        var refreshToken = Required(microsoftToken, "refresh_token", "Microsoft не вернул refresh token.");

        var xbox = await PostJsonAsync("https://user.auth.xboxlive.com/user/authenticate", new JsonObject
        {
            ["Properties"] = new JsonObject
            {
                ["AuthMethod"] = "RPS",
                ["SiteName"] = "user.auth.xboxlive.com",
                ["RpsTicket"] = "d=" + msAccessToken,
            },
            ["RelyingParty"] = "http://auth.xboxlive.com",
            ["TokenType"] = "JWT",
        }, cancellation);
        var xboxToken = Required(xbox, "Token", "Xbox Live не вернул токен.");

        var xsts = await PostJsonAsync("https://xsts.auth.xboxlive.com/xsts/authorize", new JsonObject
        {
            ["Properties"] = new JsonObject
            {
                ["SandboxId"] = "RETAIL",
                ["UserTokens"] = new JsonArray(xboxToken),
            },
            ["RelyingParty"] = "rp://api.minecraftservices.com/",
            ["TokenType"] = "JWT",
        }, cancellation);
        var xstsToken = Required(xsts, "Token", "XSTS не вернул токен.");
        var uhs = xsts["DisplayClaims"]?["xui"]?[0]?["uhs"]?.GetValue<string>()
            ?? throw new InvalidOperationException("Xbox Live не вернул user hash.");

        var minecraftLogin = await PostJsonAsync(
            "https://api.minecraftservices.com/authentication/login_with_xbox",
            new JsonObject { ["identityToken"] = $"XBL3.0 x={uhs};{xstsToken}" },
            cancellation);
        var minecraftAccessToken = Required(minecraftLogin, "access_token", "Minecraft Services не вернул токен.");

        using var profileRequest = new HttpRequestMessage(HttpMethod.Get, "https://api.minecraftservices.com/minecraft/profile");
        profileRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", minecraftAccessToken);
        using var profileResponse = await _http.SendAsync(profileRequest, cancellation);
        if (profileResponse.StatusCode == HttpStatusCode.NotFound)
            throw new InvalidOperationException("На аккаунте не найдена лицензия Minecraft: Java Edition.");
        await EnsureSuccessAsync(profileResponse);
        var profile = JsonNode.Parse(await profileResponse.Content.ReadAsStringAsync(cancellation))?.AsObject()
            ?? throw new InvalidOperationException("Minecraft вернул пустой профиль.");
        var id = Required(profile, "id", "Minecraft не вернул UUID.");
        var name = Required(profile, "name", "Minecraft не вернул никнейм.");
        var dashedUuid = id.Length == 32
            ? $"{id[..8]}-{id[8..12]}-{id[12..16]}-{id[16..20]}-{id[20..]}"
            : id;
        var variant = profile["skins"]?[0]?["variant"]?.GetValue<string>();

        return new JsonObject
        {
            ["id"] = "microsoft-" + id,
            ["username"] = name,
            ["uuid"] = dashedUuid,
            ["type"] = "microsoft",
            ["skinModel"] = string.Equals(variant, "SLIM", StringComparison.OrdinalIgnoreCase) ? "slim" : "classic",
            ["accessToken"] = minecraftAccessToken,
            ["refreshToken"] = refreshToken,
            ["expiresAt"] = DateTimeOffset.UtcNow.AddHours(23).ToUnixTimeMilliseconds(),
        };
    }

    private async Task<JsonObject> PostFormAsync(string uri, Dictionary<string, string> values, CancellationToken cancellation)
    {
        using var response = await _http.PostAsync(uri, new FormUrlEncodedContent(values), cancellation);
        await EnsureSuccessAsync(response);
        return JsonNode.Parse(await response.Content.ReadAsStringAsync(cancellation))?.AsObject()
            ?? throw new InvalidOperationException("Сервис авторизации вернул пустой ответ.");
    }

    private async Task<JsonObject> PostJsonAsync(string uri, JsonObject payload, CancellationToken cancellation)
    {
        using var content = new StringContent(payload.ToJsonString(), Encoding.UTF8, "application/json");
        using var response = await _http.PostAsync(uri, content, cancellation);
        await EnsureSuccessAsync(response);
        return JsonNode.Parse(await response.Content.ReadAsStringAsync(cancellation))?.AsObject()
            ?? throw new InvalidOperationException("Сервис авторизации вернул пустой ответ.");
    }

    private static async Task EnsureSuccessAsync(HttpResponseMessage response)
    {
        if (response.IsSuccessStatusCode) return;
        var raw = await response.Content.ReadAsStringAsync();
        string? detail = null;
        try
        {
            var json = JsonNode.Parse(raw);
            detail = json?["error_description"]?.GetValue<string>()
                ?? json?["errorMessage"]?.GetValue<string>()
                ?? json?["message"]?.GetValue<string>();
        }
        catch { }
        throw new InvalidOperationException(FriendlyMicrosoftError(detail ?? raw)
            ?? $"Ошибка авторизации Microsoft: {(int)response.StatusCode}.");
    }

    private void Emit(string state, string? message = null, JsonObject? account = null)
    {
        var value = new JsonObject { ["state"] = state };
        if (!string.IsNullOrWhiteSpace(message)) value["message"] = message;
        if (account is not null) value["account"] = account.DeepClone();
        Status?.Invoke(value);
    }

    private static int ReservePort()
    {
        var listener = new System.Net.Sockets.TcpListener(IPAddress.Loopback, 0);
        listener.Start();
        var port = ((IPEndPoint)listener.LocalEndpoint).Port;
        listener.Stop();
        return port;
    }

    private static string Required(JsonObject value, string key, string error) =>
        value[key]?.GetValue<string>() ?? throw new InvalidOperationException(error);

    private static string? FriendlyMicrosoftError(string? error)
    {
        if (string.IsNullOrWhiteSpace(error)) return null;
        if (error.Contains("Invalid app registration", StringComparison.OrdinalIgnoreCase)
            || error.Contains("AppRegInfo", StringComparison.OrdinalIgnoreCase))
            return "Этот Application ID ещё не разрешён Minecraft Services. Отправьте приложение на проверку Microsoft/Mojang — настройки лаунчера и пароль здесь ни при чём.";
        if (error.Contains("AADSTS50011", StringComparison.OrdinalIgnoreCase)
            || error.Contains("reply URL", StringComparison.OrdinalIgnoreCase))
            return "Для Microsoft приложения не добавлен адрес возврата http://localhost в разделе Authentication → Mobile and desktop applications.";
        if (error.Contains("AADSTS700016", StringComparison.OrdinalIgnoreCase))
            return "Microsoft не нашёл указанное приложение. Проверьте Application (client) ID в настройках Vela Launcher.";
        return error.Length > 420 ? error[..420] : error;
    }

    private static string Base64Url(byte[] bytes) =>
        Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');

    private static string Form(IReadOnlyDictionary<string, string> values) =>
        string.Join("&", values.Select(pair => $"{Uri.EscapeDataString(pair.Key)}={Uri.EscapeDataString(pair.Value)}"));

    private static string CallbackPage(bool success, string detail)
    {
        var color = success ? "#45D39A" : "#FF667C";
        var icon = success ? "&#10003;" : "!";
        var title = success ? "Вход выполнен" : "Не удалось войти";
        return "<!doctype html><html lang=\"ru\"><meta charset=\"utf-8\">" +
               "<meta name=\"viewport\" content=\"width=device-width\"><title>Vela Launcher</title>" +
               "<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#080a10;color:#f3f5fa;font:16px Inter,Segoe UI,sans-serif}" +
               ".box{width:min(440px,calc(100% - 40px));padding:36px;border:1px solid #252d3d;border-radius:16px;background:#10141c;text-align:center;box-shadow:0 24px 70px #0008}" +
               $".dot{{width:54px;height:54px;margin:0 auto 18px;border-radius:14px;display:grid;place-items:center;background:{color}20;color:{color};font-size:28px}}" +
               "h1{font-size:24px;margin:0 0 10px}p{color:#9aa4b6;line-height:1.5;margin:0}</style>" +
               $"<div class=\"box\"><div class=\"dot\">{icon}</div><h1>{title}</h1><p>{WebUtility.HtmlEncode(detail)}</p></div></html>";
    }
}
