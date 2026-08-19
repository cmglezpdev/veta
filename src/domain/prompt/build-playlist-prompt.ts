export type PlaylistPromptMemberStatus = "ok" | "failed" | "unavailable";

export type PlaylistPromptMember = {
  /** 1-based ORIGINAL playlist position; also the NN- prefix of `notesFolder`. */
  readonly position: number;
  /** Video title, or a caller-supplied placeholder when the title never resolved. */
  readonly title: string;
  readonly status: PlaylistPromptMemberStatus;
  /** Absolute path to THIS member's own prompt.md. Non-null iff status === "ok". */
  readonly promptPath: string | null;
  /** "NN-<video-slug>" — the subfolder the member prompt already targets. Non-null iff status === "ok". */
  readonly notesFolder: string | null;
  /** One-line human reason. Non-null iff status !== "ok". */
  readonly failureReason: string | null;
};

export type PlaylistPromptTarget = {
  /** "<playlist-slug>" — the library root the assistant creates in its own cwd. */
  readonly notesDir: string;
  readonly playlistUrl: string | null;
};

/**
 * Render the playlist-level prompt.md: an ORCHESTRATOR brief, not a notes brief.
 *
 * The single-video prompt says "read this transcript, write these notes";
 * this one says "delegate, then synthesize". It never contains a transcript
 * and never mentions veta's data directory except as the source of the
 * absolute member-prompt paths.
 *
 * `members` is rendered in the given order and is never sorted here — the
 * caller (`runPlaylistExtraction`) owns ordering, so this stays trivially
 * deterministic.
 */
export function buildPlaylistPrompt(
  playlistTitle: string,
  members: readonly PlaylistPromptMember[],
  target: PlaylistPromptTarget,
): string {
  const ready = members.filter((m) => m.status === "ok");
  const notReady = members.filter((m) => m.status !== "ok");

  const blocks: string[] = [
    "# Build a study-notes library from this playlist",
    "",
    "You are the orchestrator of a multi-video library: spawn one subagent " +
      "per video, run them in parallel, then write the guide that ties them " +
      "together. Your subagents write the notes; you write the synthesis.",
    "",
    ...playlistSection(playlistTitle, target, members.length, ready.length, notReady.length),
    ...roleSection(),
    ...step1(target.notesDir),
    ...step2(target.notesDir, ready),
    ...step3(),
    ...step4(target.notesDir, notReady),
    "## Language",
    "",
    "Write the README in the same language the member notes are written in; " +
      "when they differ, follow the majority. Do not translate video titles.",
    "",
    "## Rules",
    "",
    "- Never read a transcript.",
    `- Never write outside \`${target.notesDir}/\`.`,
    "- Never invent content for a video whose subagent did not report.",
    "- Never edit a subagent's notes folder.",
  ];

  return `${blocks.join("\n")}\n`;
}

function playlistSection(
  title: string,
  target: PlaylistPromptTarget,
  total: number,
  readyCount: number,
  notReadyCount: number,
): string[] {
  const lines = ["## The playlist", "", `- Title: ${title}`];
  if (target.playlistUrl !== null) lines.push(`- URL: ${target.playlistUrl}`);
  lines.push(
    `- Total members in this run: ${total}`,
    `- Ready to delegate: ${readyCount}`,
    `- Unavailable: ${notReadyCount}`,
    "",
  );
  return lines;
}

function roleSection(): string[] {
  return [
    "## Your role — orchestrate, do not read",
    "",
    "Do not read any transcript. Do not open the member prompts to execute " +
      "them yourself.",
    "",
    "One subagent per ready video. They are fully independent — run them in " +
      "parallel.",
    "",
    "Each subagent reports back a short summary; your context holds N " +
      "summaries, never N transcripts. That is the point.",
    "",
    "If you cannot spawn subagents, process the videos one at a time and " +
      "discard each video's detail before starting the next.",
    "",
  ];
}

function step1(notesDir: string): string[] {
  return [
    "## Step 1 — Create the library root",
    "",
    `Create \`${notesDir}/\` in your current working directory. Every path ` +
      "below is relative to it.",
    "",
  ];
}

function step2(notesDir: string, ready: readonly PlaylistPromptMember[]): string[] {
  const lines = ["## Step 2 — Delegate one subagent per video", ""];

  if (ready.length === 0) {
    lines.push("No member is ready to delegate — there is nothing to hand to a subagent.", "");
    return lines;
  }

  lines.push("| # | Video | Instructions | Notes folder |", "|---|---|---|---|");
  for (const member of ready) {
    lines.push(
      `| ${member.position} | ${member.title} | \`${member.promptPath}\` | ` +
        `\`${notesDir}/${member.notesFolder}/\` |`,
    );
  }
  lines.push(
    "",
    "Give every subagent this brief:",
    "",
    "> Read the instructions at `<promptPath>` and follow them end to end. " +
      "That document already targets `<notesDir>/<notesFolder>/` relative to " +
      "the working directory you were started in — do not change that path, " +
      "do not rename the folder, do not renumber it. When you are done, " +
      "report back only: the folder you created, the video's title, a " +
      "3-sentence summary of what it covers, and its 3–5 key takeaways.",
    "",
    "The `NN-` prefixes are the playlist's own positions — never renumber or " +
      "reorder them. Every subagent shares the orchestrator's working directory.",
    "",
  );
  return lines;
}

function step3(): string[] {
  return [
    "## Step 3 — Collect the reports",
    "",
    "Wait for every subagent to finish. A subagent that fails or reports no " +
      "folder is recorded as a failure below — never retry silently and " +
      "never write its notes yourself.",
    "",
  ];
}

function step4(notesDir: string, notReady: readonly PlaylistPromptMember[]): string[] {
  const lines = [
    `## Step 4 — Write \`${notesDir}/README.md\``,
    "",
    "This is your only writing task. Give it these sections, in order:",
    "",
    "- An H1 with the playlist title, then the playlist URL when known.",
    "- `## What this library covers` — synthesized from the subagent " +
      "summaries: the throughline of the series, what a reader gets from it " +
      "end to end.",
    "- `## Videos` — an ordered list in playlist order, one entry per " +
      "delegated video, each linking `./NN-<slug>/README.md` and carrying " +
      "its subagent's summary.",
    "- `## Suggested reading path` — what to study first, which videos " +
      "group into a theme, which depend on an earlier one, and whether the " +
      "playlist order actually matters.",
  ];

  if (notReady.length > 0) {
    lines.push(
      "- `## Not included` — the failed/unavailable members with position, " +
        "title, and reason, so the gap is explicit:",
      "",
      ...notReady.map((m) => `  - Position ${m.position} — ${m.title} — ${m.failureReason}`),
    );
  }

  lines.push(
    "",
    "Add a mermaid overview diagram only when it genuinely clarifies the " +
      "series structure.",
    "",
  );
  return lines;
}
