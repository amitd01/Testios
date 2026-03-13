const config = require('../config');
const logger = require('../utils/logger');

const KEYWORDS = {
  role_relevance: {
    sales: ['sales', 'selling', 'revenue', 'quota', 'pipeline', 'deals', 'closing', 'prospecting', 'account', 'territory'],
    engineering: ['engineer', 'coding', 'architecture', 'system design', 'backend', 'frontend', 'devops', 'infrastructure'],
    product: ['product', 'roadmap', 'stakeholder', 'user research', 'feature', 'specification', 'prioritization'],
    marketing: ['marketing', 'brand', 'campaign', 'content', 'seo', 'growth', 'acquisition', 'funnel'],
    operations: ['operations', 'process', 'supply chain', 'logistics', 'efficiency', 'workflow', 'automation'],
    leadership: ['leadership', 'strategy', 'executive', 'board', 'p&l', 'transformation', 'vision'],
    finance: ['finance', 'accounting', 'audit', 'compliance', 'budget', 'forecasting', 'financial'],
    hr: ['hr', 'talent', 'culture', 'compensation', 'benefits', 'employee', 'recruitment'],
  },
  experience_depth: ['years', 'year', 'senior', 'lead', 'head', 'director', 'manager', 'expert', 'deep', 'extensive', 'track record'],
  location_fit: ['mumbai', 'pune', 'delhi', 'bangalore', 'hyderabad', 'chennai', 'kolkata', 'india', 'maharashtra', 'gujarat', 'remote', 'onsite', 'on-site', 'relocat'],
  compensation_alignment: ['lpa', 'lakhs', 'salary', 'compensation', 'ctc', 'package', 'variable', 'bonus'],
  culture_signals: ['travel', 'autonomous', 'autonomy', 'initiative', 'passionate', 'motivated', 'flexible', 'adaptable', 'team', 'collaborative', 'driven', 'eager', 'excited', 'enthusiastic'],
};

class TriageService {
  /**
   * Score a CV submission against a requisition.
   * Uses rule-based scoring by default, LLM scoring when API key is available.
   */
  static async score(submission, requisition) {
    if (config.anthropicApiKey) {
      try {
        return await this.scoreLLM(submission, requisition);
      } catch (err) {
        logger.error('LLM scoring failed, falling back to rule-based:', err.message);
      }
    }
    return this.scoreMock(submission, requisition);
  }

  /**
   * Rule-based mock scoring — scans text for keyword overlap.
   */
  static scoreMock(submission, requisition) {
    const candidateText = [
      submission.consultant_rationale || '',
      submission.candidate_name || '',
    ].join(' ').toLowerCase();

    const reqText = [
      requisition.title || '',
      requisition.description || '',
      requisition.field_expectations || '',
      requisition.compensation_range || '',
      requisition.team_info || '',
    ].join(' ').toLowerCase();

    // 1. Role relevance (0-20): keyword match between rationale and JD
    const roleRelevance = this._scoreKeywordOverlap(candidateText, reqText, 'role_relevance', 20);

    // 2. Experience depth (0-20): years + seniority signals
    const experienceDepth = this._scoreDimension(candidateText, KEYWORDS.experience_depth, 20);

    // 3. Location fit (0-20): geography alignment
    const locationFit = this._scoreLocationFit(candidateText, reqText, 20);

    // 4. Compensation alignment (0-20): comp signals + no red flags
    const compensationAlignment = this._scoreCompensation(candidateText, reqText, 20);

    // 5. Culture signals (0-20): motivation, travel willingness, autonomy
    const cultureSignals = this._scoreDimension(candidateText, KEYWORDS.culture_signals, 20);

    const dimensions = {
      role_relevance: roleRelevance,
      experience_depth: experienceDepth,
      location_fit: locationFit,
      compensation_alignment: compensationAlignment,
      culture_signals: cultureSignals,
    };

    const fit_score = Object.values(dimensions).reduce((a, b) => a + b, 0);

    const strengths = [];
    const concerns = [];
    for (const [dim, score] of Object.entries(dimensions)) {
      if (score >= 14) strengths.push(dim.replace(/_/g, ' '));
      else if (score < 8) concerns.push(dim.replace(/_/g, ' '));
    }

    const summary = this._buildSummary(fit_score, strengths, concerns);

    return { fit_score, dimensions, summary, method: 'rule-based' };
  }

  /**
   * LLM-based scoring using Claude Haiku.
   */
  static async scoreLLM(submission, requisition) {
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: config.anthropicApiKey });

    const prompt = `You are an expert hiring screener. Score this candidate against the job description.

JOB:
Title: ${requisition.title}
Description: ${requisition.description || 'N/A'}
Field Expectations: ${requisition.field_expectations || 'N/A'}
Compensation: ${requisition.compensation_range || 'N/A'}
Team: ${requisition.team_info || 'N/A'}

CANDIDATE:
Name: ${submission.candidate_name || 'Unknown'}
Consultant Rationale: ${submission.consultant_rationale || 'N/A'}

Score the candidate on these 5 dimensions (each 0-20, total 0-100):
1. role_relevance — How well does their experience match the job function?
2. experience_depth — Do they have sufficient years and depth of experience?
3. location_fit — Are they geographically aligned with the role requirements?
4. compensation_alignment — Do their comp expectations fit the budget?
5. culture_signals — Do they show motivation, travel willingness, cultural fit?

Respond with ONLY a JSON object:
{"fit_score": <0-100>, "dimensions": {"role_relevance": <0-20>, "experience_depth": <0-20>, "location_fit": <0-20>, "compensation_alignment": <0-20>, "culture_signals": <0-20>}, "summary": "<2-3 sentence assessment>"}`;

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content[0].text;
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('LLM returned non-JSON response');

    const result = JSON.parse(jsonMatch[0]);
    result.method = 'llm';
    return result;
  }

  // --- Private helpers ---

  static _scoreKeywordOverlap(candidateText, reqText, dimensionKey, maxScore) {
    // Find which role category the req text best matches
    let bestCategory = null;
    let bestCount = 0;
    for (const [category, keywords] of Object.entries(KEYWORDS[dimensionKey])) {
      const count = keywords.filter(k => reqText.includes(k)).length;
      if (count > bestCount) { bestCount = count; bestCategory = category; }
    }

    if (!bestCategory) return Math.round(maxScore * 0.5); // neutral if no match

    const roleKeywords = KEYWORDS[dimensionKey][bestCategory];
    const matches = roleKeywords.filter(k => candidateText.includes(k)).length;
    const ratio = matches / roleKeywords.length;
    return Math.min(maxScore, Math.round(ratio * maxScore * 1.5)); // slight boost
  }

  static _scoreDimension(text, keywords, maxScore) {
    const matches = keywords.filter(k => text.includes(k)).length;
    const ratio = matches / keywords.length;
    return Math.min(maxScore, Math.round(ratio * maxScore * 2)); // generous scaling
  }

  static _scoreLocationFit(candidateText, reqText, maxScore) {
    const locKeywords = KEYWORDS.location_fit;
    const reqLocations = locKeywords.filter(k => reqText.includes(k));
    if (reqLocations.length === 0) return Math.round(maxScore * 0.7); // no location requirement = decent score

    const matches = reqLocations.filter(k => candidateText.includes(k)).length;
    const ratio = matches / reqLocations.length;
    return Math.min(maxScore, Math.round(ratio * maxScore * 1.5 + maxScore * 0.3)); // base + overlap
  }

  static _scoreCompensation(candidateText, reqText, maxScore) {
    // Check for comp red flags
    const hasCompMismatch = candidateText.includes('exceed') ||
      candidateText.includes('unrealistic') ||
      candidateText.includes('above budget') ||
      (candidateText.includes('30') && candidateText.includes('lpa'));

    if (hasCompMismatch) return Math.round(maxScore * 0.2);

    // Check for positive comp signals
    const hasCompAlignment = candidateText.includes('works for') ||
      candidateText.includes('comfortable') ||
      candidateText.includes('within range') ||
      candidateText.includes('acceptable');

    if (hasCompAlignment) return maxScore;

    // Neutral — no strong signals
    return Math.round(maxScore * 0.6);
  }

  static _buildSummary(score, strengths, concerns) {
    let summary;
    if (score >= 75) {
      summary = `Strong match (${score}/100).`;
    } else if (score >= 50) {
      summary = `Moderate match (${score}/100).`;
    } else {
      summary = `Weak match (${score}/100).`;
    }

    if (strengths.length > 0) summary += ` Strengths: ${strengths.join(', ')}.`;
    if (concerns.length > 0) summary += ` Concerns: ${concerns.join(', ')}.`;
    return summary;
  }
}

module.exports = TriageService;
