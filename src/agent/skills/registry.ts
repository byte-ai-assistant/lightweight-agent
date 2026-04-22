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
    "The following skills are registered. If the user's request matches a skill's",
    "description, you MUST call load_skill(name) BEFORE any other tool call, BEFORE",
    "using WebSearch/WebFetch, and BEFORE generating task output.",
    "",
    "Answering inline when a skill applies bypasses that skill's required gates —",
    "phase ordering, user approvals, and markdown artifacts on disk. Do not do it.",
    "\"The skill is overkill\" and \"I already know the answer\" are rationalizations,",
    "not reasons.",
    "",
  ];

  for (const skill of availableSkills) {
    lines.push(`- **${skill.name}**: ${skill.description}`);
  }

  lines.push("");
  lines.push("Workflow for any user message:");
  lines.push("1. Read the message.");
  lines.push("2. If it matches a skill's description, call load_skill(that_skill).");
  lines.push("3. Follow the returned instructions exactly — including any artifact-on-disk step.");
  lines.push("4. Only then produce user-facing output.");
  lines.push("");
  lines.push("If no skill matches, proceed normally.");
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
