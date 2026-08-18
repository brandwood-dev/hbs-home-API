const configuredBaseUrl = process.env.SMOKE_BASE_URL?.trim();
if (!configuredBaseUrl) throw new Error("SMOKE_BASE_URL is required.");
const baseUrl = configuredBaseUrl.replace(/\/$/, "");

const expectedGitSha = process.env.EXPECTED_GIT_SHA;
const requestId = `smoke-${crypto.randomUUID()}`;

async function getJson(path: string): Promise<unknown> {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { "x-request-id": requestId },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error(`${path} returned HTTP ${String(response.status)}.`);
  }
  if (response.headers.get("x-request-id") !== requestId) {
    throw new Error(`${path} did not propagate the request ID.`);
  }
  return response.json();
}

const liveness = (await getJson("/health/live")) as {
  status?: unknown;
  service?: unknown;
};
if (liveness.status !== "ok" || liveness.service !== "hbs-home-api") {
  throw new Error("The liveness response does not match the API contract.");
}

const readiness = (await getJson("/health/ready")) as {
  status?: unknown;
};
if (readiness.status !== "ready") {
  throw new Error("The readiness response does not match the API contract.");
}

const version = (await getJson("/api/v1/version")) as {
  apiVersion?: unknown;
  contractVersion?: unknown;
  gitSha?: unknown;
};
if (version.apiVersion !== "v1" || version.contractVersion !== "1.0.0") {
  throw new Error("The deployed API contract version is unexpected.");
}
if (expectedGitSha && version.gitSha !== expectedGitSha) {
  throw new Error(
    `Expected deployed SHA ${expectedGitSha}, received ${String(version.gitSha)}.`,
  );
}

console.log(
  JSON.stringify({
    status: "ok",
    baseUrl,
    gitSha: version.gitSha,
    contractVersion: version.contractVersion,
  }),
);
