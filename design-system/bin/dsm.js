#!/usr/bin/env node
import { main } from '../src/cli.js';

try {
  await main(process.argv.slice(2));
} catch (error) {
  console.error(error.stack || String(error));
  process.exit(1);
}
