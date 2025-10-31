// offscreen.js - Runs in offscreen document (extension context with trial tokens)
console.log('[Offscreen] Offscreen document loaded');
console.log('[Offscreen] Extension context:', !!chrome?.runtime?.id);
console.log('[Offscreen] "Rewriter" in window:', 'Rewriter' in window);
console.log('[Offscreen] typeof window.Rewriter:', typeof window.Rewriter);

// Listen for AI API requests from content script (via background)
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  console.log('[Offscreen] Received message:', msg);

  if (msg?.type === 'REWRITE_TEXT') {
    handleRewrite(msg.text, msg.mode || 'rewrite').then(sendResponse);
    return true; // Keep channel open for async response
  }
});

// ===== REWRITER API =====
async function handleRewrite(text, mode = 'rewrite') {
  try {
    const modeLabel = mode === 'fix' ? 'Fix (proofread)' : 'Rewrite';
    console.log(`[Offscreen] Calling Rewriter API in ${modeLabel} mode...`);
    console.log('[Offscreen] Text to process:', text);

    // Check if Rewriter API is available (capital R!)
    if (!('Rewriter' in window)) {
      const errorMsg = `Rewriter API not available in offscreen document.
        - 'Rewriter' in window: false
        - Extension ID: ${chrome?.runtime?.id}

        This usually means:
        1. Origin trial tokens not loaded properly
        2. Chrome version incompatible (need Chrome 127+)
        3. #rewriter-api-for-gemini-nano flag not enabled`;

      console.error('[Offscreen]', errorMsg);
      return { ok: false, error: errorMsg };
    }

    // Check availability
    console.log('[Offscreen] Checking Rewriter.availability()...');
    const availability = await window.Rewriter.availability();
    console.log('[Offscreen] Rewriter availability:', availability);

    if (availability === 'no' || availability === 'unavailable') {
      return { ok: false, error: `Rewriter unavailable on this device (status: ${availability})` };
    }

    // Configure rewriter settings based on mode
    let rewriterOptions = {};
    let rewriteContext = '';

    if (mode === 'fix') {
      // Fix mode: minimal changes, just proofread for grammar/spelling
      // Use "as-is" settings to keep the text as close to original as possible
      rewriterOptions = {
        tone: 'as-is',
        length: 'as-is',
        format: 'as-is',
        sharedContext: "Fix only grammar, spelling, and punctuation errors. Keep the original wording and style as much as possible.",
        expectedInputLanguages: ['en'],
        expectedContextLanguages: ['en'],
        outputLanguage: 'en'
      };
      rewriteContext = "Correct grammar and spelling only. Do not change the meaning or style.";
    } else {
      // Rewrite mode: full enhancement
      rewriterOptions = {
        tone: 'more-formal',
        length: 'as-is',
        format: 'as-is',
        sharedContext: "Improve the clarity, tone, and professionalism of the text while maintaining its original meaning.",
        expectedInputLanguages: ['en'],
        expectedContextLanguages: ['en'],
        outputLanguage: 'en'
      };
      rewriteContext = "Make it more clear, concise, and well-structured.";
    }

    // Create rewriter with appropriate settings
    console.log(`[Offscreen] Creating Rewriter with options:`, rewriterOptions);
    const rewriter = await window.Rewriter.create(rewriterOptions);

    console.log(`[Offscreen] Rewriter created in ${modeLabel} mode, processing...`);

    // Rewrite with context
    const result = await rewriter.rewrite(text, {
      context: rewriteContext
    });

    console.log(`[Offscreen] Processed text (${modeLabel}):`, result);
    return { ok: true, result: result };

  } catch (err) {
    console.error('[Offscreen] Rewriter error:', err);
    return { ok: false, error: String(err) };
  }
}

console.log('[Offscreen] Ready to handle AI requests');
