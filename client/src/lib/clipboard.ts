/**
 * Copy text to the clipboard, and say honestly whether it worked.
 *
 * `navigator.clipboard` is `undefined` on a non-secure origin, and even where
 * it exists `writeText` can reject — a permission prompt dismissed, a
 * document that lost focus, a browser that restricts it outside a direct user
 * gesture. Two components independently discovered this and wrote the same
 * try/catch by hand; four others called `writeText` and told the user
 * "Copied" regardless of whether it landed, which for `EncryptionKey`'s
 * recovery phrase and `TwoFactorSettings`' recovery codes is a lie about the
 * one thing they cannot afford to be wrong about — content that cannot be
 * shown again.
 *
 * Returns whether the copy actually happened rather than throwing, so a
 * caller decides its own wording ("Recovery phrase copied." reads very
 * differently from "Link copied") without repeating the try/catch.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
