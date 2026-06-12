export type VersionContentInput = {
  content: unknown;
  model_config: Record<string, unknown>;
  input_schema?: Record<string, unknown> | null | undefined;
  output_schema?: Record<string, unknown> | null | undefined;
  commit_message?: string | null | undefined;
};

export type CreatePromptInput = VersionContentInput & {
  project_id: string;
  prompt_key: string;
  name: string;
  description: string;
  type: "text" | "chat";
};

export type MoveLabelInput = {
  prompt_id: string;
  label: string;
  version: number;
  expected_current_version: number | null;
  reason?: string | null | undefined;
  actor_id: string;
  action: "publish" | "rollback" | "move";
};
