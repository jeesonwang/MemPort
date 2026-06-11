export type LogLevel = "info" | "warn" | "error";

export interface Logger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

export interface SyncOptions {
  projectRoot: string;
  codexPath: string;
  updateClaudeMd: boolean;
  silent: boolean;
  homeDir: string;
  now: Date;
  toolVersion: string;
  logger: Logger;
}

export interface ResolveOptionsInput {
  cwd: string;
  env: NodeJS.ProcessEnv;
  homeDir: string;
  projectRoot?: string | undefined;
  codexPath?: string | undefined;
  updateClaudeMd?: boolean | undefined;
  silent?: boolean | undefined;
  now?: Date | undefined;
  toolVersion?: string | undefined;
  logger?: Logger | undefined;
}

export interface SyncWarning {
  code: string;
  message: string;
}

export interface SyncResult {
  memoryFilesCopied: number;
  skillsSynced: number;
  skillsChanged: boolean;
  claudeMdUpdated: boolean;
  warnings: SyncWarning[];
}

export interface MemportSkillMarker {
  managedBy: "memport";
  sourcePath: string;
  sourceHash: string;
  managedAt: string;
  toolVersion: string;
}

export interface HookOutput {
  hookSpecificOutput?: {
    hookEventName: "SessionStart";
    reloadSkills?: boolean;
    additionalContext?: string;
  };
  systemMessage?: string;
}
