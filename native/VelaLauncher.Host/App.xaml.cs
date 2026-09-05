using System.Windows;

namespace VelaLauncher.Host;

public partial class App : Application
{
    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);
        DispatcherUnhandledException += (_, args) =>
        {
            MessageBox.Show(args.Exception.Message, "Vela Launcher", MessageBoxButton.OK, MessageBoxImage.Error);
            args.Handled = true;
        };
        new MainWindow().Show();
    }
}
