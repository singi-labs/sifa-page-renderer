import { describe, it, expect } from 'vitest';
import type { Profile } from '@singi-labs/sifa-sdk';
import { buildProfileSections } from './sections';

/** Build a Profile fixture with the required scalars filled and the rest overridable. */
function makeProfile(partial: Partial<Profile> = {}): Profile {
  return {
    did: 'did:plc:test',
    handle: 'jane.example',
    displayName: 'Jane Doe',
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

describe('buildProfileSections: presence, order, slugs', () => {
  it('returns visible sections in canonical SDK order, excluding Links (sidebar)', () => {
    const profile = makeProfile({
      about: 'Hi there.',
      headline: 'Engineer',
      positions: [{ rkey: '1', title: 'Dev', startedAt: '2020-01' }],
      education: [{ rkey: 'e1', institution: 'MIT', startedAt: '2010', endedAt: '2014' }],
      publications: [{ rkey: 'p1', title: 'A Paper' }],
      externalAccounts: [
        { rkey: 'x1', platform: 'github', url: 'https://github.com/jane', verifiable: true, verified: false },
      ],
    });
    const sections = buildProfileSections(profile);
    expect(sections.map((s) => s.id)).toEqual(['about', 'career', 'publications', 'education']);
    // Links / other-profiles never appears as a body section.
    expect(sections.map((s) => s.id)).not.toContain('other-profiles');
  });

  it('maps About to the index slug and Talks & sessions to talks-and-sessions', () => {
    const profile = makeProfile({
      about: 'Hi.',
      headline: 'Engineer',
      presentations: [{ rkey: 't1', title: 'My Talk' }],
    });
    const sections = buildProfileSections(profile);
    const about = sections.find((s) => s.id === 'about');
    const talks = sections.find((s) => s.id === 'presentations');
    expect(about?.slug).toBe('index');
    expect(about?.title).toBe('About');
    expect(talks?.slug).toBe('talks-and-sessions');
    expect(talks?.title).toBe('Talks & sessions');
  });

  it('omits sections with no content', () => {
    const profile = makeProfile({ about: 'Hi.', headline: 'Engineer' });
    const sections = buildProfileSections(profile);
    expect(sections.map((s) => s.id)).toEqual(['about']);
  });
});

describe('buildProfileSections: structured detail', () => {
  it('renders a position with org, formatted date range, description, and skills', () => {
    const profile = makeProfile({
      positions: [
        {
          rkey: '1',
          title: 'Staff Engineer',
          company: 'Acme',
          startedAt: '2020-03',
          endedAt: '2023-06',
          description: 'Led the **platform** team.',
          linkedSkills: [
            { rkey: 's1', name: 'TypeScript' },
            { rkey: 's2', name: 'Postgres' },
          ],
        },
      ],
    });
    const career = buildProfileSections(profile).find((s) => s.id === 'career')!;
    expect(career.html).toContain('<strong>Staff Engineer at Acme</strong>');
    expect(career.html).toContain('Mar 2020 - Jun 2023');
    // free-text description goes through the Markdown-sanitize path
    expect(career.html).toContain('<strong>platform</strong>');
    expect(career.html).toContain('Skills: TypeScript, Postgres');
  });

  it('renders a non-standard publication as a card: title links (DOI fallback), publisher, date', () => {
    const profile = makeProfile({
      publications: [
        { rkey: 'p1', title: 'On Trust', publisher: 'ACM', date: '2021-05', doi: '10.1/xyz' },
      ],
    });
    const pubs = buildProfileSections(profile).find((s) => s.id === 'publications')!;
    expect(pubs.html).toContain('href="https://doi.org/10.1/xyz"');
    expect(pubs.html).toContain('On Trust');
    expect(pubs.html).toContain('ACM');
    expect(pubs.html).toContain('May 2021');
  });

  it('links a project by its URL and passes the description through Markdown', () => {
    const profile = makeProfile({
      projects: [
        {
          rkey: 'pr1',
          name: 'Widget',
          url: 'https://widget.example',
          startDate: '2022',
          description: 'A _neat_ tool.',
        },
      ],
    });
    const projects = buildProfileSections(profile).find((s) => s.id === 'projects')!;
    expect(projects.html).toContain('href="https://widget.example"');
    expect(projects.html).toContain('<em>neat</em>');
  });

  it('groups skills by category using the SDK labels', () => {
    const profile = makeProfile({
      skills: [
        { rkey: 's1', name: 'TypeScript', category: 'programming_languages' },
        { rkey: 's2', name: 'Leadership', category: 'soft_skills' },
      ],
    });
    const skills = buildProfileSections(profile).find((s) => s.id === 'skills')!;
    expect(skills.html).toContain('<ul class="cv-taglist">');
    expect(skills.html).toContain('TypeScript');
    expect(skills.html).toContain('Leadership');
  });
});

describe('buildProfileSections: visitor visibility', () => {
  it('drops owner-hidden items even though the fetched profile claims isOwnProfile', () => {
    const profile = makeProfile({
      isOwnProfile: true,
      positions: [
        { rkey: '1', title: 'Public Role', startedAt: '2020' },
        { rkey: '2', title: 'Secret Role', startedAt: '2019', hidden: true },
      ],
    });
    const career = buildProfileSections(profile).find((s) => s.id === 'career')!;
    expect(career.html).toContain('Public Role');
    expect(career.html).not.toContain('Secret Role');
  });
});

describe('buildProfileSections: security', () => {
  it('sanitizes <script> and event handlers out of the About Markdown', () => {
    const profile = makeProfile({
      about: '<script>alert(1)</script>\n\nHello<img src=x onerror="alert(1)">.',
      headline: 'Engineer',
    });
    const about = buildProfileSections(profile).find((s) => s.id === 'about')!;
    expect(about.html).not.toContain('onerror');
    expect(about.html).not.toContain('alert(1)');
    expect(about.html).toContain('Hello');
  });

  it('keeps safe Markdown formatting tags in a description', () => {
    const profile = makeProfile({
      positions: [
        {
          rkey: '1',
          title: 'Dev',
          startedAt: '2020',
          description: '**bold** and [a link](https://example.com).',
        },
      ],
    });
    const career = buildProfileSections(profile).find((s) => s.id === 'career')!;
    expect(career.html).toContain('<strong>bold</strong>');
    expect(career.html).toContain('<a href="https://example.com">a link</a>');
  });

  it('drops a javascript: link from a Markdown description', () => {
    const profile = makeProfile({
      positions: [
        {
          rkey: '1',
          title: 'Dev',
          startedAt: '2020',
          description: '[click](javascript:alert(1))',
        },
      ],
    });
    const career = buildProfileSections(profile).find((s) => s.id === 'career')!;
    expect(career.html).not.toContain('javascript:');
  });

  it('does not turn a javascript: project URL into a link', () => {
    const profile = makeProfile({
      projects: [{ rkey: 'pr1', name: 'Evil', url: 'javascript:alert(1)' }],
    });
    const projects = buildProfileSections(profile).find((s) => s.id === 'projects')!;
    expect(projects.html).not.toContain('javascript:');
    // The name still renders as escaped text, just not as an anchor.
    expect(projects.html).toContain('Evil');
    expect(projects.html).not.toContain('<a href');
  });

  it('escapes a quote in a structured field so it cannot break out of markup', () => {
    const profile = makeProfile({
      positions: [{ rkey: '1', title: 'Dev "quote" role', startedAt: '2020' }],
    });
    const career = buildProfileSections(profile).find((s) => s.id === 'career')!;
    expect(career.html).toContain('Dev &quot;quote&quot; role');
  });
});

describe('presentations: deliveries collapse into a summary', () => {
  const profileWithTalk = (deliveries: Array<Record<string, unknown>>) =>
    makeProfile({
      presentations: [{ rkey: 't1', title: 'Persuasive E-commerce' }],
      presentationDeliveries: deliveries.map((d) => ({
        presentationRkey: 't1',
        ...d,
      })) as never,
    });

  it('renders a <details> summary line instead of listing every delivery', () => {
    const html = buildProfileSections(
      profileWithTalk([
        { rkey: 'd1', eventName: 'EXCITE 2025', date: '2025-05-01' },
        { rkey: 'd2', eventName: 'EXCITE 2024', date: '2024-05-01' },
        { rkey: 'd3', eventName: 'Bikkeldag', date: '2023-05-01' },
      ]),
    ).find((s) => s.id === 'presentations')!.html;
    // Collapsed by default behind a native <details>.
    expect(html).toContain('<details');
    expect(html).toContain('<summary');
    // Summary: Delivered Nx · latest YYYY · venues (most-recent first).
    expect(html).toContain('Delivered 3x');
    expect(html).toContain('latest 2025');
    expect(html).toContain('EXCITE 2025, EXCITE 2024, Bikkeldag');
  });

  it('uses "Delivered once" for a single delivery under a talk', () => {
    const html = buildProfileSections(
      profileWithTalk([{ rkey: 'd1', eventName: 'QCon', date: '2022-01-01' }]),
    ).find((s) => s.id === 'presentations')!.html;
    expect(html).toContain('Delivered once');
  });

  it('caps the venue sample and shows a +N overflow', () => {
    const html = buildProfileSections(
      profileWithTalk([
        { rkey: 'd1', eventName: 'A', date: '2025-01-01' },
        { rkey: 'd2', eventName: 'B', date: '2024-01-01' },
        { rkey: 'd3', eventName: 'C', date: '2023-01-01' },
        { rkey: 'd4', eventName: 'D', date: '2022-01-01' },
        { rkey: 'd5', eventName: 'E', date: '2021-01-01' },
      ]),
    ).find((s) => s.id === 'presentations')!.html;
    expect(html).toContain('A, B, C +2');
  });

  it('keeps a standalone session (no parent talk) as a flat entry, not a summary', () => {
    const html = buildProfileSections(
      makeProfile({
        presentationDeliveries: [
          { rkey: 'd1', title: 'Spryker Partner Hackathon', eventName: 'Spryker Partner Hackathon', date: '2023-07-08' },
        ] as never,
      }),
    ).find((s) => s.id === 'presentations')!.html;
    expect(html).toContain('Spryker Partner Hackathon');
    expect(html).not.toContain('Delivered');
    expect(html).not.toContain('<details');
  });
});

describe('publications: standard.site articles group into a rich card', () => {
  const standard = (rkey: string, title: string, date: string) => ({
    rkey,
    title,
    date,
    source: 'standard' as const,
    publisher: 'gui.do',
    publicationName: 'Guido X Jansen',
    publicationUrl: 'https://gui.do',
    url: `https://gui.do/${rkey}`,
    image: `https://cdn.example/${rkey}.jpg`,
  });

  it('groups standard articles under one card with name, count, and thumbnails', () => {
    const html = buildProfileSections(
      makeProfile({
        publications: [
          standard('a1', 'Your identity', '2026-07-01'),
          standard('a2', 'Who owns your network', '2026-06-25'),
        ],
      }),
    ).find((s) => s.id === 'publications')!.html;
    expect(html).toContain('Guido X Jansen');
    expect(html).toContain('2 articles');
    // Cover thumbnails + article title links.
    expect(html).toContain('https://cdn.example/a1.jpg');
    expect(html).toContain('href="https://gui.do/a1"');
    expect(html).toContain('Your identity');
  });

  it('collapses a group beyond three articles behind a "Show more"', () => {
    const html = buildProfileSections(
      makeProfile({
        publications: [
          standard('a1', 'One', '2026-05-01'),
          standard('a2', 'Two', '2026-04-01'),
          standard('a3', 'Three', '2026-03-01'),
          standard('a4', 'Four', '2026-02-01'),
          standard('a5', 'Five', '2026-01-01'),
        ],
      }),
    ).find((s) => s.id === 'publications')!.html;
    expect(html).toContain('<details');
    expect(html).toContain('Show 2 more');
  });

  it('lists non-standard publications separately under "Other publications"', () => {
    const html = buildProfileSections(
      makeProfile({
        publications: [
          standard('a1', 'Standard One', '2026-05-01'),
          { rkey: 'o1', title: 'A Journal Paper', publisher: 'ACM', date: '2020-01', source: 'orcid' },
        ],
      }),
    ).find((s) => s.id === 'publications')!.html;
    expect(html).toContain('Other publications');
    expect(html).toContain('A Journal Paper');
  });
});

describe('courses: linked credential is an actual link when the credential has a URL', () => {
  it('links the credential name to its credentialUrl', () => {
    const html = buildProfileSections(
      makeProfile({
        courses: [{ rkey: 'c1', name: 'Leadership Program', credentialRkey: 'cert1' }] as never,
        certifications: [
          { rkey: 'cert1', name: 'Leadership Cert', issueDate: '2016-01', credentialUrl: 'https://cred.example/x' } as never,
        ],
      }),
    ).find((s) => s.id === 'courses')!.html;
    expect(html).toContain('Linked credential:');
    expect(html).toContain('<a href="https://cred.example/x"');
    expect(html).toContain('Leadership Cert');
  });

  it('leaves the credential name as plain text when it has no URL', () => {
    const html = buildProfileSections(
      makeProfile({
        courses: [{ rkey: 'c1', name: 'Leadership Program', credentialRkey: 'cert1' }] as never,
        certifications: [{ rkey: 'cert1', name: 'Leadership Cert', issueDate: '2016-01' } as never],
      }),
    ).find((s) => s.id === 'courses')!.html;
    expect(html).toContain('Linked credential:');
    expect(html).toContain('Leadership Cert');
    // No anchor wrapping the credential name.
    expect(html).not.toContain('<a href');
  });
});
