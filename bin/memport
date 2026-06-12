#!/usr/bin/env node
import { homedir } from "node:os";
import { runCli } from "../dist/cli.js";

const exitCode = await runCli(process.argv.slice(2), {
  cwd: process.cwd(),
  env: process.env,
  homeDir: homedir(),
  stdout: (message) => process.stdout.write(message),
  stderr: (message) => process.stderr.write(message)
});
process.exitCode = exitCode;
