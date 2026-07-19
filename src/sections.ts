/**
 * Structured section rendering: turn the SDK `Profile` object directly into
 * per-section HTML, driven by the shared SDK profile section model.
 *
 * This replaces the previous pipeline that re-parsed the profile's `.md`
 * export into flat Markdown bodies. Rendering from structured data gives the
 * personal site the same rich detail the main Sifa profile page has -- proper
 * dates via the shared formatters, real (validated) links, and publication
 * citations -- with sort order guaranteed identical to every other Sifa
 * surface because it uses the SAME `ALL_SECTIONS` model + per-section sorts.
 *
 * Purity is preserved: the SDK main entry is types + pure logic + formatters
 * (no fs, no fetch, no React), so importing it here keeps the renderer
 * framework-free. Section order, presence, visitor visibility, and labels all
 * come from the SDK; this module only maps each section's items to HTML.
 *
 * Security: free-text fields (About, and every item description / activities
 * blurb) are user-authored Markdown and go through the same
 * `marked` + `DOMPurify.sanitize` allowlist path as before. Every structured
 * field is `escapeHtml`'d, and every profile-supplied URL goes through
 * `safeUrl` (http/https only, escaped).
 */

import type {
  Profile,
  ProfilePosition,
  ProfileEducation,
  ProfileProject,
  ProfilePublication,
  ProfileCertification,
  ProfileHonor,
  ProfileCourse,
  ProfileInvolvement,
  ProfileLanguage,
  ProfilePresentation,
  ProfilePresentationDelivery,
} from '@singi-labs/sifa-sdk';
import {
  type SectionId,
  SECTION_LABELS,
  getVisibleSectionIds,
  filterHidden,
  sortPositions,
  sortEducation,
  sortProjects,
  sortPublications,
  sortCertifications,
  sortHonors,
  sortLanguages,
  groupInvolvementByHeading,
  formatTimelineDate,
  formatDateRange,
  formatCompanyName,
  formatLocation,
  dedupeSkills,
  groupSkillsByCategory,
  CATEGORY_LABELS,
  formatPresentationDuration,
  summarizePresentationDeliveries,
  getPresentationRoleLabel,
  getCalendarEventModeLabel,
  EMPLOYMENT_TYPE_LABELS,
  WORKPLACE_TYPE_LABELS,
} from '@singi-labs/sifa-sdk';
import { escapeHtml, safeUrl, renderMarkdown } from './util.js';
import { sectionSlug } from './slug.js';

/** A section rendered to HTML, ready to drop into the page layout. */
export interface RenderedSection {
  /** Canonical SDK section id (e.g. `career`, `publications`). */
  id: SectionId;
  /** URL-safe slug for the nav anchor / static filename. `about` -> `index`. */
  slug: string;
  /** Display heading, from the SDK's exhaustive `SECTION_LABELS`. */
  title: string;
  /** Sanitized/escaped inner HTML, to be placed inside a `.prose` container. */
  html: string;
}

interface RenderCtx {
  /**
   * Always the public visitor view for a personal site (a public artifact),
   * so items the owner hid stay hidden regardless of who requested the page.
   */
  isOwnProfile: false;
}

const PROFICIENCY_LABELS: Record<string, string> = {
  elementary: 'elementary',
  limited_working: 'limited working',
  professional_working: 'professional working',
  full_professional: 'full professional',
  native: 'native',
};

/** Items visible to a public visitor: always drop owner-hidden items. */
function visible<T extends { hidden?: boolean }>(items: T[] | undefined): T[] {
  return filterHidden(items);
}

/** A validated anchor, or the plain escaped text when the URL is unsafe/absent. */
function safeAnchor(url: string | undefined | null, text: string): string {
  const safe = safeUrl(url);
  const label = escapeHtml(text);
  return safe ? `<a href="${safe}" rel="noopener" target="_blank">${label}</a>` : label;
}

/** A muted, escaped "(date range)" span, or empty when there is no range. */
function whenSpan(when: string): string {
  return when ? ` <span class="cv-when">(${escapeHtml(when)})</span>` : '';
}

/** Wrap item rows in the shared list container. Empty rows -> empty string. */
function list(rows: string[]): string {
  const items = rows.filter((r) => r);
  return items.length ? `<ul class="cv-list">${items.join('')}</ul>` : '';
}

// --- Per-section renderers (one per SectionId; the map below is exhaustive) --

function renderAbout(profile: Profile): string {
  if (!profile.about) return '';
  return renderMarkdown(profile.about);
}

function renderCareer(profile: Profile): string {
  const items = sortPositions(visible(profile.positions));
  return list(
    items.map((p: ProfilePosition) => {
      const org = p.entityName ?? p.company;
      const at = org ? ` at ${escapeHtml(formatCompanyName(org))}` : '';
      const head = `<strong>${escapeHtml(p.title ?? '')}${at}</strong>${whenSpan(
        formatDateRange(p.startedAt, p.endedAt),
      )}`;
      const parts = [head];
      const meta = [
        p.employmentType ? EMPLOYMENT_TYPE_LABELS[p.employmentType] : undefined,
        formatLocation(p.location) || undefined,
        p.workplaceType ? WORKPLACE_TYPE_LABELS[p.workplaceType] : undefined,
      ].filter(Boolean) as string[];
      if (meta.length) parts.push(`<div class="cv-meta">${escapeHtml(meta.join(' · '))}</div>`);
      if (p.description) parts.push(`<div class="cv-desc">${renderMarkdown(p.description)}</div>`);
      const skills = (p.linkedSkills ?? []).map((s) => s.name).filter(Boolean);
      if (skills.length)
        parts.push(`<div class="cv-skills">Skills: ${escapeHtml(skills.join(', '))}</div>`);
      return `<li class="cv-entry">${parts.join('')}</li>`;
    }),
  );
}

function renderSkills(profile: Profile): string {
  const groups = groupSkillsByCategory(dedupeSkills(profile.skills ?? []));
  return groups
    .map(([category, skills]) => {
      const label = (CATEGORY_LABELS as Record<string, string>)[category] ?? category;
      const tags = skills.map((s) => `<li>${escapeHtml(s.name)}</li>`).join('');
      return `<h3>${escapeHtml(label)}</h3><ul class="cv-taglist">${tags}</ul>`;
    })
    .join('');
}

function renderProjects(profile: Profile): string {
  const items = sortProjects(visible(profile.projects));
  return list(
    items.map((pr: ProfileProject) => {
      const head = `<strong>${safeAnchor(pr.url, pr.name ?? '')}</strong>${whenSpan(
        formatDateRange(pr.startDate, pr.endDate),
      )}`;
      const desc = pr.description
        ? `<div class="cv-desc">${renderMarkdown(pr.description)}</div>`
        : '';
      return `<li class="cv-entry">${head}${desc}</li>`;
    }),
  );
}

interface PublicationGroup {
  name: string;
  url: string | null;
  articles: ProfilePublication[];
}

/**
 * Group Standard.site articles under their parent publication, matching the
 * Sifa profile. Key precedence: publicationUri -> publicationUrl -> publisher
 * -> rkey. Groups ordered by most-recent article; articles newest-first.
 */
function groupStandardPublications(pubs: ProfilePublication[]): PublicationGroup[] {
  const time = (p: ProfilePublication): number => (p.date ? new Date(p.date).getTime() : 0);
  const groups = new Map<string, PublicationGroup>();
  for (const pub of pubs) {
    const key = pub.publicationUri ?? pub.publicationUrl ?? pub.publisher ?? pub.rkey;
    let group = groups.get(key);
    if (!group) {
      group = { name: pub.publicationName ?? pub.publisher ?? 'Publication', url: pub.publicationUrl ?? null, articles: [] };
      groups.set(key, group);
    }
    group.articles.push(pub);
  }
  const ordered = [...groups.values()];
  for (const g of ordered) g.articles.sort((a, b) => time(b) - time(a));
  ordered.sort((a, b) => time(b.articles[0]!) - time(a.articles[0]!));
  return ordered;
}

/** The link target for a publication title: explicit URL, else a DOI resolver. */
function publicationHref(pub: ProfilePublication): string | undefined {
  return pub.url ?? (pub.doi ? `https://doi.org/${pub.doi}` : undefined);
}

/** A Standard.site article row inside a group card: thumbnail, title, publisher, date. */
function articleRow(pub: ProfilePublication): string {
  if (!pub.title) return '';
  const href = safeUrl(publicationHref(pub));
  const img = safeUrl(pub.image ?? undefined);
  const thumb = img
    ? `<img class="pub-thumb" src="${img}" alt="" loading="lazy">`
    : '<span class="pub-thumb pub-thumb-empty" aria-hidden="true"></span>';
  const sub = pub.publisher ? `<span class="pub-row-sub">${escapeHtml(pub.publisher)}</span>` : '';
  const date = pub.date
    ? `<span class="pub-row-date">${escapeHtml(formatTimelineDate(pub.date))}</span>`
    : '';
  const inner = `${thumb}<span class="pub-row-main"><span class="pub-row-title">${escapeHtml(
    pub.title,
  )}</span>${sub}</span>${date}`;
  return href
    ? `<a class="pub-row" href="${href}" rel="noopener" target="_blank">${inner}</a>`
    : `<div class="pub-row">${inner}</div>`;
}

/** A grouped Standard.site publication card: header + up to 3 rows, rest collapsed. */
function publicationGroupCard(group: PublicationGroup): string {
  const rows = group.articles.map(articleRow).filter((r) => r);
  const shown = rows.slice(0, 3).join('');
  const rest = rows.slice(3);
  const more = rest.length
    ? `<details class="pub-more"><summary>Show ${rest.length} more</summary>${rest.join('')}</details>`
    : '';
  const n = group.articles.length;
  const count = `<span class="pub-group-count">${n} article${n === 1 ? '' : 's'}</span>`;
  const cta = safeUrl(group.url ?? undefined)
    ? `<a class="pub-group-cta" href="${safeUrl(
        group.url ?? undefined,
      )}" rel="noopener" target="_blank">Read article</a>`
    : '';
  return (
    `<div class="pub-group"><div class="pub-group-head"><span class="pub-group-title">` +
    `<span class="pub-group-name">${escapeHtml(group.name)}</span> ${count}</span>${cta}</div>` +
    `<div class="pub-rows">${shown}${more}</div></div>`
  );
}

/** A non-Standard publication (Sifa/ORCID): title link, venue/type, contributors, DOI, date. */
function otherPublicationRow(pub: ProfilePublication): string {
  if (!pub.title) return '';
  const href = safeUrl(publicationHref(pub));
  const title = href
    ? `<a href="${href}" rel="noopener" target="_blank">${escapeHtml(pub.title)}</a>`
    : `<strong>${escapeHtml(pub.title)}</strong>`;
  const parts = [`<div class="pub-o-title">${title}</div>`];
  if (pub.subtitle) parts.push(`<div class="pub-o-subtitle">${escapeHtml(pub.subtitle)}</div>`);
  const metaBits = [pub.publisher, pub.typeLabel].filter(Boolean).map((t) => escapeHtml(t as string));
  if (metaBits.length) parts.push(`<div class="pub-o-meta">${metaBits.join(' · ')}</div>`);
  const contributors = (pub.contributors ?? [])
    .map((c) =>
      c.handle
        ? `<a href="https://sifa.id/p/${encodeURIComponent(c.handle)}" rel="noopener" target="_blank">${escapeHtml(
            c.name,
          )}</a>`
        : escapeHtml(c.name),
    )
    .filter((s) => s);
  if (contributors.length)
    parts.push(`<div class="pub-o-contrib">${contributors.join(', ')}</div>`);
  if (pub.doi)
    parts.push(
      `<a class="pub-o-doi" href="https://doi.org/${encodeURIComponent(
        pub.doi,
      )}" rel="noopener" target="_blank">doi.org/${escapeHtml(pub.doi)}</a>`,
    );
  const date = pub.date
    ? `<span class="pub-o-date">${escapeHtml(formatTimelineDate(pub.date))}</span>`
    : '';
  return `<div class="pub-o-row"><div class="pub-o-body">${parts.join('')}</div>${date}</div>`;
}

function renderPublications(profile: Profile): string {
  const items = sortPublications(visible(profile.publications)).filter((p) => p.title);
  const standard = items.filter((p) => p.source === 'standard');
  const other = items.filter((p) => p.source !== 'standard');
  if (!standard.length && !other.length) return '';

  const groups = groupStandardPublications(standard).map(publicationGroupCard).join('');
  if (!other.length) return groups;

  // A heading separates the two lists only when both are present.
  const otherHead = groups ? '<h3 class="pub-other-head">Other publications</h3>' : '';
  const otherRows = other.map(otherPublicationRow).filter((r) => r).join('');
  return `${groups}${otherHead}<div class="pub-o-list">${otherRows}</div>`;
}

function renderCredentials(profile: Profile): string {
  const items = sortCertifications(visible(profile.certifications));
  return list(
    items.map((c: ProfileCertification) => {
      if (!c.name) return '';
      const org = c.entityName ?? c.authority ?? c.issuingOrg;
      const issuer = org ? ` &mdash; ${escapeHtml(formatCompanyName(org))}` : '';
      const when = c.issueDate
        ? ` <span class="cv-when">(${escapeHtml(formatTimelineDate(c.issueDate))})</span>`
        : '';
      const name = safeUrl(c.credentialUrl)
        ? `<a href="${safeUrl(c.credentialUrl)}" rel="noopener" target="_blank">${escapeHtml(
            c.name,
          )}</a>`
        : `<strong>${escapeHtml(c.name)}</strong>`;
      return `<li class="cv-entry">${name}${issuer}${when}</li>`;
    }),
  );
}

function renderEducation(profile: Profile): string {
  const items = sortEducation(visible(profile.education));
  return list(
    items.map((e: ProfileEducation) => {
      const inst = formatCompanyName(e.entityName ?? e.institution);
      const degree = [e.degree, e.fieldOfStudy].filter(Boolean).join(', ');
      const head = `<strong>${escapeHtml(inst)}</strong>${
        degree ? ` &mdash; ${escapeHtml(degree)}` : ''
      }${whenSpan(formatDateRange(e.startedAt, e.endedAt))}`;
      const parts = [head];
      if (e.description) parts.push(`<div class="cv-desc">${renderMarkdown(e.description)}</div>`);
      if (e.activities)
        parts.push(
          `<div class="cv-meta">Activities &amp; Societies: ${escapeHtml(e.activities)}</div>`,
        );
      return `<li class="cv-entry">${parts.join('')}</li>`;
    }),
  );
}

function renderCourses(profile: Profile): string {
  const certByRkey = new Map((profile.certifications ?? []).map((c) => [c.rkey, c] as const));
  const certIssueDate = (rkey?: string): string | undefined =>
    rkey ? certByRkey.get(rkey)?.issueDate : undefined;
  const items = visible(profile.courses);
  const effectiveDate = (c: ProfileCourse): string | undefined =>
    c.completedAt || certIssueDate(c.credentialRkey);
  const dated = items.filter((c) => effectiveDate(c));
  const undated = items.filter((c) => !effectiveDate(c));
  dated.sort((a, b) => (effectiveDate(b) ?? '').localeCompare(effectiveDate(a) ?? ''));
  const ordered = [...dated, ...undated];
  return list(
    ordered.map((c) => {
      const inst = c.entityName ?? c.institution;
      const issuer = inst ? ` &mdash; ${escapeHtml(formatCompanyName(inst))}` : '';
      const when = c.completedAt
        ? ` <span class="cv-when">(${escapeHtml(formatTimelineDate(c.completedAt))})</span>`
        : '';
      const cert = c.credentialRkey ? certByRkey.get(c.credentialRkey) : undefined;
      const linked = cert
        ? `<div class="cv-meta">Linked credential: ${safeAnchor(cert.credentialUrl, cert.name)}</div>`
        : '';
      return `<li class="cv-entry"><strong>${escapeHtml(c.name ?? '')}</strong>${issuer}${when}${linked}</li>`;
    }),
  );
}

function renderAwards(profile: Profile): string {
  const items = sortHonors(visible(profile.honors));
  return list(
    items.map((h: ProfileHonor) => {
      if (!h.title) return '';
      const org = h.entityName ?? h.issuer;
      const issuer = org ? ` &mdash; ${escapeHtml(formatCompanyName(org))}` : '';
      const when = h.date
        ? ` <span class="cv-when">(${escapeHtml(formatTimelineDate(h.date))})</span>`
        : '';
      const desc = h.description ? `<div class="cv-desc">${renderMarkdown(h.description)}</div>` : '';
      return `<li class="cv-entry"><strong>${escapeHtml(h.title)}</strong>${issuer}${when}${desc}</li>`;
    }),
  );
}

function renderInvolvement(profile: Profile): string {
  const groups = groupInvolvementByHeading(visible(profile.involvement));
  return groups
    .map((g) => {
      const rows = g.items.map((item: ProfileInvolvement) => {
        const org = item.entityName ?? item.upstream;
        const title = formatCompanyName(org ?? '') || item.role || g.heading;
        const head = `<strong>${escapeHtml(title)}</strong>${whenSpan(
          formatDateRange(item.startedAt, item.endedAt),
        )}`;
        const parts = [head];
        const meta: string[] = [];
        const loc = formatLocation(item.location ?? null) || undefined;
        if (loc) meta.push(loc);
        if (item.role && org) meta.push(item.role);
        if (meta.length) parts.push(`<div class="cv-meta">${escapeHtml(meta.join(' · '))}</div>`);
        if (item.description)
          parts.push(`<div class="cv-desc">${renderMarkdown(item.description)}</div>`);
        const skills = (item.linkedSkills ?? []).map((s) => s.name).filter(Boolean);
        if (skills.length)
          parts.push(`<div class="cv-skills">Skills: ${escapeHtml(skills.join(', '))}</div>`);
        return `<li class="cv-entry">${parts.join('')}</li>`;
      });
      return `<h3>${escapeHtml(g.heading)}</h3>${list(rows)}`;
    })
    .join('');
}

function renderLanguages(profile: Profile): string {
  const items = sortLanguages(visible(profile.languages));
  return list(
    items.map((l: ProfileLanguage) => {
      if (!l.language) return '';
      const prof = l.proficiency
        ? ` <span class="cv-when">(${escapeHtml(PROFICIENCY_LABELS[l.proficiency] ?? l.proficiency)})</span>`
        : '';
      return `<li class="cv-entry">${escapeHtml(l.language)}${prof}</li>`;
    }),
  );
}

/**
 * One-line roll-up of a talk's deliveries, matching the Sifa profile's collapsed
 * view: "Delivered 9x · latest 2019 · 2 keynotes · Meet Magento NL, ... +2".
 * Cancelled occasions are excluded by the SDK summarizer. Already HTML-escaped.
 */
function deliverySummaryLine(deliveries: ProfilePresentationDelivery[]): string {
  const s = summarizePresentationDeliveries(deliveries);
  const venueText = s.venues.length
    ? s.venues.join(', ') + (s.moreVenues ? ` +${s.moreVenues}` : '')
    : undefined;
  const parts = [
    s.count > 0 ? (s.count === 1 ? 'Delivered once' : `Delivered ${s.count}x`) : undefined,
    s.recentYear ? `latest ${s.recentYear}` : undefined,
    s.keynoteCount
      ? `${s.keynoteCount} ${s.keynoteCount === 1 ? 'keynote' : 'keynotes'}`
      : undefined,
    venueText,
  ].filter(Boolean) as string[];
  return escapeHtml(parts.join(' · '));
}

function renderPresentations(profile: Profile): string {
  const talks = visible(profile.presentations);
  const allDeliveries = visible(profile.presentationDeliveries);
  if (!talks.length && !allDeliveries.length) return '';

  const deliveriesForTalk = (rkey: string): ProfilePresentationDelivery[] => {
    const seen = new Set<string>();
    const out: ProfilePresentationDelivery[] = [];
    const owned = talks.find((t) => t.rkey === rkey)?.deliveries ?? [];
    for (const d of [...owned, ...allDeliveries.filter((x) => x.presentationRkey === rkey)]) {
      if (seen.has(d.rkey)) continue;
      seen.add(d.rkey);
      out.push(d);
    }
    return out.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
  };
  const latestDate = (rkey: string): string =>
    deliveriesForTalk(rkey).reduce((max, d) => (d.date && d.date > max ? d.date : max), '');

  const sortedTalks = [...talks].sort((a, b) =>
    latestDate(b.rkey).localeCompare(latestDate(a.rkey)),
  );
  const talkRkeys = new Set(talks.map((t) => t.rkey));
  const standalone = allDeliveries
    .filter((d) => !d.presentationRkey || !talkRkeys.has(d.presentationRkey))
    .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));

  const deliveryLine = (d: ProfilePresentationDelivery): string => {
    const parts = [
      d.eventName,
      d.date ? formatTimelineDate(d.date) : undefined,
      d.location,
      d.role ? getPresentationRoleLabel(d.role) : undefined,
      d.mode ? getCalendarEventModeLabel(d.mode) : undefined,
    ].filter(Boolean) as string[];
    const coSpeakers = (d.coSpeakers ?? []).map((c) => c.handle).filter(Boolean);
    const line = escapeHtml(parts.join(' · '));
    return coSpeakers.length
      ? `<li>${line} <span class="cv-when">(with ${escapeHtml(coSpeakers.join(', '))})</span></li>`
      : `<li>${line}</li>`;
  };

  const blocks: string[] = [];
  for (const talk of sortedTalks) {
    blocks.push(renderTalk(profile, talk, deliveriesForTalk(talk.rkey), deliveryLine));
  }
  for (const d of standalone) {
    const title = d.title || d.eventName || 'Session';
    blocks.push(`<h3>${escapeHtml(title)}</h3><ul class="cv-list">${deliveryLine(d)}</ul>`);
  }
  return blocks.join('');
}

function renderTalk(
  profile: Profile,
  talk: ProfilePresentation,
  deliveries: ProfilePresentationDelivery[],
  deliveryLine: (d: ProfilePresentationDelivery) => string,
): string {
  const talkUrl = `https://sifa.id/p/${profile.handle}/talk/${talk.rkey}`;
  const heading = `<h3>${safeAnchor(talkUrl, talk.title)}</h3>`;
  const metaParts = [
    talk.duration ? formatPresentationDuration(talk.duration) : undefined,
    (talk.intendedAudiences ?? []).join(', ') || undefined,
  ].filter(Boolean) as string[];
  const parts = [heading];
  if (metaParts.length) parts.push(`<div class="cv-meta">${escapeHtml(metaParts.join(' · '))}</div>`);
  if (talk.description) parts.push(`<div class="cv-desc">${renderMarkdown(talk.description)}</div>`);
  if (deliveries.length)
    parts.push(
      `<details class="cv-deliveries"><summary class="cv-delivery-summary">${deliverySummaryLine(
        deliveries,
      )}</summary><ul class="cv-list">${deliveries.map(deliveryLine).join('')}</ul></details>`,
    );
  return parts.join('');
}

/** Rendered in the sidebar as links, never as a body section. */
function renderOtherProfiles(): string {
  return '';
}

const SECTION_RENDERERS: Record<SectionId, (profile: Profile) => string> = {
  about: renderAbout,
  career: renderCareer,
  skills: renderSkills,
  projects: renderProjects,
  presentations: renderPresentations,
  publications: renderPublications,
  credentials: renderCredentials,
  education: renderEducation,
  courses: renderCourses,
  awards: renderAwards,
  involvement: renderInvolvement,
  languages: renderLanguages,
  'other-profiles': renderOtherProfiles,
};

/**
 * Build every visible body section for a profile, in canonical SDK order, each
 * rendered to sanitized HTML. The `other-profiles` (Links) section is excluded
 * -- it renders in the sidebar. Always the public visitor view: owner-hidden
 * items are dropped so a public page can't leak them.
 *
 * The returned slugs match the previous Markdown-driven output byte-for-byte
 * (`sectionSlug(SECTION_LABELS[id])`, `about` -> `index`), so existing nav
 * anchors and static filenames are unchanged.
 */
export function buildProfileSections(profile: Profile): RenderedSection[] {
  const ctx: RenderCtx = { isOwnProfile: false };
  const out: RenderedSection[] = [];
  for (const id of getVisibleSectionIds(profile, ctx.isOwnProfile)) {
    if (id === 'other-profiles') continue;
    const html = SECTION_RENDERERS[id](profile);
    if (!html.trim()) continue;
    out.push({
      id,
      slug: id === 'about' ? 'index' : sectionSlug(SECTION_LABELS[id]),
      title: SECTION_LABELS[id],
      html,
    });
  }
  return out;
}
