import type { Argv } from "yargs";
import yargs from "yargs";

export class CommandFinished extends Error {
  readonly exitCode: number;

  constructor(exitCode: number) {
    super("COMMAND_FINISHED");
    this.name = "CommandFinished";
    this.exitCode = exitCode;
  }
}

export type ExtractArgs = {
  readonly url: string;
  readonly lang?: string;
};

export type CliHandlers = {
  readonly extract: (args: ExtractArgs) => Promise<void>;
  readonly doctor: () => Promise<void>;
};

const KNOWN_COMMANDS = new Set(["extract", "completion", "doctor"]);

const extractBuilder = (builder: Argv) =>
  builder
    .positional("url", {
      type: "string",
      describe: "YouTube URL or 11-character video id",
    })
    .option("lang", {
      type: "string",
      describe: "Preferred caption language code (BCP-47)",
    });

/** Map bare `veta <url>` (and `veta --lang … <url>`) to the extract subcommand. */
export function normalizeArgv(args: readonly string[]): string[] {
  if (
    args.includes("--get-yargs-completions") ||
    args.includes("--help") ||
    args.includes("-h") ||
    args.includes("--version")
  ) {
    return [...args];
  }
  if (args.some((arg) => KNOWN_COMMANDS.has(arg))) {
    return [...args];
  }
  if (args.length === 0) {
    return [...args];
  }
  return ["extract", ...args];
}

/** Register command names and flags; handlers may be no-ops for completion mode. */
export function buildCliProgram(
  handlers: CliHandlers,
  argv: readonly string[] = [],
): Argv {
  let program!: Argv;

  program = yargs(normalizeArgv(argv))
    .scriptName("veta")
    .usage("$0 <youtube-url-or-id>\n$0 <command>")
    .command(
      "completion",
      "Print shell completion script",
      () => ({}),
      () => {
        program.showCompletionScript();
        throw new CommandFinished(0);
      },
    )
    .command("doctor", "Check extraction source health", () => ({}), async () => {
      await handlers.doctor();
    })
    .command(
      "extract <url>",
      "Extract a YouTube transcript",
      (builder) =>
        extractBuilder(builder).positional("url", {
          type: "string",
          demandOption: true,
        }),
      async (args) => {
        await handlers.extract({
          url: String(args.url),
          lang: args.lang as string | undefined,
        });
      },
    )
    .demandCommand(1, "You must provide a YouTube URL or a command.")
    .strict()
    .help()
    .alias("help", "h")
    .completion()
    .exitProcess(false);

  return program;
}
