import * as readline from 'readline';

/**
 * Prompt the user for confirmation before a destructive action.
 *
 * - If stdin is not a TTY (piped, agent, CI/CD), skips the prompt and returns true.
 * - Otherwise asks "Are you sure you want to delete <type> '<id>'? [y/N]"
 * - Default is No (pressing Enter without input cancels).
 */
export async function confirmDeletion(resourceType: string, id: string): Promise<boolean> {
  // Non-interactive environments: skip prompt
  if (!process.stdin.isTTY) {
    return true;
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stderr, // Use stderr so JSON output on stdout is not polluted
  });

  return new Promise<boolean>((resolve) => {
    rl.question(
      `Are you sure you want to delete ${resourceType} '${id}'? [y/N] `,
      (answer) => {
        rl.close();
        const normalised = answer.trim().toLowerCase();
        resolve(normalised === 'y' || normalised === 'yes');
      },
    );
  });
}
