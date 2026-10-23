import fs from 'node:fs';
import path from 'node:path';

const DEPLOYMENT_TOOL_KEYS = [
  { key: 'RENDER_API_KEY', comment: 'Render Dashboard -> Account Settings -> API Keys', defaultValue: '' },
  { key: 'RENDER_SERVICE_ID', comment: 'Render Service ID (e.g. srv-xxxxxxxxxxxxxxxxxxxx)', defaultValue: '' },
  { key: 'GITHUB_USER', comment: 'Your GitHub username or organization', defaultValue: '' },
  { key: 'GITHUB_TOKEN', comment: 'GitHub Personal Access Token (repo scope)', defaultValue: '' },
  { key: 'GITHUB_REPO_NAME', comment: 'GitHub repository name', defaultValue: '' },
  { key: 'BACKEND_DIR', comment: 'Subfolder path or "." if backend is in project root', defaultValue: '.' },
  { key: 'BUILD_COMMAND', comment: 'Build command executed on Render', defaultValue: 'npm install --include=dev && npx prisma generate && npm run build' },
  { key: 'START_COMMAND', comment: 'Start command executed on Render', defaultValue: 'npm run start:prod' },
];

const GITIGNORE_ENTRIES = ['.env', '.env.render', '.env.local', '.env.*.local'];

export async function runInit(targetDir = process.cwd()): Promise<void> {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('⚙️  Initializing Render Deployment Configuration');
  console.log('═══════════════════════════════════════════════════════════\n');

  const envPath = path.join(targetDir, '.env');
  const renderEnvPath = path.join(targetDir, '.env.render');
  const gitignorePath = path.join(targetDir, '.gitignore');
  const pkgPath = path.join(targetDir, 'package.json');

  // 1. .gitignore handling (protect both .env and .env.render)
  let gitignoreContent = '';
  if (fs.existsSync(gitignorePath)) {
    gitignoreContent = fs.readFileSync(gitignorePath, 'utf-8');
  }

  const missingGitignore = GITIGNORE_ENTRIES.filter((entry) => {
    const regex = new RegExp(`^${entry.replace('.', '\\.')}\\b`, 'm');
    return !regex.test(gitignoreContent);
  });

  if (missingGitignore.length > 0) {
    const appendText = (gitignoreContent.endsWith('\n') || gitignoreContent === '' ? '' : '\n') +
      '\n# Secrets and deployment env\n' +
      missingGitignore.join('\n') +
      '\n';
    fs.appendFileSync(gitignorePath, appendText, 'utf-8');
    console.log(`✓ Updated .gitignore (added: ${missingGitignore.join(', ')})`);
  } else {
    console.log('✓ .gitignore already has environment files protected');
  }

  // 2. SMART AUTO-CLONE: If .env.render does not exist, clone existing .env into .env.render FIRST
  if (!fs.existsSync(renderEnvPath)) {
    if (fs.existsSync(envPath)) {
      const existingEnvContent = fs.readFileSync(envPath, 'utf-8');
      const header =
        '# ─── Production Environment Variables (Synced to Render) ───\n' +
        '# Auto-cloned from your existing .env file.\n' +
        '# Update any production-specific values (e.g. DATABASE_URL) below.\n\n';
      fs.writeFileSync(renderEnvPath, header + existingEnvContent, 'utf-8');
      console.log('✓ Auto-created .env.render by cloning your existing .env variables (Zero manual copy-paste!)');
    } else {
      const defaultRenderEnv =
        '# ─── Production Environment Variables (Synced to Render) ───\n' +
        'NODE_ENV=production\n' +
        'PORT=10000\n' +
        '# DATABASE_URL=\n' +
        '# JWT_SECRET=\n';
      fs.writeFileSync(renderEnvPath, defaultRenderEnv, 'utf-8');
      console.log('✓ Created clean .env.render template for production variables');
    }
  } else {
    console.log('✓ .env.render already exists');
  }

  // 3. .env handling: Append deployment tool credentials to .env
  let envContent = '';
  const existingEnvKeys = new Set<string>();

  if (fs.existsSync(envPath)) {
    envContent = fs.readFileSync(envPath, 'utf-8');
    for (const line of envContent.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        existingEnvKeys.add(trimmed.slice(0, idx).trim());
      }
    }
  }

  const missingDeployKeys = DEPLOYMENT_TOOL_KEYS.filter((item) => !existingEnvKeys.has(item.key));

  if (missingDeployKeys.length > 0) {
    let appendEnv = envContent.endsWith('\n') || envContent === '' ? '' : '\n';
    appendEnv += '\n# ─── Render Deployment Tool Credentials ────────────────────\n';
    for (const { key, comment, defaultValue } of missingDeployKeys) {
      appendEnv += `# ${comment}\n${key}=${defaultValue ?? ''}\n`;
    }
    fs.appendFileSync(envPath, appendEnv, 'utf-8');
    console.log(`✓ Added ${missingDeployKeys.length} deployment tool keys to .env`);
  } else {
    console.log('✓ .env already has all deployment tool keys');
  }

  // 4. package.json script handling
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      pkg.scripts = pkg.scripts || {};
      if (!pkg.scripts.deploy) {
        pkg.scripts.deploy = 'render-deploy';
        fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf-8');
        console.log('✓ Added "deploy": "render-deploy" to package.json scripts');
      }
    } catch {
      // ignore
    }
  }

  console.log('\n🎉 Initialization complete!');
  console.log('👉 Next steps:');
  console.log('   1. Fill your deployment credentials at the bottom of .env');
  console.log('   2. Verify your production variables in .env.render');
  console.log('   3. Run: npm run deploy\n');
}
