/**
 * Init command - initialize oc-ralph in repository
 */
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { ConfigManager } from '../core/ConfigManager.js';
import { GitHubClient } from '../github/GitHubClient.js';
import { LabelOperations } from '../github/LabelOperations.js';

const execAsync = promisify(exec);

export class InitCommand {
  constructor(logger) {
    this.logger = logger;
  }

  async execute(options) {
    console.log('🚀 Initializing oc-ralph...\n');

    // Step 1: Validate GitHub auth
    console.log('1. Validating GitHub authentication...');
    await this.validateGitHubAuth();
    console.log('   ✅ GitHub authentication successful\n');

    // Step 2: Create .oc-ralph directory
    console.log('2. Creating .oc-ralph directory...');
    await this.createOcRalphDirectory();
    console.log('   ✅ Directory created\n');

    // Step 3: Generate config file
    console.log('3. Generating config.yaml with example data...');
    await this.generateConfigFile();
    console.log('   ✅ Config file created at .oc-ralph/config.yaml\n');

    // Step 4: Create GitHub labels (if not --no-labels)
    if (options.labels !== false && options.repo) {
      console.log('4. Creating GitHub labels...');
      const created = await this.createGitHubLabels(options.repo);
      console.log(`   ✅ Created ${created.length} new labels\n`);
    } else if (!options.repo) {
      console.log('4. Skipping label creation (no --repo specified)\n');
    }

    // Step 5: Display next steps
    this.displayNextSteps();

    console.log('✅ oc-ralph initialization complete!\n');
  }

  async validateGitHubAuth() {
    try {
      await execAsync('gh auth status');
    } catch (error) {
      throw new Error('GitHub CLI not authenticated. Run: gh auth login');
    }
  }

  async createOcRalphDirectory() {
    const dir = '.oc-ralph';

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Create .gitignore
    const gitignore = `# oc-ralph
logs/
*.log
.env
`;
    fs.writeFileSync(path.join(dir, '.gitignore'), gitignore);
  }

  async generateConfigFile() {
    const exampleConfig = ConfigManager.generateExampleConfig();
    const configPath = path.join('.oc-ralph', 'config.yaml');
    
    fs.writeFileSync(configPath, exampleConfig);
  }

  async createGitHubLabels(repo) {
    const github = new GitHubClient(this.logger);
    const labelOps = new LabelOperations(github, this.logger);

    const result = await labelOps.ensureLabelsExist(repo);
    return result.created;
  }

  displayNextSteps() {
    console.log('📋 Next Steps:\n');
    console.log('1. Edit .oc-ralph/config.yaml:');
    console.log('   - Set your GitHub owner and repo');
    console.log('   - Configure OpenCode URL if not localhost:4096');
    console.log('   - Add Discord webhook URL (optional)');
    console.log('   - Adjust agent models if needed\n');
    console.log('2. Create a master issue in your repository\n');
    console.log('3. Start orchestration:');
    console.log('   oc-ralph start <issue-number>\n');
  }
}
