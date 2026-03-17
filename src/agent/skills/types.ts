/**
 * Skill system types for OpenClaw-compatible skill loading
 */

/**
 * YAML frontmatter structure for SKILL.md files
 */
export interface SkillFrontmatter {
  /** Unique skill identifier (kebab-case) */
  name: string;

  /** One-line description of the skill */
  description: string;

  /** Optional homepage/documentation URL */
  homepage?: string;

  /** Whether users can invoke this skill via /skillname */
  "user-invocable"?: boolean;

  /** Whether to disable model from auto-invoking */
  "disable-model-invocation"?: boolean;

  /** Dispatch slash command directly to a tool invocation */
  "command-dispatch"?: "tool";

  /** Tool name for command-dispatch */
  "command-tool"?: string;

  /** How arguments are forwarded to the tool ("raw" = pass as-is) */
  "command-arg-mode"?: "raw";

  /** Additional metadata including requirements */
  metadata?: {
    openclaw?: {
      /** Display emoji for the skill */
      emoji?: string;

      /** Install hints for missing dependencies */
      install?: Array<{ id: string; kind: string; [key: string]: any }>;

      requires?: {
        /** Required binaries on PATH (all must exist) */
        bins?: string[];

        /** At least one of these binaries must exist on PATH */
        anyBins?: string[];

        /** Required environment variables */
        env?: string[];

        /** Required config keys */
        config?: string[];

        /** Required OS platforms (darwin, linux, win32) */
        os?: string[];

        /** Skip all requirement checks when true */
        always?: boolean;

        /** Primary env var that maps to a config apiKey */
        primaryEnv?: string;
      };
    };
    [key: string]: any;
  };
}

/**
 * Per-skill configuration override (from ~/.lightweight-agent/agent.json)
 */
export interface ByteSkillConfig {
  /** Whether the skill is enabled (default: true) */
  enabled?: boolean;

  /** Environment variables to inject for this skill */
  env?: Record<string, string>;

  /** Arbitrary config key-value pairs for this skill */
  config?: Record<string, any>;

  /** API key mapping for primaryEnv resolution */
  apiKey?: { source: string; provider: string; id: string };
}

/**
 * Top-level agent configuration (from ~/.lightweight-agent/agent.json)
 */
export interface ByteConfig {
  skills?: {
    /** Per-skill configuration overrides, keyed by skill name */
    entries?: Record<string, ByteSkillConfig>;

    /** Skill loading options */
    load?: { extraDirs?: string[] };

    /** Whitelist of bundled skill names to load (if set, only these are loaded) */
    allowBundled?: string[];
  };
}

/**
 * Location where a skill was loaded from
 */
export type SkillLocation = "bundled" | "managed" | "workspace";

/**
 * Lightweight skill registry entry (always in context)
 */
export interface SkillRegistryEntry {
  /** Skill name */
  name: string;

  /** One-line description */
  description: string;

  /** Whether requirements are met */
  requirementsMet: boolean;

  /** Unmet requirements (if any) */
  unmetRequirements?: string[];

  /** Where skill was loaded from */
  location: SkillLocation;

  /** Can user invoke via /skillname? */
  userInvocable: boolean;

  /** Disable model invocation? */
  disableModelInvocation: boolean;

  /** Absolute path to SKILL.md file */
  filePath: string;
}

/**
 * Full skill with content (loaded on demand)
 */
export interface FullSkill extends SkillRegistryEntry {
  /** Full SKILL.md markdown content (without frontmatter) */
  content: string;

  /** Parsed frontmatter */
  frontmatter: SkillFrontmatter;

  /** Raw file content (with frontmatter) */
  rawContent: string;
}

/**
 * Result of checking skill requirements
 */
export interface GatingResult {
  /** Whether all requirements are met */
  met: boolean;

  /** List of unmet requirements */
  unmet: string[];
}
