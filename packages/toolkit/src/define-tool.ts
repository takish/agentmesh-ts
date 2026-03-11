import { z, type ZodType, toJSONSchema } from "zod";

export const SideEffectLevel = z.enum([
  "read_only",
  "external_read",
  "external_write",
  "system_mutation",
]);
export type SideEffectLevel = z.infer<typeof SideEffectLevel>;

export interface RetryPolicy {
  maxAttempts: number;
  backoffMs: number;
}

export interface ToolDefinition<
  TInput extends ZodType = ZodType,
  TOutput extends ZodType = ZodType,
> {
  name: string;
  description: string;
  inputSchema: TInput;
  outputSchema: TOutput;
  permissionScope: string;
  sideEffectLevel: SideEffectLevel;
  timeoutMs: number;
  retryPolicy?: RetryPolicy;
  execute: (input: z.infer<TInput>) => Promise<z.infer<TOutput>>;
}

export interface ToolContract {
  name: string;
  description: string;
  inputJsonSchema: Record<string, unknown>;
  outputJsonSchema: Record<string, unknown>;
  permissionScope: string;
  sideEffectLevel: SideEffectLevel;
  timeoutMs: number;
  retryPolicy?: RetryPolicy;
}

export interface Tool<
  TInput extends ZodType = ZodType,
  TOutput extends ZodType = ZodType,
> extends ToolContract {
  inputSchema: TInput;
  outputSchema: TOutput;
  execute: (input: z.infer<TInput>) => Promise<z.infer<TOutput>>;
}

export function defineTool<TInput extends ZodType, TOutput extends ZodType>(
  def: ToolDefinition<TInput, TOutput>,
): Tool<TInput, TOutput> {
  return {
    name: def.name,
    description: def.description,
    inputSchema: def.inputSchema,
    outputSchema: def.outputSchema,
    inputJsonSchema: toJSONSchema(def.inputSchema) as Record<string, unknown>,
    outputJsonSchema: toJSONSchema(def.outputSchema) as Record<string, unknown>,
    permissionScope: def.permissionScope,
    sideEffectLevel: def.sideEffectLevel,
    timeoutMs: def.timeoutMs,
    retryPolicy: def.retryPolicy,
    execute: def.execute,
  };
}

export function toToolContract(tool: Tool): ToolContract {
  return {
    name: tool.name,
    description: tool.description,
    inputJsonSchema: tool.inputJsonSchema,
    outputJsonSchema: tool.outputJsonSchema,
    permissionScope: tool.permissionScope,
    sideEffectLevel: tool.sideEffectLevel,
    timeoutMs: tool.timeoutMs,
    retryPolicy: tool.retryPolicy,
  };
}
