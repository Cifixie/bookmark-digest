import { z } from "zod";

export type TerminalProps = z.infer<typeof props>;

export const props = z.object({
  /** The command(s) to display. */
  command: z.string(),
  /** Optional output text shown after the command. */
  output: z.string().nullable().default(null),
  /** Optional caption explaining what the command does. */
  caption: z.string().nullable().default(null),
});

export const description =
  "Terminal-style command display with optional output. Styled to look like a shell session. Use for commands, CLI instructions, or terminal output examples.";
