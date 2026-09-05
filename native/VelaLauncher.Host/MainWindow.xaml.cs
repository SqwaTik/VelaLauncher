using System.Diagnostics;
using System.IO;
using System.Text.Json;
using System.Windows;
using System.Windows.Input;
using Microsoft.Web.WebView2.Core;
using VelaLauncher.Host.Services;

namespace VelaLauncher.Host;

public partial class MainWindow : Window
{
    private NativeBridge? _bridge;
    private readonly StateStore _state = new();

    public MainWindow()
    {
        InitializeComponent();
        Loaded += async (_, _) => await InitializeWebViewAsync();
        PreviewKeyDown += OnPreviewKeyDown;
    }

    private void OnPreviewKeyDown(object sender, KeyEventArgs eventArgs)
    {
        if (eventArgs.Key != Key.F11) return;
        WindowState = WindowState == WindowState.Maximized ? WindowState.Normal : WindowState.Maximized;
        eventArgs.Handled = true;
    }

    private async Task InitializeWebViewAsync()
    {
        var userData = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
            "Vela Launcher",
            "WebView2");
        Directory.CreateDirectory(userData);
        var environment = await CoreWebView2Environment.CreateAsync(null, userData);
        await WebView.EnsureCoreWebView2Async(environment);

        var webRoot = Path.Combine(AppContext.BaseDirectory, "wwwroot");
        if (!Directory.Exists(webRoot))
            throw new DirectoryNotFoundException($"Интерфейс Vela не найден: {webRoot}");

        WebView.CoreWebView2.SetVirtualHostNameToFolderMapping(
            "app.vela",
            webRoot,
            CoreWebView2HostResourceAccessKind.DenyCors);
        WebView.CoreWebView2.Settings.AreDefaultContextMenusEnabled = false;
        WebView.CoreWebView2.Settings.AreBrowserAcceleratorKeysEnabled = false;
#if !DEBUG
        WebView.CoreWebView2.Settings.AreDevToolsEnabled = false;
#endif
        WebView.CoreWebView2.NewWindowRequested += (_, args) =>
        {
            args.Handled = true;
            Process.Start(new ProcessStartInfo(args.Uri) { UseShellExecute = true });
        };

        _bridge = new NativeBridge(this, WebView.CoreWebView2, _state);
        WebView.CoreWebView2.WebMessageReceived += _bridge.OnMessageReceived;
        WebView.CoreWebView2.AddWebResourceRequestedFilter(
            "https://media.vela/*",
            CoreWebView2WebResourceContext.All);
        WebView.CoreWebView2.WebResourceRequested += ServeLocalMedia;
        WebView.Source = new Uri("https://app.vela/index.html");
    }

    private void ServeLocalMedia(object? sender, CoreWebView2WebResourceRequestedEventArgs args)
    {
        if (!args.Request.Uri.StartsWith("https://media.vela/local/", StringComparison.OrdinalIgnoreCase))
            return;
        try
        {
            var encoded = args.Request.Uri["https://media.vela/local/".Length..];
            var path = Uri.UnescapeDataString(encoded);
            if (!_state.IsAllowedMediaPath(path) || !File.Exists(path))
            {
                args.Response = WebView.CoreWebView2.Environment.CreateWebResourceResponse(
                    null, 403, "Forbidden", "Content-Type: text/plain");
                return;
            }
            var stream = File.Open(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite);
            var extension = Path.GetExtension(path).ToLowerInvariant();
            var mime = extension switch
            {
                ".png" => "image/png",
                ".jpg" or ".jpeg" => "image/jpeg",
                ".gif" => "image/gif",
                ".webp" => "image/webp",
                ".mp4" => "video/mp4",
                ".webm" => "video/webm",
                _ => "application/octet-stream",
            };
            args.Response = WebView.CoreWebView2.Environment.CreateWebResourceResponse(
                stream, 200, "OK", $"Content-Type: {mime}\r\nCache-Control: no-cache");
        }
        catch
        {
            args.Response = WebView.CoreWebView2.Environment.CreateWebResourceResponse(
                null, 404, "Not Found", "Content-Type: text/plain");
        }
    }
}
