import catalog from '../generated/platformExternalProviders.json';

type PathMatchType = 'exact' | 'prefix' | 'segment_template';
type QueryRequirement = 'present' | `exact:${string}`;

type CatalogMatchRule = {
  hosts: string[];
  allow_subdomains: boolean;
  path_match_type: PathMatchType;
  path_patterns: string[];
  query_requirements?: Record<string, QueryRequirement>;
  aliases?: string[];
};

type CatalogProvider = {
  id: string;
  family: string;
  status: 'supported_embed' | 'supported_preview_only' | 'recognized_but_disabled';
  fallback_behavior: 'none' | 'treat_as_plain_link' | 'render_no_media' | 'provider_preview_only';
  priority: number;
  render_kind: 'iframe' | 'direct_video' | 'direct_image' | 'link_preview_only';
  allow_title_outbound_link: boolean;
  embed_builder_key: string | null;
  match_rules: CatalogMatchRule[];
};

type ProviderCatalog = {
  schema_version: number;
  providers: CatalogProvider[];
};

export type PlatformExternalProviderMatch = {
  id: string;
  family: string;
  status: CatalogProvider['status'];
  fallbackBehavior: CatalogProvider['fallback_behavior'];
  priority: number;
  renderKind: CatalogProvider['render_kind'];
  allowTitleOutboundLink: boolean;
  embedBuilderKey: string | null;
};

type MatchCandidate = {
  provider: CatalogProvider;
  providerIndex: number;
  hostSpecificity: number;
  pathSpecificity: number;
  wildcardCount: number;
};

const providerCatalog = catalog as ProviderCatalog;

function normalizeHost(hostname: string): string {
  let normalized = hostname.toLowerCase().trim().replace(/\.$/, '');
  if (normalized.startsWith('www.')) {
    normalized = normalized.slice(4);
  }
  return normalized;
}

function normalizePathname(pathname: string): string {
  const decoded = (() => {
    try {
      return decodeURI(pathname);
    } catch {
      return pathname;
    }
  })();

  const collapsed = decoded.replace(/\/{2,}/g, '/');
  if (collapsed === '' || collapsed === '/') {
    return '/';
  }
  return collapsed.endsWith('/') ? collapsed.slice(0, -1) : collapsed;
}

function normalizeTemplate(pattern: string): string[] {
  return normalizePathname(pattern).split('/').filter(Boolean);
}

function matchHost(host: string, rule: CatalogMatchRule): number | null {
  const candidates = [...rule.hosts, ...(rule.aliases ?? [])].map(normalizeHost);
  for (const candidate of candidates) {
    if (host === candidate) {
      return 2;
    }
    if (rule.allow_subdomains && host.endsWith(`.${candidate}`)) {
      return 1;
    }
  }
  return null;
}

function matchSegmentTemplate(path: string, pattern: string): { wildcardCount: number } | null {
  const actualSegments = normalizePathname(path).split('/').filter(Boolean);
  const patternSegments = normalizeTemplate(pattern);
  let wildcardCount = 0;
  let actualIndex = 0;

  for (let patternIndex = 0; patternIndex < patternSegments.length; patternIndex += 1) {
    const token = patternSegments[patternIndex];
    if (token === '**') {
      wildcardCount += 1;
      return { wildcardCount };
    }

    const actual = actualSegments[actualIndex];
    if (!actual) {
      return null;
    }

    if (token === '*') {
      wildcardCount += 1;
      actualIndex += 1;
      continue;
    }

    if (token !== actual) {
      return null;
    }

    actualIndex += 1;
  }

  if (actualIndex !== actualSegments.length) {
    return null;
  }

  return { wildcardCount };
}

function matchPath(path: string, rule: CatalogMatchRule): { pathSpecificity: number; wildcardCount: number } | null {
  const normalizedPath = normalizePathname(path);
  let best: { pathSpecificity: number; wildcardCount: number } | null = null;

  for (const pattern of rule.path_patterns) {
    const normalizedPattern = normalizePathname(pattern);
    if (rule.path_match_type === 'exact') {
      if (normalizedPath === normalizedPattern) {
        const candidate = { pathSpecificity: 3, wildcardCount: 0 };
        if (!best || candidate.pathSpecificity > best.pathSpecificity) {
          best = candidate;
        }
      }
      continue;
    }

    if (rule.path_match_type === 'prefix') {
      if (normalizedPath === normalizedPattern || normalizedPath.startsWith(normalizedPattern)) {
        const candidate = { pathSpecificity: 1, wildcardCount: 0 };
        if (!best || candidate.pathSpecificity > best.pathSpecificity) {
          best = candidate;
        }
      }
      continue;
    }

    const segmentMatch = matchSegmentTemplate(normalizedPath, pattern);
    if (segmentMatch) {
      const candidate = { pathSpecificity: 2, wildcardCount: segmentMatch.wildcardCount };
      if (
        !best ||
        candidate.pathSpecificity > best.pathSpecificity ||
        (candidate.pathSpecificity === best.pathSpecificity && candidate.wildcardCount < best.wildcardCount)
      ) {
        best = candidate;
      }
    }
  }

  return best;
}

function matchesQuery(searchParams: URLSearchParams, requirements: CatalogMatchRule['query_requirements']): boolean {
  if (!requirements) {
    return true;
  }

  return Object.entries(requirements).every(([key, requirement]) => {
    if (requirement === 'present') {
      return searchParams.has(key);
    }

    const exactValue = requirement.slice('exact:'.length);
    return searchParams.getAll(key).some((value) => value === exactValue);
  });
}

function compareCandidates(left: MatchCandidate, right: MatchCandidate): number {
  if (left.hostSpecificity !== right.hostSpecificity) {
    return right.hostSpecificity - left.hostSpecificity;
  }
  if (left.pathSpecificity !== right.pathSpecificity) {
    return right.pathSpecificity - left.pathSpecificity;
  }
  if (left.wildcardCount !== right.wildcardCount) {
    return left.wildcardCount - right.wildcardCount;
  }
  if (left.provider.priority !== right.provider.priority) {
    return right.provider.priority - left.provider.priority;
  }
  return left.providerIndex - right.providerIndex;
}

export function classifyPlatformExternalUrl(rawUrl: string): PlatformExternalProviderMatch | null {
  let target: URL;
  try {
    target = new URL(rawUrl);
  } catch {
    return null;
  }

  const host = normalizeHost(target.hostname);
  const path = normalizePathname(target.pathname);
  const candidates: MatchCandidate[] = [];

  providerCatalog.providers.forEach((provider, providerIndex) => {
    provider.match_rules.forEach((rule) => {
      const hostSpecificity = matchHost(host, rule);
      if (hostSpecificity === null) {
        return;
      }

      const pathMatch = matchPath(path, rule);
      if (!pathMatch || !matchesQuery(target.searchParams, rule.query_requirements)) {
        return;
      }

      candidates.push({
        provider,
        providerIndex,
        hostSpecificity,
        pathSpecificity: pathMatch.pathSpecificity,
        wildcardCount: pathMatch.wildcardCount,
      });
    });
  });

  candidates.sort(compareCandidates);
  const match = candidates[0]?.provider;
  if (!match) {
    return null;
  }

  return {
    id: match.id,
    family: match.family,
    status: match.status,
    fallbackBehavior: match.fallback_behavior,
    priority: match.priority,
    renderKind: match.render_kind,
    allowTitleOutboundLink: match.allow_title_outbound_link,
    embedBuilderKey: match.embed_builder_key,
  };
}
