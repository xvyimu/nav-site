/**
 * Disable Cloudflare HTML rewriters that break CSP nonces:
 * - rocket_loader → off
 * - minify.js → off (css/html left unchanged unless --all-minify)
 *
 * Requires API token with Zone.Zone Settings:Edit on the zone that fronts
 * yuanjia1314.ccwu.cc (NS currently luciane/lee.ns.cloudflare.com).
 *
 * Usage (pwsh):
 *   $env:CLOUDFLARE_API_TOKEN = '<zone-edit-token>'
 *   node scripts/cf-disable-rocket-loader.mjs
 *   node scripts/cf-disable-rocket-loader.mjs --zone-name yuanjia1314.ccwu.cc
 *   node scripts/cf-disable-rocket-loader.mjs --dry-run
 *
 * After success:
 *   node scripts/audit-edge-scripts.mjs
 * Expect mangledScriptTypeCount → 0 (may need ~1–2 min + cache purge).
 */
const token =
  process.env.CLOUDFLARE_API_TOKEN ||
  process.env.CF_API_TOKEN ||
  process.env.CF_ZONE_API_TOKEN;
if (!token) {
  console.error(
    "Missing CLOUDFLARE_API_TOKEN (need Zone.Zone Settings:Edit on production zone)."
  );
  process.exit(1);
}

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const zoneNameArg = (() => {
  const i = args.indexOf("--zone-name");
  return i >= 0 ? args[i + 1] : process.env.CF_ZONE_NAME || "yuanjia1314.ccwu.cc";
})();
const zoneIdArg = (() => {
  const i = args.indexOf("--zone-id");
  return i >= 0 ? args[i + 1] : process.env.CLOUDFLARE_ZONE_ID || process.env.CF_ZONE_ID;
})();
const allMinify = args.includes("--all-minify");

const api = "https://api.cloudflare.com/client/v4";
const headers = {
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
};

async function cf(path, init = {}) {
  const res = await fetch(`${api}${path}`, { ...init, headers: { ...headers, ...init.headers } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.success === false) {
    const err = body.errors || body;
    throw new Error(`${init.method || "GET"} ${path} → ${res.status} ${JSON.stringify(err)}`);
  }
  return body;
}

async function listZones() {
  const out = [];
  let page = 1;
  for (;;) {
    const data = await cf(`/zones?page=${page}&per_page=50`);
    out.push(...(data.result || []));
    const total = data.result_info?.total_pages || 1;
    if (page >= total) break;
    page += 1;
  }
  return out;
}

function pickZone(zones, host) {
  const matches = zones.filter(
    (z) => host === z.name || host.endsWith(`.${z.name}`)
  );
  matches.sort((a, b) => b.name.length - a.name.length);
  return matches[0] || null;
}

async function getSetting(zoneId, name) {
  const data = await cf(`/zones/${zoneId}/settings/${name}`);
  return data.result;
}

async function patchSetting(zoneId, name, value) {
  if (dryRun) {
    console.log(JSON.stringify({ dryRun: true, setting: name, wouldSet: value }));
    return { dryRun: true, value };
  }
  const data = await cf(`/zones/${zoneId}/settings/${name}`, {
    method: "PATCH",
    body: JSON.stringify({ value }),
  });
  return data.result;
}

async function main() {
  const verify = await cf("/user/tokens/verify");
  console.log(
    JSON.stringify({
      tokenStatus: verify.result?.status,
      dryRun,
      targetHost: zoneNameArg,
    })
  );

  let zoneId = zoneIdArg;
  let zoneName = zoneNameArg;
  if (!zoneId) {
    const zones = await listZones();
    console.log(
      JSON.stringify({
        zoneCount: zones.length,
        zoneNames: zones.map((z) => z.name),
      })
    );
    if (!zones.length) {
      console.error(
        "Token sees 0 zones. Create a token with Zone.Zone Settings:Edit for the zone whose NS is luciane/lee.ns.cloudflare.com (host yuanjia1314.ccwu.cc), or pass --zone-id."
      );
      process.exit(2);
    }
    const zone = pickZone(zones, zoneNameArg);
    if (!zone) {
      console.error(`No zone matches ${zoneNameArg}. Available: ${zones.map((z) => z.name).join(", ")}`);
      process.exit(3);
    }
    zoneId = zone.id;
    zoneName = zone.name;
  }

  console.log(JSON.stringify({ selectedZone: zoneName, zoneId }));

  const beforeRocket = await getSetting(zoneId, "rocket_loader");
  const beforeMinify = await getSetting(zoneId, "minify");
  console.log(
    JSON.stringify({
      before: {
        rocket_loader: beforeRocket?.value,
        minify: beforeMinify?.value,
      },
    })
  );

  const afterRocket = await patchSetting(zoneId, "rocket_loader", "off");
  const minifyValue = {
    css: allMinify ? "off" : beforeMinify?.value?.css ?? "off",
    html: allMinify ? "off" : beforeMinify?.value?.html ?? "off",
    js: "off",
  };
  const afterMinify = await patchSetting(zoneId, "minify", minifyValue);

  // Best-effort cache purge so HTML rewrites drop quickly
  if (!dryRun) {
    try {
      await cf(`/zones/${zoneId}/purge_cache`, {
        method: "POST",
        body: JSON.stringify({ purge_everything: true }),
      });
      console.log(JSON.stringify({ cachePurge: "everything" }));
    } catch (e) {
      console.log(JSON.stringify({ cachePurge: "skipped", reason: String(e.message || e) }));
    }
  }

  console.log(
    JSON.stringify({
      after: {
        rocket_loader: afterRocket?.value ?? afterRocket,
        minify: afterMinify?.value ?? afterMinify,
      },
      next: "node scripts/audit-edge-scripts.mjs  # expect mangledScriptTypeCount=0",
    })
  );
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
