/**
 * Skill registry builder
 * Creates lightweight registry entries for system prompt injection
 */

import { FullSkill, SkillRegistryEntry } from "./types.js";

/**
 * Build lightweight registry from full skills
 * This is what gets injected into the system prompt
 */
export function buildRegistry(
  fullSkills: Map<string, FullSkill>
): SkillRegistryEntry[] {
  const registry: SkillRegistryEntry[] = [];

  for (const skill of fullSkills.values()) {
    const entry: SkillRegistryEntry = {
      name: skill.name,
      description: skill.description,
      requirementsMet: skill.requirementsMet,
      unmetRequirements: skill.unmetRequirements,
      location: skill.location,
      userInvocable: skill.userInvocable,
      disableModelInvocation: skill.disableModelInvocation,
      filePath: skill.filePath,
    };

    registry.push(entry);
  }

  // Sort by name for consistent ordering
  return registry.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Format registry for system prompt injection
 */
export function formatRegistryForPrompt(registry: SkillRegistryEntry[]): string {
  // Filter to only skills with requirements met
  const availableSkills = registry.filter((s) => s.requirementsMet);

  if (availableSkills.length === 0) {
    return "";
  }

  const lines = [
    "## Available Skills",
    "",
    "You have access to these skills. To use one, call load_skill(skillName) first:",
    "",
  ];

  for (const skill of availableSkills) {
    lines.push(`- **${skill.name}**: ${skill.description}`);
  }

  lines.push("");
  lines.push("To use a skill:");
  lines.push("1. Call load_skill(\"skillname\")");
  lines.push("2. Read the returned instructions");
  lines.push("3. Follow them");
  lines.push("");

  return lines.join("\n");
}

/**
 * Get skill registry statistics
 */
export function getRegistryStats(registry: SkillRegistryEntry[]): {
  total: number;
  available: number;
  unavailable: number;
  byLocation: Record<string, number>;
} {
  const stats = {
    total: registry.length,
    available: registry.filter((s) => s.requirementsMet).length,
    unavailable: registry.filter((s) => !s.requirementsMet).length,
    byLocation: {} as Record<string, number>,
  };

  for (const skill of registry) {
    stats.byLocation[skill.location] =
      (stats.byLocation[skill.location] || 0) + 1;
  }

  return stats;
}
