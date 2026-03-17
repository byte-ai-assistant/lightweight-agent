/**
 * Skill loader with hierarchical loading from multiple locations
 * Loads skills from: bundled → managed → workspace → extraDirs (with priority)
 */

import * as fs from "fs";
import * as path from "path";
import { homedir } from "os";
import matter from "gray-matter";
import {
  SkillFrontmatter,
  SkillRegistryEntry,
  FullSkill,
  SkillLocation,
  ByteConfig,
} from "./types.js";
import { checkRequirements } from "./gating.js";
import { loadConfig, getExtraDirs, isSkillEnabled, getSkillConfig } from "./config.js";

/**
 * Base skill loading locations in priority order (later overrides earlier)
 */
const BASE_SKILL_LOCATIONS: Array<{ type: SkillLocation; path: string }> = [
  {
    type: "bundled",
    path: path.join(process.cwd(), "src", "agent", "skills", "bundled"),
  },
  {
    type: "managed",
    path: path.join(homedir(), ".lightweight-agent", "skills"),
  },
  {
    type: "workspace",
    path: path.join(process.cwd(), "skills"),
  },
];

/**
 * Build the full list of skill locations including config extraDirs
 */
function getSkillLocations(config: ByteConfig): Array<{ type: SkillLocation; path: string }> {
  const locations = [...BASE_SKILL_LOCATIONS];

  // Append extra directories from config (treated as managed-priority)
  const extraDirs = getExtraDirs(config);
  for (const dir of extraDirs) {
    locations.push({ type: "managed", path: dir });
  }

  return locations;
}

/**
 * Load all skills from all locations and build registry
 * Later locations override earlier ones for same skill name
 */
export async function loadAllSkills(): Promise<Map<string, FullSkill>> {
  const config = loadConfig();
  const skillLocations = getSkillLocations(config);
  const allowBundled = config.skills?.allowBundled;
  const skillsMap = new Map<string, FullSkill>();

  // Load from each location in order (workspace overrides managed overrides bundled)
  for (const location of skillLocations) {
    const skills = await loadSkillsFromDirectory(
      location.path,
      location.type,
      config,
      allowBundled
    );

    for (const skill of skills) {
      // Later locations override earlier ones
      skillsMap.set(skill.name, skill);
    }
  }

  return skillsMap;
}

/**
 * Load skills from a specific directory
 */
async function loadSkillsFromDirectory(
  dirPath: string,
  location: SkillLocation,
  config: ByteConfig,
  allowBundled?: string[]
): Promise<FullSkill[]> {
  // Check if directory exists
  if (!fs.existsSync(dirPath)) {
    return [];
  }

  const skills: FullSkill[] = [];

  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const skillMdPath = path.join(dirPath, entry.name, "SKILL.md");

        if (fs.existsSync(skillMdPath)) {
          // Filter bundled skills via allowBundled whitelist
          if (location === "bundled" && allowBundled) {
            if (!allowBundled.includes(entry.name)) {
              continue;
            }
          }

          // Check if skill is enabled in config
          if (!isSkillEnabled(entry.name, config)) {
            continue;
          }

          try {
            const skill = await loadSkillFile(skillMdPath, location, config);
            skills.push(skill);
          } catch (error) {
            console.error(
              `Failed to load skill from ${skillMdPath}:`,
              error instanceof Error ? error.message : error
            );
          }
        }
      }
    }
  } catch (error) {
    console.error(
      `Failed to read skills directory ${dirPath}:`,
      error instanceof Error ? error.message : error
    );
  }

  return skills;
}

/**
 * Load and parse a single SKILL.md file
 */
async function loadSkillFile(
  filePath: string,
  location: SkillLocation,
  config: ByteConfig
): Promise<FullSkill> {
  const rawContent = fs.readFileSync(filePath, "utf-8");

  // Parse YAML frontmatter
  const parsed = matter(rawContent);
  const frontmatter = parsed.data as SkillFrontmatter;

  // Validate required fields
  if (!frontmatter.name) {
    throw new Error(`Skill at ${filePath} is missing required field: name`);
  }
  if (!frontmatter.description) {
    throw new Error(`Skill at ${filePath} is missing required field: description`);
  }

  // Inject per-skill env vars from config before gating
  const skillConfig = getSkillConfig(frontmatter.name, config);
  if (skillConfig?.env) {
    for (const [key, value] of Object.entries(skillConfig.env)) {
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  }

  // Check requirements (with config for config-based gating)
  const gatingResult = checkRequirements(frontmatter, config);

  // Replace {baseDir} with the skill's directory path
  const baseDir = path.dirname(filePath);
  const content = parsed.content.trim().replace(/\{baseDir\}/g, baseDir);

  const skill: FullSkill = {
    name: frontmatter.name,
    description: frontmatter.description,
    requirementsMet: gatingResult.met,
    unmetRequirements: gatingResult.unmet,
    location,
    userInvocable: frontmatter["user-invocable"] ?? false,
    disableModelInvocation: frontmatter["disable-model-invocation"] ?? false,
    filePath,
    content,
    frontmatter,
    rawContent,
  };

  return skill;
}

/**
 * Load a single skill by name (for dynamic loading)
 */
export async function loadSkillByName(
  skillName: string,
  skillsCache: Map<string, FullSkill>
): Promise<FullSkill | null> {
  return skillsCache.get(skillName) || null;
}
