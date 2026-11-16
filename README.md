# dsh-boot-whale

A full-screen dot whale opens DeepSeek Harness. As the last ripple fades, the **deepseek HARNESS** logo appears in a 300 ms crossfade. The logo breathes by dimming and shrinking slightly, then grows back to full brightness. It completes one 1.6-second cycle before the workspace appears and keeps breathing if loading takes longer.

The logo is up to 336 pixels wide and fits within 80% of a narrow window. The opening follows DSH’s light or dark background. With reduced motion enabled, it shows a static logo. Startup failures immediately reveal DSH’s error report.

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
