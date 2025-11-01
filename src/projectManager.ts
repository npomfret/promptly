import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { Project, ProjectConfig, ProjectsConfigFile } from './types.js';

const PROJECTS_CONFIG_FILE = 'projects.json';

/**
 * Generate a unique project ID from a git URL using SHA-256 hash
 */
export function generateProjectId(gitUrl: string): string {
  return createHash('sha256').update(gitUrl).digest('hex').substring(0, 12);
}

/**
 * Load projects configuration from JSON file
 */
export async function loadProjectsConfig(configPath: string = PROJECTS_CONFIG_FILE): Promise<ProjectsConfigFile> {
  try {
    const data = await fs.readFile(configPath, 'utf-8');
    return JSON.parse(data);
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      // Config file doesn't exist, return empty config
      return { projects: [] };
    }
    throw error;
  }
}

/**
 * Save projects configuration to JSON file
 */
export async function saveProjectsConfig(
  config: ProjectsConfigFile,
  configPath: string = PROJECTS_CONFIG_FILE
): Promise<void> {
  await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
}

/**
 * Clone a git repository to the specified path
 */
export async function cloneRepository(gitUrl: string, targetPath: string, branch: string = 'main'): Promise<void> {
  try {
    // Check if directory already exists
    try {
      await fs.access(targetPath);
      console.log(`Project directory already exists: ${targetPath}`);
      return;
    } catch {
      // Directory doesn't exist, proceed with clone
    }

    // Create parent directory if it doesn't exist
    const parentDir = path.dirname(targetPath);
    await fs.mkdir(parentDir, { recursive: true });

    // Clone the repository
    console.log(`Cloning ${gitUrl} to ${targetPath}...`);
    execSync(`git clone --branch ${branch} --depth 1 "${gitUrl}" "${targetPath}"`, {
      stdio: 'inherit',
    });
    console.log(`Successfully cloned ${gitUrl}`);
  } catch (error: any) {
    throw new Error(`Failed to clone repository ${gitUrl}: ${error.message}`);
  }
}

/**
 * Pull latest changes for a project
 */
export async function updateRepository(projectPath: string): Promise<void> {
  try {
    console.log(`Updating repository at ${projectPath}...`);
    execSync('git pull', {
      cwd: projectPath,
      stdio: 'inherit',
    });
    console.log(`Successfully updated repository`);
  } catch (error: any) {
    throw new Error(`Failed to update repository at ${projectPath}: ${error.message}`);
  }
}

/**
 * Initialize projects from configuration file
 */
export async function initializeProjects(checkoutDir: string): Promise<Map<string, Project>> {
  const projects = new Map<string, Project>();

  // Load configuration
  const config = await loadProjectsConfig();

  // Ensure checkout directory exists
  await fs.mkdir(checkoutDir, { recursive: true });

  // Initialize each project
  for (const projectConfig of config.projects) {
    const projectId = generateProjectId(projectConfig.gitUrl);
    const projectPath = path.join(checkoutDir, projectId);
    const branch = projectConfig.branch || 'main';

    // Clone repository if needed
    await cloneRepository(projectConfig.gitUrl, projectPath, branch);

    // Create project object
    const project: Project = {
      id: projectId,
      gitUrl: projectConfig.gitUrl,
      branch,
      path: projectPath,
      lastUpdated: new Date(),
    };

    projects.set(projectId, project);
    console.log(`Initialized project ${projectId}: ${projectConfig.gitUrl}`);
  }

  return projects;
}

/**
 * Add a new project
 */
export async function addProject(
  gitUrl: string,
  checkoutDir: string,
  branch: string = 'main'
): Promise<Project> {
  // Generate project ID
  const projectId = generateProjectId(gitUrl);
  const projectPath = path.join(checkoutDir, projectId);

  // Load existing configuration
  const config = await loadProjectsConfig();

  // Check if project already exists
  const exists = config.projects.some(p => p.gitUrl === gitUrl);
  if (exists) {
    throw new Error(`Project with git URL ${gitUrl} already exists`);
  }

  // Clone repository
  await cloneRepository(gitUrl, projectPath, branch);

  // Add to configuration
  config.projects.push({ gitUrl, branch });
  await saveProjectsConfig(config);

  // Create and return project object
  const project: Project = {
    id: projectId,
    gitUrl,
    branch,
    path: projectPath,
    lastUpdated: new Date(),
  };

  return project;
}

/**
 * Remove a project
 */
export async function removeProject(projectId: string, project: Project): Promise<void> {
  // Load configuration
  const config = await loadProjectsConfig();

  // Remove from configuration
  config.projects = config.projects.filter(p => generateProjectId(p.gitUrl) !== projectId);
  await saveProjectsConfig(config);

  // Optionally delete the cloned directory (commented out for safety)
  // await fs.rm(project.path, { recursive: true, force: true });

  console.log(`Removed project ${projectId}`);
}
