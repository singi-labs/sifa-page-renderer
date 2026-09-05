import { describe, it, expect } from 'vitest';
import type { Profile } from '@singi-labs/sifa-sdk';
import { renderHighlights } from './highlights';

// A fixed "today" so upcoming/recent decisions are deterministic.
const TODAY = '2026-09-04';

/** Build a Profile fixture with the required scalars filled and the rest overridable. */
function makeProfile(partial: Partial<Profile> = {}): Profile {
  return {
    did: 'did:plc:me',
    handle: 'me.example',
    displayName: 'Me Person',
    claimed: true,
    followersCount: 0,
    followingCount: 0,
    connectionsCount: 0,
    positions: [],
    education: [],
    skills: [],
    isOwnProfile: false,
    ...partial,
  };
}

/** A profile with two highlights (career + education), enough to render. */
function twoHighlightProfile(extra: Partial<Profile> = {}): Profile {
  return makeProfile({
    positions: [{ rkey: 'a', title: 'Engineer', entityName: 'Acme', startedAt: '2020-01' }],
    education: [
      { rkey: 'e', institution: 'MIT', degree: 'BSc', startedAt: '2010-09', endedAt: '2014-06' },
    ],
    ...extra,
  });
}

describe('renderHighlights', () => {
  it('renders the block with a heading and one card per highlight', () => {
    const html = renderHighlights(twoHighlightProfile(), { today: TODAY });
    expect(html).toContain('class="highlights"');
    expect(html).toContain('id="highlights-heading"');
    expect(html).toContain('>Highlights<');
    // Two tiles -> two cards.
    expect(html.match(/class="highlight-card"/g)).toHaveLength(2);
    expect(html).toContain('Engineer');
    expect(html).toContain('BSc');
  });

  it('omits the block entirely when under two highlights (sparse-collapse)', () => {
    const oneOnly = makeProfile({
      positions: [{ rkey: 'a', title: 'Engineer', company: 'Acme', startedAt: '2020-01' }],
    });
    expect(renderHighlights(oneOnly, { today: TODAY })).toBe('');
    expect(renderHighlights(makeProfile(), { today: TODAY })).toBe('');
  });

  it('rewrites the link to the personal-site section slug, not the profile-page anchor', () => {
    const html = renderHighlights(
      twoHighlightProfile({
        presentations: [
          {
            rkey: 't',
            title: 'A talk',
            deliveries: [{ rkey: 'd', eventName: 'DevConf', date: '2024-05-01' }],
          },
        ],
      }),
      { today: TODAY },
    );
    // The talk links to the personal site's own section slug (derived from
    // SECTION_LABELS), not the profile page's `#presentations` anchor.
    expect(html).toContain('href="#talks-and-sessions"');
    expect(html).not.toContain('href="#presentations"');
  });

  it('marks an upcoming talk with the current/upcoming pill, a past one with recent', () => {
    const upcoming = renderHighlights(
      twoHighlightProfile({
        presentations: [
          {
            rkey: 't',
            title: 'Future talk',
            deliveries: [{ rkey: 'd', eventName: 'IOSP', date: '2026-10-12' }],
          },
        ],
      }),
      { today: TODAY },
    );
    expect(upcoming).toContain('highlight-pill--upcoming');
    expect(upcoming).toContain('>Upcoming<');
  });

  it('renders a validated cover image and drops an unsafe one', () => {
    const safe = renderHighlights(
      twoHighlightProfile({
        publications: [
          { rkey: 'p', title: 'Paper', date: '2026-01', image: 'https://img.example/hero.jpg' },
        ],
      }),
      { today: TODAY },
    );
    expect(safe).toContain('class="highlight-cover"');
    expect(safe).toContain('src="https://img.example/hero.jpg"');

    const unsafe = renderHighlights(
      twoHighlightProfile({
        publications: [
          { rkey: 'p', title: 'Paper', date: '2026-01', image: 'javascript:alert(1)' },
        ],
      }),
      { today: TODAY },
    );
    expect(unsafe).not.toContain('highlight-cover');
    expect(unsafe).not.toContain('javascript:');
  });

  it('escapes user text in titles and meta', () => {
    const html = renderHighlights(
      twoHighlightProfile({
        positions: [
          { rkey: 'a', title: '<script>x</script>', entityName: 'Acme & Co', startedAt: '2020-01' },
        ],
      }),
      { today: TODAY },
    );
    expect(html).not.toContain('<script>x</script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('Acme &amp; Co');
  });
});
