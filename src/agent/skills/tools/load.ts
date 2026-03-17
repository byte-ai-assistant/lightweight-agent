/**
 * load_skill MCP tool for dynamic skill loading
 */

import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { FullSkill } from "../types.js";

/**
 * Global skill cache (initialized by agent)
 */
let globalSkillsCache: Map<string, FullSkill> | null = null;

/**
 * Initialize the skill cache
 * Called once during agent startup
 */
export function initializeSkillCache(cache: Map<string, FullSkill>) {
  globalSkillsCache = cache;
}

/**
 * MCP tool: load_skill
 * Dynamically loads full skill instructions when needed
 */
export const loadSkillTool = tool(
  "load_skill",
  "Load detailed instructions for a specific skill. Call this when you need to use a skill's capabilities. Returns the full SKILL.md content with instructions on how to use the skill.",
  {
    skillName: z
      .string()
      .describe("Name of the skill to load (e.g., 'voice-reply', 'example-hello')"),
  },
  async ({ skillName }) => {
    // Check if cache is initialized
    if (!globalSkillsCache) {
      return {
        content: [
          {
            type: "text" as const,
            text: "Error: Skill system not initialized. Skills cache is not available.",
          },
        ],
      };
    }

    // Check if skill exists
    const skill = globalSkillsCache.get(skillName);
    if (!skill) {
      const availableSkills = Array.from(globalSkillsCache.keys())
        .filter((name) => globalSkillsCache!.get(name)!.requirementsMet)
        .sort();

      return {
        content: [
          {
            type: "text" as const,
            text: `Error: Skill '${skillName}' not found.\n\nAvailable skills: ${availableSkills.length > 0 ? availableSkills.join(", ") : "none"}`,
          },
        ],
      };
    }

    // Check if requirements are met
    if (!skill.requirementsMet) {
      const unmetList =
        skill.unmetRequirements && skill.unmetRequirements.length > 0
          ? skill.unmetRequirements.join(", ")
          : "unknown";

      return {
        content: [
          {
            type: "text" as const,
            text: `Error: Skill '${skillName}' cannot be used. Requirements not met: ${unmetList}`,
          },
        ],
      };
    }

    // Replace {baseDir} with actual skill directory path
    const baseDir = skill.filePath
      ? skill.filePath.replace(/\/SKILL\.md$/, "")
      : "";
    const resolvedContent = skill.content.replace(
      /\{baseDir\}/g,
      baseDir
    );

    // Return full skill content (without frontmatter)
    return {
      content: [
        {
          type: "text" as const,
          text: `# Skill: ${skill.name}\n\n${resolvedContent}`,
        },
      ],
    };
  }
);
