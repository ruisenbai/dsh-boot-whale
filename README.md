# dsh-boot-whale

A full-screen dot whale opens DeepSeek Harness. When the whale finishes, the **deepseek HARNESS** logo appears for at least 1.2 seconds. It gently dims and brightens while the application loads, then fades into the ready interface. With reduced motion enabled, a static logo replaces the whale and its pulse. The opening uses DSH’s light or dark background and fits narrow windows. Startup failures immediately reveal DSH’s error report.

## Install

On Desktop, use a DSH build that signals opening plugins when a visible window reloads. This lets a refresh replay the opening and return to the workspace. A build with its own startup whale can play both openings.

1. Launch DSH once to initialize the `desktop` profile, then fully quit it.
2. Install the plugin with the DSH CLI:

   ```sh
   dsh plugin --profile desktop add github:ruisenbai/dsh-boot-whale#main
   ```

3. Reopen DSH. To remove it later, fully quit DSH and run `dsh plugin --profile desktop remove dsh-boot-whale`.

The plugin contributes an early index injection, following the timing used by [dsh-video-skin](https://github.com/Something11235/dsh-video-skin). Its Host half serves the bundled WebP atlas. No client bundle or build step is needed. The atlas and renderer derive from the MIT-licensed DeepSeek Harness boot whale; see [LICENSE](LICENSE).

Run `npm test` to check injection, timing, and the asset route.
