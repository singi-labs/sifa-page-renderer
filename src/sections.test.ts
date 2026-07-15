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

  it('renders a publication title as a link, falling back to a DOI URL', () => {
    const profile = makeProfile({
      publications: [
        { rkey: 'p1', title: 'On Trust', publisher: 'ACM', date: '2021-05', doi: '10.1/xyz' },
      ],
    });
    const pubs = buildProfileSections(profile).find((s) => s.id === 'publications')!;
    expect(pubs.html).toContain('href="https://doi.org/10.1/xyz"');
    expect(pubs.html).toContain('On Trust');
    expect(pubs.html).toContain('ACM');
    expect(pubs.html).toContain('(May 2021)');
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
