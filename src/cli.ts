#!/usr/bin/env node

import { runInit } from './init.js';
import { runDeploy } from './deploy.js';

const command = process.argv[2];

if (command === 'init') {
  runInit().catch((err: any) => {
    console.error('\n❌ Init Failed:', err.message);
    process.exit(1);
  });
} else if (command === '--help' || command === '-h') {
  console.log(`
🚀 @ars2k03/render-deploy CLI

Usage:
  npx @ars2k03/render-deploy init     Initialize .gitignore and .env template
  npx @ars2k03/render-deploy          Deploy your project to Render with 1-click
  npx @ars2k03/render-deploy --help   Show this help message
`);
} else {
  runDeploy().catch((err: any) => {
    console.error('\n❌ Deployment Script Error:', err.message);
    process.exit(1);
  });
}
