<div align="center">

# 🚀 @ars2k03/render-deploy

**Smart, Zero-Config 1-Click Cloud Deployment for Render**  
*Automate Git synchronization, production environment management, and live deployment tracking with a single command.*

[![npm version](https://img.shields.io/npm/v/@ars2k03/render-deploy.svg?color=cb3837&style=flat-square)](https://www.npmjs.com/package/@ars2k03/render-deploy)
[![GitHub Repository](https://img.shields.io/badge/GitHub-ars--render--deploy-181717?style=flat-square&logo=github)](https://github.com/ars2k03/ars-render-deploy)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](LICENSE)
[![Node >= 18](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg?style=flat-square)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-3178C6.svg?style=flat-square)](https://www.typescriptlang.org)

**Repository:** [https://github.com/ars2k03/ars-render-deploy](https://github.com/ars2k03/ars-render-deploy)

</div>

---

## 💡 Why `@ars2k03/render-deploy`?

Deploying backends or full-stack apps to Render manually usually involves repetitive friction:
- Manually staging, committing, and pushing code to GitHub.
- Opening the Render dashboard to copy-paste environment variables one by one.
- Accidentally leaking personal tokens or deployment keys into production containers.
- Triggering redundant, slow rebuilds when nothing actually changed.

**`@ars2k03/render-deploy` solves all of this.** It turns your entire deployment pipeline into a single, intelligent command: `npm run deploy`.

---

## ⚡ Quick Start (No Install Needed!)

### Step 1: Initialize in your project

Open a terminal in your project root and run:

```bash
npx @ars2k03/render-deploy init
```

> **✨ What `init` automatically does in 1 second:**  
> 1. **Smart Auto-Clones** your existing `.env` variables into `.env.render` (zero manual copy-pasting!).
> 2. Appends deployment credential placeholders at the bottom of your `.env`.
> 3. Protects both `.env` and `.env.render` in `.gitignore`.
> 4. Automatically configures `"deploy": "npx @ars2k03/render-deploy"` in your `package.json` scripts.

---

### Step 2: Configure Credentials

#### 1. In your local `.env` (Deployment Credentials)
Scroll to the bottom of your `.env` file and fill in your deployment keys:

```env
# ─── Render Deployment Tool Credentials ────────────────────
RENDER_API_KEY=rnd_yourRenderApiKey
RENDER_SERVICE_ID=srv-yourRenderServiceId
GITHUB_USER=yourGithubUsername
GITHUB_TOKEN=ghp_yourGithubPersonalAccessToken
GITHUB_REPO_NAME=your-repo-name
BACKEND_DIR=.
BUILD_COMMAND=npm install --include=dev && npx prisma generate && npm run build
START_COMMAND=npm run start:prod
```

#### 2. In your `.env.render` (Production App Variables)
Your existing app variables are already auto-cloned here! Simply update any values that differ in production (like your remote database URL):

```env
NODE_ENV=production
PORT=10000
DATABASE_URL=postgresql://user:pass@host/prod_db
JWT_SECRET=production_super_secret_key
```

---

### Step 3: Deploy!

```bash
npm run deploy
```

That's it! Your code will sync to GitHub, production variables will update on Render, and you'll see a live build progress tracker directly in your terminal.

---

## 🧠 Clean Architecture: Two Files, Zero Confusion

| File | Purpose | Synced to Render? |
| :--- | :--- | :---: |
| **`.env`** | Local development variables + **Deployment tool credentials** (`RENDER_API_KEY`, `GITHUB_TOKEN`, etc.) | ❌ **Never** (stays strictly on your machine) |
| **`.env.render`** | **100% Pure Production Application Variables** (`DATABASE_URL`, `JWT_SECRET`, etc.) | ✅ **Yes** (synced directly to Render service) |

> 🔒 **Security Guarantee:** Your `GITHUB_TOKEN` and `RENDER_API_KEY` are strictly kept in your local `.env` and will **never** be uploaded to Render's application container.

---

## ✨ Core Features

- ⚡ **Zero Installation Overhead:** Run anywhere instantly using `npx @ars2k03/render-deploy init`.
- 🔄 **Smart Auto-Clone:** Automatically clones your existing `.env` variables into `.env.render`—never re-type 20+ variables by hand.
- 🛑 **Zero-Waste Redundant Build Skip:** Intelligently checks Git commit status and performs a diff between `.env.render` and Render's live environment. If nothing changed, it instantly skips the deployment, saving build minutes.
- 📦 **Automatic Git Sync:** Detects uncommitted changes, stages, commits with an auto-sync timestamp, and pushes cleanly to your active branch (`main`, `master`, or custom).
- 🌐 **Dynamic Live URL Discovery:** Automatically fetches the live service domain directly from Render's API—no hardcoded URLs required.
- 🧹 **Environment Variable Pruning:** Updates changed variables and automatically deletes stale/removed keys from Render.
- ⏱️ **Real-Time Terminal Monitoring:** Streams real-time deployment status (`in_progress`, `building`, `live`) with elapsed seconds and direct log links on failures.

---

## ⚙️ Configuration Reference

All deployment configurations are stored at the bottom of your `.env` file:

| Variable | Required | Description | Example |
| :--- | :---: | :--- | :--- |
| `RENDER_API_KEY` | **Yes** | Your Render User API Key | `rnd_4tfF...` |
| `RENDER_SERVICE_ID` | **Yes** | Web service ID from Render Dashboard URL | `srv-dbd4mfd9...` |
| `GITHUB_USER` | **Yes** | GitHub username or organization | `yourname` |
| `GITHUB_TOKEN` | **Yes** | GitHub Personal Access Token (repo scope) | `ghp_m8lz...` |
| `GITHUB_REPO_NAME` | **Yes** | GitHub repository name | `my-backend` |
| `BACKEND_DIR` | No | Subfolder path, or `.` if in repository root | `.` or `backend` |
| `BUILD_COMMAND` | No | Build command executed by Render | `npm install && npm run build` |
| `START_COMMAND` | No | Start command executed by Render | `npm run start:prod` |

---

## 💻 CLI Commands

```bash
# Initialize any project in seconds
npx @ars2k03/render-deploy init

# Deploy your project
npm run deploy

# Alternatively, deploy directly via npx
npx @ars2k03/render-deploy

# Display CLI help
npx @ars2k03/render-deploy --help
```

---

## 📄 License

This project is open-source software licensed under the **[MIT License](LICENSE)**.

---

<div align="center">
Made with ❤️ by <b>ars2k03</b>
</div>
