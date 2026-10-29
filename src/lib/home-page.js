/* @file-notes: Übergang für #9: erkennt eine Startseite, die ihre früheren Laufzeit-Patches selbst enthält. */

// index.html carries this marker once the former runtime patches live in the
// file itself. While it is present, the worker layers serve the page unchanged.
// Remove together with the patch code (issue #9).
export const INLINE_PATCHES_MARKER = '<meta name="lmu-runtime-patches" content="inline">';

export const hasInlinePatches = (html) => html.includes(INLINE_PATCHES_MARKER);
