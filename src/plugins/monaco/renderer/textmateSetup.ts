// Shiki-based TextMate highlighting was removed — it breaks Monaco's
// incremental tokenization on scroll (EncodedTokensProvider state divergence).
// Monaco's built-in Monarch tokenizers + the enriched theme rules are used instead.
export function initTextMate(_monacoInstance: unknown): Promise<void> {
  return Promise.resolve()
}
