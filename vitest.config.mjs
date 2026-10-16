import { configDefaults, defineConfig } from "vitest/config";

// Agent sessions keep extra git worktrees under .claude/; their copies of the tests are not ours to run.
export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, ".claude/**", "dist/**", "release/**"],
  },
});
