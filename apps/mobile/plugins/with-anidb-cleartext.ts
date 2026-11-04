// AniDB's HTTP API is only served over plain HTTP. Android blocks cleartext
// traffic by default, so allow it for api.anidb.net only; every other host
// stays HTTPS-only.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { AndroidConfig, withAndroidManifest, withDangerousMod } from "expo/config-plugins";
import type { ConfigPlugin } from "expo/config-plugins";

const CONFIG_NAME = "network_security_config";

const NETWORK_SECURITY_XML = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <base-config cleartextTrafficPermitted="false" />
  <domain-config cleartextTrafficPermitted="true">
    <domain includeSubdomains="false">api.anidb.net</domain>
  </domain-config>
</network-security-config>
`;

const withNetworkSecurityFile: ConfigPlugin = (config) =>
  withDangerousMod(config, [
    "android",
    (modConfig) => {
      const dir = path.join(modConfig.modRequest.platformProjectRoot, "app/src/main/res/xml");
      mkdirSync(dir, { recursive: true });
      writeFileSync(path.join(dir, `${CONFIG_NAME}.xml`), NETWORK_SECURITY_XML);
      return modConfig;
    },
  ]);

const withNetworkSecurityManifest: ConfigPlugin = (config) =>
  withAndroidManifest(config, (modConfig) => {
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(modConfig.modResults);
    application.$["android:networkSecurityConfig"] = `@xml/${CONFIG_NAME}`;
    return modConfig;
  });

export const withAniDbCleartext: ConfigPlugin = (config) =>
  withNetworkSecurityManifest(withNetworkSecurityFile(config));
