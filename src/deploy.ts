import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export interface DeployConfig {
  renderApiKey: string;
  serviceId: string;
  backendDir: string;
  githubUser: string;
  githubToken: string;
  githubRepoName: string;
  buildCommand: string;
  startCommand: string;
}

export interface EnvVarItem {
  key: string;
  value: string;
}

export interface RemoteEnvItem {
  envVar?: {
    key: string;
    value: string;
  };
  cursor?: string;
}

const RENDER_API_BASE = 'https://api.render.com/v1';
const ENV_PAGE_SIZE = 20;
const DEPLOY_LOOKUP_DELAY_MS = 2000;
const DEPLOY_POLL_INTERVAL_MS = 5000;
const FAILED_DEPLOY_STATUSES = new Set(['build_failed', 'update_failed', 'canceled']);
const ENV_OVERRIDES: Record<string, string> = { NODE_ENV: 'production', PORT: '10000' };

// Defensive guard: even if someone accidentally puts deploy keys in .env.render, don't send them to Render
const DEPLOY_TOOL_KEYS = new Set([
  'RENDER_API_KEY',
  'RENDER_SERVICE_ID',
  'GITHUB_USER',
  'GITHUB_TOKEN',
  'GITHUB_REPO_NAME',
  'BACKEND_DIR',
  'BUILD_COMMAND',
  'START_COMMAND',
]);

const DIVIDER = '═══════════════════════════════════════════════════════════';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function run(command: string, cwd: string): string {
  try {
    return execSync(command, {
      cwd,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch (error: any) {
    if (error.stderr) console.error(error.stderr);
    throw error;
  }
}

async function renderApi<T = any>(endpoint: string, apiKey: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${RENDER_API_BASE}${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Render API Error [${response.status} ${response.statusText}]: ${errorText}`);
  }

  const text = await response.text();
  return text ? (JSON.parse(text) as T) : ({} as T);
}

function stripQuotes(value: string): string {
  const isQuoted =
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"));
  return isQuoted ? value.slice(1, -1) : value;
}

function parseEnvFile(filePath: string): EnvVarItem[] {
  if (!fs.existsSync(filePath)) return [];

  const vars: EnvVarItem[] = [];
  const lines = fs.readFileSync(filePath, 'utf-8').split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const equalsIdx = trimmed.indexOf('=');
    if (equalsIdx === -1) continue;

    const key = trimmed.slice(0, equalsIdx).trim();

    if (DEPLOY_TOOL_KEYS.has(key)) continue;

    const rawValue = stripQuotes(trimmed.slice(equalsIdx + 1).trim());
    const value = ENV_OVERRIDES[key] ?? rawValue;

    vars.push({ key, value });
  }

  return vars;
}

function loadEnvIntoProcess(envPath: string): void {
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx !== -1) {
      const key = trimmed.slice(0, idx).trim();
      const val = stripQuotes(trimmed.slice(idx + 1).trim());
      if (!process.env[key] && val) {
        process.env[key] = val;
      }
    }
  }
}

async function getService(serviceId: string, apiKey: string): Promise<{ name: string; url: string }> {
  const service = await renderApi<{ name?: string; serviceDetails?: { url?: string } }>(
    `/services/${serviceId}`,
    apiKey,
  );
  const name = service.name || 'Web Service';
  const url = service.serviceDetails?.url || `https://${name}.onrender.com`;
  return { name, url };
}

async function getRemoteEnvVars(serviceId: string, apiKey: string): Promise<RemoteEnvItem[]> {
  const all: RemoteEnvItem[] = [];
  let cursor: string | null = null;

  while (true) {
    const query: string = `limit=${ENV_PAGE_SIZE}${cursor ? `&cursor=${cursor}` : ''}`;
    const page: RemoteEnvItem[] = await renderApi<RemoteEnvItem[]>(`/services/${serviceId}/env-vars?${query}`, apiKey);

    if (!Array.isArray(page) || page.length === 0) break;

    all.push(...page);
    cursor = page[page.length - 1].cursor || null;

    if (page.length < ENV_PAGE_SIZE) break;
  }

  return all;
}

async function updateBuildConfig(config: DeployConfig): Promise<void> {
  await renderApi(`/services/${config.serviceId}`, config.renderApiKey, {
    method: 'PATCH',
    body: JSON.stringify({
      autoDeploy: 'no',
      serviceDetails: {
        envSpecificDetails: {
          buildCommand: config.buildCommand,
          startCommand: config.startCommand,
        },
      },
    }),
  });
}

async function replaceEnvVars(serviceId: string, apiKey: string, envVars: EnvVarItem[]): Promise<any> {
  return renderApi(`/services/${serviceId}/env-vars`, apiKey, {
    method: 'PUT',
    body: JSON.stringify(envVars),
  });
}

async function triggerDeploy(serviceId: string, apiKey: string): Promise<string> {
  await renderApi(`/services/${serviceId}/deploys`, apiKey, {
    method: 'POST',
    body: JSON.stringify({ clearCache: 'clear' }),
  });

  await sleep(DEPLOY_LOOKUP_DELAY_MS);

  const deploys = await renderApi<Array<{ deploy?: { id?: string } }>>(
    `/services/${serviceId}/deploys?limit=1`,
    apiKey,
  );
  const deployId = deploys[0]?.deploy?.id;

  if (!deployId) {
    throw new Error('Could not retrieve new deploy ID from Render.');
  }

  return deployId;
}

async function monitorDeploy(serviceId: string, apiKey: string, deployId: string, liveUrl: string): Promise<void> {
  const startTime = Date.now();
  let lastStatus = '';

  while (true) {
    const { status } = await renderApi<{ status: string }>(
      `/services/${serviceId}/deploys/${deployId}`,
      apiKey,
    );

    if (status !== lastStatus) {
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      console.log(`  ➜ Status: [${status}] (${elapsed}s elapsed)`);
      lastStatus = status;
    }

    if (status === 'live') {
      console.log(`\n🎉 ${DIVIDER}`);
      console.log('✅ BACKEND DEPLOYED SUCCESSFULLY TO RENDER!');
      console.log(`🌐 Live API URL: ${liveUrl}`);
      console.log(`${DIVIDER}\n`);
      return;
    }

    if (FAILED_DEPLOY_STATUSES.has(status)) {
      console.error(`\n❌ ${DIVIDER}`);
      console.error(`💥 Deployment ended with status: ${status}`);
      console.error(
        `Check live logs: https://dashboard.render.com/web/${serviceId}/deploys/${deployId}`,
      );
      console.error(`${DIVIDER}\n`);
      process.exit(1);
    }

    await sleep(DEPLOY_POLL_INTERVAL_MS);
  }
}

function getCurrentBranch(cwd: string): string {
  try {
    return run('git rev-parse --abbrev-ref HEAD', cwd) || 'main';
  } catch {
    return 'main';
  }
}

function ensureAuthenticatedRemote(cwd: string, authRepoUrl: string): void {
  const currentRemote = run('git remote get-url origin', cwd);
  if (currentRemote !== authRepoUrl) {
    run(`git remote set-url origin "${authRepoUrl}"`, cwd);
  }
}

function getCodeStatus(cwd: string, branch: string): { uncommittedChanges: string; hasCodeChanged: boolean } {
  try {
    run(`git fetch origin ${branch} --quiet`, cwd);
  } catch {
    // ignore
  }

  const uncommittedChanges = run('git status --porcelain', cwd);
  const unpushedCommits = run(`git log origin/${branch}..HEAD --oneline`, cwd);

  return {
    uncommittedChanges,
    hasCodeChanged: Boolean(uncommittedChanges || unpushedCommits),
  };
}

function syncCodeToGitHub(cwd: string, branch: string, uncommittedChanges: string): void {
  if (uncommittedChanges) {
    console.log('  ➜ Detected uncommitted changes, committing...');
    run('git add .', cwd);
    const commitMsg = `deploy: auto-sync ${new Date().toISOString()}`;
    run(`git commit -m "${commitMsg}"`, cwd);
    console.log(`  ✓ Committed: ${commitMsg}`);
  }

  console.log(`  ➜ Pushing to GitHub origin/${branch}...`);
  run(`git push origin ${branch}`, cwd);
  console.log('  ✓ Code pushed to GitHub successfully.\n');
}

function hasEnvDiff(localEnvVars: EnvVarItem[], remoteEnvList: RemoteEnvItem[]): boolean {
  const remoteEnvMap = new Map<string, string>();
  for (const item of remoteEnvList) {
    if (item.envVar) {
      remoteEnvMap.set(item.envVar.key, item.envVar.value);
    }
  }

  if (localEnvVars.length !== remoteEnvMap.size) return true;

  return localEnvVars.some(({ key, value }) => remoteEnvMap.get(key) !== value);
}

export async function runDeploy(rootDir = process.cwd()): Promise<void> {
  // 1. Load deployment credentials from .env
  const localEnvPath = path.join(rootDir, '.env');
  if (fs.existsSync(localEnvPath)) {
    loadEnvIntoProcess(localEnvPath);
  }

  // 2. Production variables come strictly from .env.render
  const rootRenderEnv = path.join(rootDir, '.env.render');
  const targetRenderEnvPath = fs.existsSync(rootRenderEnv)
    ? rootRenderEnv
    : path.join(rootDir, process.env.BACKEND_DIR || '.', '.env.render');

  if (!fs.existsSync(targetRenderEnvPath)) {
    console.error(`\n❌ Error: .env.render file not found!`);
    console.error('All production application environment variables must be defined in .env.render.');
    console.error('Run "render-deploy init" to create it.\n');
    process.exit(1);
  }

  const config: DeployConfig = {
    renderApiKey: process.env.RENDER_API_KEY || '',
    serviceId: process.env.RENDER_SERVICE_ID || '',
    backendDir: path.resolve(rootDir, process.env.BACKEND_DIR || '.'),
    githubUser: process.env.GITHUB_USER || '',
    githubToken: process.env.GITHUB_TOKEN || '',
    githubRepoName: process.env.GITHUB_REPO_NAME || '',
    buildCommand: process.env.BUILD_COMMAND || 'npm install --include=dev && npx prisma generate && npm run build',
    startCommand: process.env.START_COMMAND || 'npm run start:prod',
  };

  const missing = [];
  if (!config.renderApiKey) missing.push('RENDER_API_KEY');
  if (!config.serviceId) missing.push('RENDER_SERVICE_ID');
  if (!config.githubUser) missing.push('GITHUB_USER');
  if (!config.githubToken) missing.push('GITHUB_TOKEN');
  if (!config.githubRepoName) missing.push('GITHUB_REPO_NAME');

  if (missing.length > 0) {
    console.error(`\n❌ Missing deployment credentials in .env: ${missing.join(', ')}`);
    console.error('Please configure your deployment keys in .env before deploying.\n');
    process.exit(1);
  }

  const githubAuthRepo = `https://${config.githubUser}:${config.githubToken}@github.com/${config.githubUser}/${config.githubRepoName}.git`;

  console.log(DIVIDER);
  console.log('🚀 Universal Smart 1-Click Cloud Deploy');
  console.log(`${DIVIDER}\n`);

  console.log('🌐 Connecting to Render API...');
  const { name: serviceName, url: liveUrl } = await getService(config.serviceId, config.renderApiKey);
  console.log(`  ✓ Target Service: ${serviceName} (${config.serviceId})`);
  console.log(`  ✓ Live Web URL  : ${liveUrl}\n`);

  const branch = getCurrentBranch(config.backendDir);
  console.log('🔍 Checking code status...');
  ensureAuthenticatedRemote(config.backendDir, githubAuthRepo);
  const { uncommittedChanges, hasCodeChanged } = getCodeStatus(config.backendDir, branch);

  console.log(`🔍 Checking production environment variables (${path.basename(targetRenderEnvPath)})...`);
  const productionEnvVars = parseEnvFile(targetRenderEnvPath);
  const remoteEnvList = await getRemoteEnvVars(config.serviceId, config.renderApiKey);
  const hasEnvChanged = hasEnvDiff(productionEnvVars, remoteEnvList);

  if (!hasCodeChanged && !hasEnvChanged) {
    const headCommit = run('git log -1 --format="%h - %s"', config.backendDir);
    console.log('\n🟢 Everything is up to date! Nothing to deploy:');
    console.log(`   • Service : ${serviceName}`);
    console.log(`   • Code    : Up to date (Branch: ${branch}, Commit: ${headCommit})`);
    console.log(`   • Env     : ${productionEnvVars.length} production variables match Render identically`);
    console.log(`   • Live URL: ${liveUrl}`);
    console.log('\n✨ Skipping redundant deployment.\n');
    return;
  }

  console.log('\n⚡ Changes detected:');
  if (hasCodeChanged) console.log('   • Code changes detected (new commit / uncommitted files)');
  if (hasEnvChanged) console.log('   • Production environment variable changes detected');
  console.log('');

  if (hasCodeChanged) {
    console.log('📦 Step 1: Syncing code to GitHub...');
    syncCodeToGitHub(config.backendDir, branch, uncommittedChanges);
  } else {
    console.log('📦 Step 1: Code is already up to date on GitHub.\n');
  }

  console.log('⚙️  Step 2: Verifying Render service build configuration...');
  await updateBuildConfig(config);
  console.log('  ✓ Build config verified.\n');

  if (hasEnvChanged) {
    console.log(`🔑 Step 3: Updating production environment variables on Render from .env.render...`);
    const synced = await replaceEnvVars(config.serviceId, config.renderApiKey, productionEnvVars);
    console.log(`  ✓ Synced ${synced.length} production variables to Render.`);
    console.log('  ✓ Stale/removed keys automatically cleaned up.\n');
  } else {
    console.log('🔑 Step 3: Production environment variables on Render are already up to date.\n');
  }

  console.log('⚡ Step 4: Triggering deployment on Render...');
  const deployId = await triggerDeploy(config.serviceId, config.renderApiKey);
  console.log(`  ✓ Deploy initiated (ID: ${deployId})\n`);

  console.log('👀 Step 5: Monitoring deployment in real-time...');
  await monitorDeploy(config.serviceId, config.renderApiKey, deployId, liveUrl);
}
