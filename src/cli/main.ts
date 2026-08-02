/**
 * Composition root entry — keeps adapter imports off the completion path (D17).
 */
if (process.argv.includes("--get-yargs-completions")) {
  const { runCompletionArgv } = await import("./completion.js");
  runCompletionArgv(process.argv.slice(2));
} else {
  const { main } = await import("./run.js");
  main();
}
