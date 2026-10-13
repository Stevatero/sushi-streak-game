const { checkAudit, findAdvisories } = require('../audit');

const advisory = (name, severity, id) => ({
  name,
  severity,
  title: `Problema in ${name}`,
  url: `https://github.com/advisories/${id}`,
});

const report = {
  vulnerabilities: {
    braces: { via: [advisory('braces', 'high', 'GHSA-aaaa')] },
    micromatch: { via: ['braces'] },
    'sprintf-js': { via: [advisory('sprintf-js', 'moderate', 'GHSA-bbbb')] },
    'proxy-addr': { via: [advisory('proxy-addr', 'critical', 'GHSA-cccc')] },
  },
};

const allowlist = [{ id: 'GHSA-aaaa', package: 'braces', reason: 'solo build', reviewBy: '2027-01-15' }];

describe('controllo npm audit', () => {
  it('raccoglie gli avvisi distinti ignorando le dipendenze intermedie', () => {
    expect(findAdvisories(report).map((a) => a.id)).toEqual(['GHSA-aaaa', 'GHSA-bbbb', 'GHSA-cccc']);
  });

  it('blocca gli avvisi high/critical non ammessi e ignora quelli moderati', () => {
    const { problems, ignored } = checkAudit(report, allowlist, new Date('2026-10-13'));
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('proxy-addr');
    expect(ignored).toHaveLength(1);
    expect(ignored[0]).toContain('GHSA-aaaa');
  });

  it('un’eccezione scaduta torna a bloccare', () => {
    const { problems } = checkAudit(report, allowlist, new Date('2027-01-16T08:00:00Z'));
    expect(problems.some((p) => p.includes('eccezione scaduta') && p.includes('GHSA-aaaa'))).toBe(true);
  });
});
