// ШЕФ wordmark — faithful vector rebuild of «Концепция 1».
// Geometry: rubleny grotesk, 45° diagonal cuts ("/"), blue accent slash inside «Е».
// .body fills recolor per context (dark on light / white on dark); .accent stays blue.
window.SHEF_LOGO = `
<svg class="mark" viewBox="0 -18 720 236" xmlns="http://www.w3.org/2000/svg" aria-label="ШЕФ" role="img">
  <g class="body" fill="#1D1D1F">
    <!-- Ш : left vertical, center pennant, right vertical with sheared «/» foot; bottom bar with «/» divider -->
    <path d="M0 0H48V200H0Z"/>
    <path d="M0 155H160L120 200H0Z"/>
    <path d="M82 155V96L128 58V155Z"/>
    <path d="M186 0H230V200H148L186 155Z"/>
    <!-- Е : spine + top arm («\» end) + short middle stub + bottom arm («/» end) -->
    <path d="M268 0H318V200H268Z"/>
    <path d="M268 0H478L438 50H268Z"/>
    <path d="M268 78H352L312 128H268Z"/>
    <path d="M268 150H438L478 200H268Z"/>
    <!-- Ф -->
    <path d="M585 -12H627V212H585Z"/>
    <path fill-rule="evenodd" clip-rule="evenodd" d="M508 100A98 82 0 1 0 704 100A98 82 0 1 0 508 100ZM554 100A52 42 0 1 0 658 100A52 42 0 1 0 554 100Z"/>
  </g>
  <!-- blue 45° tip that COMPLETES the «Е» middle arm -->
  <path class="accent" d="M352 78H404L364 128H312Z" fill="#2563EB"/>
</svg>`;

// ШЕФ monogram — the iconic «Ш» glyph with the blue 45° forward-accent in its
// double-diagonal foot. ШЕФ's consistent "face" across the product.
window.SHEF_MONO = `
<svg class="mono-mark" viewBox="-20 -18 268 236" xmlns="http://www.w3.org/2000/svg" aria-label="ШЕФ" role="img">
  <g class="body" fill="#fff">
    <path d="M0 0H46V200H0Z"/>
    <path d="M91 0H137V200H91Z"/>
    <path d="M182 0H228V200H182Z"/>
    <path d="M0 156H228V200H0Z"/>
  </g>
  <path class="accent" d="M188 156H228L184 200H144Z" fill="#2563EB"/>
</svg>`;
