import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInit } from './init.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.resolve(__dirname, '..');

const targetDir = process.env.INIT_CWD;

if (targetDir && path.resolve(targetDir) !== packageRoot) {
  try {
    await runInit(targetDir);
  } catch (err: any) {
    console.warn('⚠️ render-deploy postinstall setup notice:', err.message);
  }
}
