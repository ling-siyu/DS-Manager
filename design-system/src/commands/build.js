import chalk from 'chalk';
import { resolveProjectPaths } from '../utils/paths.js';

export async function buildCommand(options = {}) {
  console.log(chalk.cyan('\n⚙  Building design tokens...\n'));

  try {
    const { styleDictionaryConfigPath } = resolveProjectPaths();

    // Dynamically import Style Dictionary (ESM)
    const StyleDictionary = (await import('style-dictionary')).default;
    const { default: config, registerFormats } = await import(styleDictionaryConfigPath);

    const sd = new StyleDictionary(config);
    registerFormats(sd);
    await sd.buildAllPlatforms();

    console.log(chalk.green('\n✓ Build complete\n'));
    console.log('  ' + chalk.dim('design-system/build/css-vars.css'));
    console.log('  ' + chalk.dim('design-system/build/tailwind.tokens.cjs'));
    console.log('  ' + chalk.dim('design-system/build/tokens.js') + '\n');
  } catch (err) {
    console.error(chalk.red('\n✗ Build failed:\n'));
    console.error(err.message);
    process.exit(1);
  }
}
