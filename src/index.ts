#!/usr/bin/env node
import { Command } from 'commander';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { OrchestraPlugin } from './types';

dotenv.config();

const program = new Command();

program
  .name('orchestra')
  .description('Orchestra: Automated pipeline tasks with plugin architecture.')
  .version('1.0.0');

// --- Server Command ---
program
  .command('server')
  .description('Start the Orchestra webhook server')
  .action(() => {
    // Dynamic import to avoid loading server dependencies when using CLI
    require('./server');
  });

// Dynamic Plugin Loader
const loadPlugins = async () => {
  const pluginsDir = path.join(__dirname, 'plugins');
  
  if (!fs.existsSync(pluginsDir)) {
    console.error('Plugins directory not found.');
    return;
  }

  const pluginFolders = fs.readdirSync(pluginsDir);

  for (const folder of pluginFolders) {
    const pluginPathTs = path.join(pluginsDir, folder, 'index.ts');
    const pluginPathJs = path.join(pluginsDir, folder, 'index.js');
    
    let pluginPath = '';
    if (fs.existsSync(pluginPathTs)) {
      pluginPath = pluginPathTs;
    } else if (fs.existsSync(pluginPathJs)) {
      pluginPath = pluginPathJs;
    } else {
      continue;
    }

    try {
      // Dynamic import
      const pluginModule = await import(pluginPath);
      const plugin: OrchestraPlugin = pluginModule.default;

        if (plugin && plugin.command) {
          const cmd = program.command(plugin.command)
            .description(plugin.description);

          if (plugin.args) {
            plugin.args.forEach(arg => {
              if (arg.required) {
                cmd.argument(`<${arg.name}>`, arg.description);
              } else {
                cmd.argument(`[${arg.name}]`, arg.description);
              }
            });
          }

          cmd.action(async (...args) => {
            try {
              await plugin.action(...args);
            } catch (error) {
              console.error(`❌ Error executing command '${plugin.command}':`, error);
              process.exit(1);
            }
          });
          // console.log(`Loaded plugin: ${plugin.name}`);
        }
      } catch (error) {
        console.error(`Failed to load plugin from ${folder}:`, error);
      }
  }
};

// Initialize and parse
(async () => {
  await loadPlugins();
  program.parse(process.argv);
})();
