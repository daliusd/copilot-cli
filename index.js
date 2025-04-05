#!/usr/bin/env node

const { program } = require('commander');
const { getModels, runPrompt } = require('./lib/github');
const pkg = require('./package.json');

program.version(pkg.version).description('CLI tool to interact with GitHub Copilot models');

program
  .command('models')
  .description('List available GitHub Copilot models')
  .action(async () => {
    try {
      const models = await getModels();
      console.log('Available models:');

      for (const [modelId, details] of Object.entries(models)) {
        console.log(
          `- ${modelId} (supports${details.opts?.can_stream ? ' streaming' : ''}${details.opts?.can_call_tools ? ' tools' : ''}${details.opts?.can_call_tools_parallel ? ' parallel' : ''})`,
        );
      }
    } catch (error) {
      console.error('Error fetching models:', error.message);
      process.exit(1);
    }
  });

program
  .command('chat')
  .description('Chat with a GitHub Copilot model')
  .requiredOption('-m, --model <model>', 'Model ID to use')
  .option('-p, --prompt <prompt>', 'Prompt to send to the model', '')
  .option('-f, --file <file>', 'Read prompt from a file')
  .option('-s, --system <system>', 'System prompt to use')
  .option('-t, --temperature <temperature>', 'Temperature (0-2)', parseFloat, 0)
  .option('--stream', 'Enable streaming response', true)
  .option('--no-stream', 'Disable streaming response')
  .action(async (options) => {
    try {
      let prompt = options.prompt;

      if (options.file) {
        const fs = require('fs');
        prompt = fs.readFileSync(options.file, 'utf8');
      }

      if (!prompt) {
        console.error('Please provide a prompt using --prompt or --file');
        process.exit(1);
      }

      const messages = [];

      if (options.system) {
        messages.push({ role: 'system', content: options.system });
      }

      messages.push({ role: 'user', content: prompt });

      await runPrompt({
        model: options.model,
        messages,
        temperature: options.temperature,
        stream: options.stream,
      });
    } catch (error) {
      console.error('Error running prompt:', error.message);
      process.exit(1);
    }
  });

program.parse(process.argv);

if (!process.argv.slice(2).length) {
  program.outputHelp();
}
