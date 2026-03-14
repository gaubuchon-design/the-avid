const { notarize } = require('@electron/notarize');

exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;
  if (electronPlatformName !== 'darwin') return;

  const appleId = process.env.APPLE_ID;
  const teamId = process.env.APPLE_TEAM_ID;
  const appSpecificPassword = process.env.APPLE_APP_SPECIFIC_PASSWORD;

  if (!appleId || !teamId) {
    // In CI, missing credentials is an error — unsigned apps get rejected by Gatekeeper
    if (process.env.CI) {
      throw new Error(
        'Notarization FAILED: APPLE_ID and APPLE_TEAM_ID must be set in CI. ' +
        'Without notarization, macOS will reject the app as "damaged". ' +
        'Add these as GitHub Actions secrets.'
      );
    }
    console.log('Skipping notarization (local dev build): APPLE_ID or APPLE_TEAM_ID not set');
    return;
  }

  if (!appSpecificPassword) {
    throw new Error(
      'Notarization FAILED: APPLE_APP_SPECIFIC_PASSWORD is required. ' +
      'Generate one at https://appleid.apple.com/account/manage → App-Specific Passwords.'
    );
  }

  const appName = context.packager.appInfo.productFilename;
  console.log(`Notarizing ${appName}...`);

  await notarize({
    appBundleId: 'com.theavid.app',
    appPath: `${appOutDir}/${appName}.app`,
    appleId,
    appleIdPassword: appSpecificPassword,
    teamId,
  });

  console.log('Notarization complete.');
};
