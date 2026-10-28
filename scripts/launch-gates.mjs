const env = process.env;
const truthy = (value) => value === "true" || value === "1" || value === true;
const has = (value) => typeof value === "string" && value.trim().length > 0;
const lengthAtLeast = (value, length) => has(value) && value.trim().length >= length;
const all = (checks) => checks.every(Boolean);
const isAes256Key = (value) => {
  if (!has(value)) return false;
  if (/^[0-9a-f]{64}$/i.test(value)) return true;
  try {
    return Buffer.from(value, "base64").length === 32;
  } catch {
    return false;
  }
};
const productionPostgres = env.APP_MODE === "production" && env.DATA_PROVIDER === "postgres" && has(env.DATABASE_URL);
const stripeTestKey = env.STRIPE_SECRET_KEY?.startsWith("sk_test_") === true;
const stripeLiveKey = env.STRIPE_SECRET_KEY?.startsWith("sk_live_") === true;
const explicitlyFalse = (value) => value === "false" || value === "0" || value === false;
const publicFreePlacementVariables = [
  "BOOST_PLACEMENT_HOMEPAGE_ENABLED",
  "BOOST_PLACEMENT_CATEGORY_ENABLED",
  "BOOST_PLACEMENT_RANKING_ENABLED",
  "BOOST_PLACEMENT_PROFILE_ENABLED",
  "BOOST_PLACEMENT_BREAKOUT_ENABLED",
];
const futureFeatureVariables = ["FEATURE_CREATORS", "FEATURE_CAMPAIGNS", "FEATURE_AUCTION", "FEATURE_PUBLIC_API"];
const nonFanwardFutureFeatureVariables = ["FEATURE_CAMPAIGNS", "FEATURE_AUCTION", "FEATURE_PUBLIC_API"];
const expectedMigrationCount = env.EXPECTED_MIGRATION_COUNT === "15";
const trustedProxyConfigured = env.TRUSTED_PROXY_MODE === "direct_nginx" || env.TRUSTED_PROXY_MODE === "cloudflare_nginx";
const trustedProxyDirectNginx = env.TRUSTED_PROXY_MODE === "direct_nginx";
const turnstileConfigured = truthy(env.TURNSTILE_REQUIRED) && has(env.TURNSTILE_SITE_KEY) && has(env.TURNSTILE_SECRET_KEY) && has(env.TURNSTILE_EXPECTED_HOSTNAME);
const transactionalEmailConfigured = env.EMAIL_PROVIDER === "http" && has(env.EMAIL_FROM) && has(env.EMAIL_HTTP_URL) && has(env.EMAIL_HTTP_API_KEY);
const trackerConfigured = truthy(env.TRACKER_ENABLED) && lengthAtLeast(env.TRACKER_SIGNING_SECRET, 32) && lengthAtLeast(env.TRACKER_HASH_SECRET || env.TRACKER_HASH_SALT, 32) && lengthAtLeast(env.TRACKER_KEY_ROTATION_SECRET, 32);
const publicCommercialUiDisabled = explicitlyFalse(env.NEXT_PUBLIC_COMMERCIAL_ENABLED);
const publicRadarDisabled = explicitlyFalse(env.NEXT_PUBLIC_RADAR_ENABLED);
const commercialBackendsDisabled = explicitlyFalse(env.STRIPE_ENABLED) && explicitlyFalse(env.BOOST_ENABLED) && explicitlyFalse(env.BOOST_LIVE_MODE_ENABLED) && explicitlyFalse(env.GA4_ENABLED);
const paidPlacementsDisabled = publicFreePlacementVariables.every((name) => explicitlyFalse(env[name]));
const publicRevenueDisabled = explicitlyFalse(env.PUBLIC_REVENUE_BOARD_ENABLED);
const publicPageMetricsDisabled = explicitlyFalse(env.PUBLIC_PAGE_METRICS_ENABLED);
const futureFeaturesDisabled = futureFeatureVariables.every((name) => explicitlyFalse(env[name]));
const creatorsEnabled = truthy(env.FEATURE_CREATORS);
const nonFanwardFutureFeaturesDisabled = nonFanwardFutureFeatureVariables.every((name) => explicitlyFalse(env[name]));
const noncommercialCoreChecks = [
  productionPostgres,
  expectedMigrationCount,
  trustedProxyConfigured,
  turnstileConfigured,
  transactionalEmailConfigured,
  trackerConfigured,
  publicCommercialUiDisabled,
  publicRadarDisabled,
  commercialBackendsDisabled,
  paidPlacementsDisabled,
  publicRevenueDisabled,
  publicPageMetricsDisabled,
];

const gates = {
  publicFree: {
    ready: all([
      ...noncommercialCoreChecks,
      futureFeaturesDisabled,
    ]),
    checks: {
      productionPostgres,
      expectedMigrationCount,
      trustedProxyConfigured,
      turnstileConfigured,
      transactionalEmailConfigured,
      trackerConfigured,
      publicCommercialUiDisabled,
      publicRadarDisabled,
      commercialBackendsDisabled,
      paidPlacementsDisabled,
      publicRevenueDisabled,
      publicPageMetricsDisabled,
      futureFeaturesDisabled,
    },
  },
  fanwardMvp: {
    ready: all([
      ...noncommercialCoreChecks,
      trustedProxyDirectNginx,
      creatorsEnabled,
      nonFanwardFutureFeaturesDisabled,
    ]),
    checks: {
      productionPostgres,
      expectedMigrationCount,
      trustedProxyConfigured,
      trustedProxyDirectNginx,
      turnstileConfigured,
      transactionalEmailConfigured,
      trackerConfigured,
      publicCommercialUiDisabled,
      publicRadarDisabled,
      commercialBackendsDisabled,
      paidPlacementsDisabled,
      publicRevenueDisabled,
      publicPageMetricsDisabled,
      creatorsEnabled,
      nonFanwardFutureFeaturesDisabled,
    },
  },
  tracker: {
    ready: all([productionPostgres, truthy(env.TRACKER_ENABLED), lengthAtLeast(env.TRACKER_SIGNING_SECRET, 32), lengthAtLeast(env.TRACKER_HASH_SECRET || env.TRACKER_HASH_SALT, 32), lengthAtLeast(env.TRACKER_KEY_ROTATION_SECRET, 32)]),
    checks: {
      productionPostgres,
      trackerEnabled: truthy(env.TRACKER_ENABLED),
      signingSecretConfigured: lengthAtLeast(env.TRACKER_SIGNING_SECRET, 32),
      hashSecretConfigured: lengthAtLeast(env.TRACKER_HASH_SECRET || env.TRACKER_HASH_SALT, 32),
      keyRotationSecretConfigured: lengthAtLeast(env.TRACKER_KEY_ROTATION_SECRET, 32),
    },
  },
  ga4: {
    ready: all([productionPostgres, truthy(env.GA4_ENABLED), env.GA4_PROVIDER_MODE === "google", has(env.GA4_OAUTH_CLIENT_ID), has(env.GA4_OAUTH_CLIENT_SECRET), has(env.GA4_OAUTH_REDIRECT_URI), isAes256Key(env.GA4_TOKEN_ENCRYPTION_KEY)]),
    checks: {
      productionPostgres,
      ga4Enabled: truthy(env.GA4_ENABLED),
      googleProvider: env.GA4_PROVIDER_MODE === "google",
      oauthClientConfigured: has(env.GA4_OAUTH_CLIENT_ID) && has(env.GA4_OAUTH_CLIENT_SECRET),
      redirectConfigured: has(env.GA4_OAUTH_REDIRECT_URI),
      tokenEncryptionKeyConfigured: isAes256Key(env.GA4_TOKEN_ENCRYPTION_KEY),
    },
  },
  stripeTest: {
    ready: all([productionPostgres, truthy(env.STRIPE_ENABLED), truthy(env.STRIPE_TEST_MODE_REQUIRED ?? true), stripeTestKey, has(env.STRIPE_WEBHOOK_SECRET), has(env.STRIPE_CHECKOUT_SUCCESS_URL), has(env.STRIPE_CHECKOUT_CANCEL_URL)]),
    checks: {
      productionPostgres,
      stripeEnabled: truthy(env.STRIPE_ENABLED),
      testModeRequired: truthy(env.STRIPE_TEST_MODE_REQUIRED ?? true),
      testSecretConfigured: stripeTestKey,
      webhookSecretConfigured: has(env.STRIPE_WEBHOOK_SECRET),
      checkoutUrlsConfigured: has(env.STRIPE_CHECKOUT_SUCCESS_URL) && has(env.STRIPE_CHECKOUT_CANCEL_URL),
    },
  },
  stripeLive: {
    ready: all([productionPostgres, truthy(env.STRIPE_ENABLED), env.STRIPE_TEST_MODE_REQUIRED === "false", stripeLiveKey, env.STRIPE_PUBLISHABLE_KEY?.startsWith("pk_live_") === true, has(env.STRIPE_WEBHOOK_SECRET), env.STRIPE_LIVE_APPROVAL === "YES"]),
    checks: {
      productionPostgres,
      stripeEnabled: truthy(env.STRIPE_ENABLED),
      testModeDisabled: env.STRIPE_TEST_MODE_REQUIRED === "false",
      liveSecretConfigured: stripeLiveKey,
      livePublishableKeyConfigured: env.STRIPE_PUBLISHABLE_KEY?.startsWith("pk_live_") === true,
      webhookSecretConfigured: has(env.STRIPE_WEBHOOK_SECRET),
      explicitApproval: env.STRIPE_LIVE_APPROVAL === "YES",
    },
    note: "This gate is intentionally false until an explicit live-approval change is made outside this implementation task.",
  },
};

const placementSwitches = {
  homepage_boosted: "BOOST_PLACEMENT_HOMEPAGE_ENABLED",
  category_boosted: "BOOST_PLACEMENT_CATEGORY_ENABLED",
  ranking_feed_insert: "BOOST_PLACEMENT_RANKING_ENABLED",
  site_profile_recommendation: "BOOST_PLACEMENT_PROFILE_ENABLED",
  breakout_sponsor: "BOOST_PLACEMENT_BREAKOUT_ENABLED",
};
for (const [placement, variable] of Object.entries(placementSwitches)) {
  gates[`boost:${placement}`] = {
    ready: all([productionPostgres, truthy(env.BOOST_ENABLED), truthy(env.BOOST_LIVE_MODE_ENABLED), truthy(env.STRIPE_ENABLED), gates.stripeTest.ready, truthy(env[variable])]),
    checks: {
      productionPostgres,
      boostEnabled: truthy(env.BOOST_ENABLED),
      boostLiveModeEnabled: truthy(env.BOOST_LIVE_MODE_ENABLED),
      stripeEnabled: truthy(env.STRIPE_ENABLED),
      stripeTestGate: gates.stripeTest.ready,
      placementSwitch: truthy(env[variable]),
    },
  };
}

const output = {
  generatedAt: new Date().toISOString(),
  secretsPrinted: false,
  environment: { appMode: env.APP_MODE ?? null, dataProvider: env.DATA_PROVIDER ?? null },
  gates,
  releaseProfileReady: gates.publicFree.ready || gates.fanwardMvp.ready,
  readyCount: Object.values(gates).filter((gate) => gate.ready).length,
  totalGates: Object.keys(gates).length,
};
console.log(JSON.stringify(output, null, 2));
if (process.argv.includes("--strict") && !output.releaseProfileReady) process.exitCode = 1;
if (process.argv.includes("--strict-public-free") && !gates.publicFree.ready) process.exitCode = 1;
if (process.argv.includes("--strict-fanward-mvp") && !gates.fanwardMvp.ready) process.exitCode = 1;
