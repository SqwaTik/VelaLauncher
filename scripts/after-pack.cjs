const path = require("node:path");

module.exports = async function applyRoyaleWindowsResources(context) {
  if (context.electronPlatformName !== "win32") return;

  const { rcedit } = await import("rcedit");
  const appInfo = context.packager.appInfo;
  const executable = path.join(
    context.appOutDir,
    `${appInfo.productFilename}.exe`,
  );
  const icon = path.resolve(context.packager.projectDir, "build", "icon.ico");

  await rcedit(executable, {
    "version-string": {
      FileDescription: appInfo.description || appInfo.productName,
      ProductName: appInfo.productName,
      CompanyName: "SqwaTik",
      LegalCopyright: "Copyright © 2026 SqwaTik",
      InternalName: appInfo.productFilename,
      OriginalFilename: `${appInfo.productFilename}.exe`,
    },
    "file-version": appInfo.shortVersion || appInfo.version,
    "product-version": appInfo.version,
    icon,
  });
};
