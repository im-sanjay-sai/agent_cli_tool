import { Command } from 'commander';
import * as fs from 'fs/promises';
import { requireAuth } from '../core/auth.js';
import {
  aiGenerateFromSchema,
  aiFix,
  aiPivot,
  aiMagicEdit,
} from '../core/client.js';
import { output, withErrorHandling } from '../output/formatter.js';
import { success } from '../output/success.js';
import { networkError } from '../output/errors.js';

export function registerAiCommands(program: Command): void {
  const aiCmd = program
    .command('ai')
    .description('AI-powered operations');

  // Generate SQL from natural language
  aiCmd
    .command('query')
    .description('Generate SQL from natural language')
    .argument('<prompt>', 'Natural language description')
    .option('--schemas <names>', 'Comma-separated schema names to use')
    .action(withErrorHandling(async (prompt, options) => {
      await requireAuth();
      
      const schemas = options.schemas?.split(',').map((s: string) => s.trim());
      
      const response = await aiGenerateFromSchema(prompt, schemas);
      
      if (response.error) {
        throw networkError(response.error);
      }
      
      const data = response.data as Record<string, unknown> | undefined;
      output(success({
        prompt,
        sql: data?.message || data?.sql,
      }, { source: 'remote' }));
    }));

  // Fix broken SQL
  aiCmd
    .command('fix')
    .description('Fix broken SQL using AI')
    .requiredOption('--sql <query>', 'The broken SQL query')
    .requiredOption('--error <message>', 'The error message')
    .action(withErrorHandling(async (options) => {
      await requireAuth();
      
      const response = await aiFix(options.sql, options.error);
      
      if (response.error) {
        throw networkError(response.error);
      }
      
      const fixData = response.data as Record<string, unknown> | undefined;
      output(success({
        originalSql: options.sql,
        error: options.error,
        fixedSql: fixData?.message || fixData?.sql,
      }, { source: 'remote' }));
    }));

  // Generate pivot configuration using AI
  // API expects structured data: { pivotCountRequest, allowedRowFields[], allowedColumnFields[], allowedValueFields[], tableSchema{} }
  aiCmd
    .command('pivot')
    .description('Generate pivot configuration using AI (requires structured JSON with column metadata)')
    .requiredOption('--file <path>', 'JSON file with: { pivotCountRequest, allowedRowFields, allowedColumnFields, allowedValueFields, tableSchema }')
    .action(withErrorHandling(async (options) => {
      await requireAuth();
      
      const content = await fs.readFile(options.file, 'utf-8');
      const pivotConfig = JSON.parse(content);
      
      const response = await aiPivot(pivotConfig);
      
      if (response.error) {
        throw networkError(response.error);
      }
      
      const pivotData = response.data as Record<string, unknown> | undefined;
      output(success({
        pivotTables: pivotData?.pivotTables || pivotData?.data || pivotData,
      }, { source: 'remote' }));
    }));

  // Edit SQL with AI
  aiCmd
    .command('edit')
    .description('Edit SQL using AI')
    .requiredOption('--sql <query>', 'The existing SQL query')
    .requiredOption('--prompt <changes>', 'Description of changes to make')
    .action(withErrorHandling(async (options) => {
      await requireAuth();
      
      const response = await aiMagicEdit(options.prompt, options.sql);
      
      if (response.error) {
        throw networkError(response.error);
      }
      
      const editData = response.data as Record<string, unknown> | undefined;
      output(success({
        originalSql: options.sql,
        prompt: options.prompt,
        editedSql: editData?.message || editData?.sql,
      }, { source: 'remote' }));
    }));
}
