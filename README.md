# dsh-boot-whale

A full-screen dot whale opening for DeepSeek Harness. The animation contains no text. If the application is still loading when the whale finishes, a redesigned **DeepSeek / HARNESS** wordmark stays on screen until the main interface is ready. A fast launch shows the whole whale and then fades into the interface. Light and dark themes, narrow windows, and reduced-motion settings are supported; startup failures reveal DSH's own error report.

## Install

This plugin is intended for the DSH build that removes its built-in boot whale. A stock build that still contains the built-in animation can play both openings.

1. Launch DSH once to initialize the `desktop` profile, then fully quit it.
2. Install the plugin with the DSH CLI:

   ```sh
   dsh plugin --profile desktop add github:ruisenbai/dsh-boot-whale#main
   ```

3. Reopen DSH. To remove it later, fully quit DSH and run `dsh plugin --profile desktop remove dsh-boot-whale`.

The plugin contributes an early index injection, following the timing used by [dsh-video-skin](https://github.com/Something11235/dsh-video-skin). Its Host half serves the bundled WebP atlas. No client bundle or build step is needed. The atlas and renderer derive from the MIT-licensed DeepSeek Harness boot whale; see [LICENSE](LICENSE).

Run `npm test` to check injection, timing, and the asset route.
