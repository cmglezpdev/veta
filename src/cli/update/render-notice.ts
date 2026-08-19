/**
 * The update box, in the style pnpm prints after a command.
 *
 * Three lines of content inside a rounded border, written to stderr once the
 * command has finished so it never gets in front of the output scripts parse.
 */

export type UpdateNoticeInput = {
  readonly current: string;
  readonly latest: string;
  readonly changelogUrl: string;
  readonly updateCommand: string;
  readonly useColor: boolean;
};

export function changelogUrlFor(latest: string): string {
  return `https://github.com/cmglezpdev/veta/releases/tag/veta-v${latest}`;
}

const PADDING = 3;

/** Visible length: code points, with SGR sequences stripped. */
function visibleWidth(text: string): number {
  return [...text.replaceAll(/\x1b\[[0-9;]*m/g, "")].length;
}

export function renderUpdateNotice(input: UpdateNoticeInput): string {
  const paint = (code: number, text: string): string =>
    input.useColor ? `\x1b[${code}m${text}\x1b[0m` : text;

  const lines = [
    `Update available! ${paint(2, input.current)} → ${paint(32, input.latest)}`,
    `Changelog: ${input.changelogUrl}`,
    `To update, run: ${paint(36, input.updateCommand)}`,
  ];
  const inner = Math.max(...lines.map(visibleWidth)) + PADDING * 2;
  const pad = " ".repeat(PADDING);
  const border = (text: string): string => paint(33, text);

  const rows = [
    border(`╭${"─".repeat(inner)}╮`),
    border(`│${" ".repeat(inner)}│`),
    ...lines.map((line) => {
      const fill = " ".repeat(inner - PADDING * 2 - visibleWidth(line));
      return `${border("│")}${pad}${line}${fill}${pad}${border("│")}`;
    }),
    border(`│${" ".repeat(inner)}│`),
    border(`╰${"─".repeat(inner)}╯`),
  ];

  return `\n${rows.join("\n")}\n\n`;
}
