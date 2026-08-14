import { describe, expect, it } from 'vitest';
import { splitAIDesignHTML } from '../splitAIDesignHTML';

describe('splitAIDesignHTML', () => {
  it('extracts styles and annotates slot hosts with stable markers', () => {
    const html = `
      <style>.hub-custom-page{color:red} #hub-feed .hub-slot-tab{color:blue}</style>
      <div class="hub-custom-page">
        <section class="hero-shell">
          <div id="hub-join" style="padding:12px"></div>
        </section>
        <main>
          <div id="hub-feed" style="--color-background:#111;padding:24px"></div>
        </main>
      </div>
    `;

    const result = splitAIDesignHTML(html);

    expect(result.styleContent).toContain('.hub-custom-page');
    expect(result.hasSlots).toBe(true);
    expect(result.slotsByMarker.size).toBe(2);
    expect(result.htmlWithoutStyles).toContain('data-hub-slot-marker');
    expect(result.htmlWithoutStyles).toContain('hub-slot-marker-hub-join');
    expect(result.htmlWithoutStyles).toContain('hub-slot-marker-hub-feed');
  });

  it('preserves safe container hosts and safe layout attributes', () => {
    const html = `
      <div class="hub-custom-page">
        <section
          id="hub-feed"
          class="feed-shell fancy-shell"
          data-density="compact"
          title="Feed shell"
          style="--color-background:#111;padding:24px"
        ></section>
      </div>
    `;

    const result = splitAIDesignHTML(html);

    expect(result.htmlWithoutStyles).toContain('<section');
    expect(result.htmlWithoutStyles).toContain('class="feed-shell fancy-shell"');
    expect(result.htmlWithoutStyles).toContain('data-density="compact"');
    expect(result.htmlWithoutStyles).toContain('title="Feed shell"');
    expect(result.htmlWithoutStyles).toContain('data-hub-slot-marker="hub-slot-marker-hub-feed"');
  });

  it('normalizes unsafe slot hosts to a safe runtime container', () => {
    const html = `
      <div class="hub-custom-page">
        <button id="hub-join" class="join-shell" data-cta="join-now">Placeholder</button>
      </div>
    `;

    const result = splitAIDesignHTML(html);

    expect(result.htmlWithoutStyles).toContain('<div');
    expect(result.htmlWithoutStyles).not.toContain('<button');
    expect(result.htmlWithoutStyles).toContain('class="join-shell"');
    expect(result.htmlWithoutStyles).toContain('data-cta="join-now"');
  });

  it('strips harmful host attributes like hidden and aria-hidden', () => {
    const html = `
      <div class="hub-custom-page">
        <section
          id="hub-feed"
          class="feed-shell"
          data-density="compact"
          hidden
          aria-hidden="true"
          onclick="alert('x')"
        ></section>
      </div>
    `;

    const result = splitAIDesignHTML(html);

    expect(result.htmlWithoutStyles).toContain('class="feed-shell"');
    expect(result.htmlWithoutStyles).toContain('data-density="compact"');
    expect(result.htmlWithoutStyles).not.toContain('hidden');
    expect(result.htmlWithoutStyles).not.toContain('aria-hidden');
    expect(result.htmlWithoutStyles).not.toContain('onclick');
  });

  it('preserves surrounding nesting so slot markers stay in-place', () => {
    const html = `
      <div class="hub-custom-page">
        <section class="hero-shell">
          <div id="hub-join"></div>
        </section>
      </div>
    `;

    const result = splitAIDesignHTML(html);

    expect(result.htmlWithoutStyles).toContain('<section class="hero-shell">');
    expect(result.htmlWithoutStyles).toContain('data-hub-slot-marker="hub-slot-marker-hub-join"');
    expect(result.htmlWithoutStyles).toContain('</section>');
  });

  it('returns no markers when no slots are present', () => {
    const result = splitAIDesignHTML('<div class="hub-custom-page"><p>No slots</p></div>');

    expect(result.hasSlots).toBe(false);
    expect(result.slotsByMarker.size).toBe(0);
    expect(result.htmlWithoutStyles).toContain('<p>No slots</p>');
  });

  it('removes executable markup, unsafe URLs, and resource-loading CSS', () => {
    const result = splitAIDesignHTML(`
      <style>@import url(https://attacker.example/style.css); .x { background: url(https://attacker.example/pixel) }</style>
      <div class="hub-custom-page" onclick="alert(1)">
        <script>alert(1)</script>
        <iframe src="https://attacker.example"></iframe>
        <a href="javascript:alert(1)" target="_blank">Bad link</a>
        <img src="javascript:alert(1)" onerror="alert(1)" />
        <div id="hub-feed" style="background:url(https://attacker.example/pixel)"></div>
      </div>
    `);

    expect(result.styleContent).toBe('');
    expect(result.htmlWithoutStyles).not.toContain('<script');
    expect(result.htmlWithoutStyles).not.toContain('<iframe');
    expect(result.htmlWithoutStyles).not.toContain('onclick');
    expect(result.htmlWithoutStyles).not.toContain('javascript:');
    expect(result.htmlWithoutStyles).not.toContain('background:url');
  });
});
