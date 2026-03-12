const Anthropic = require('@anthropic-ai/sdk');
const config = require('../config');
const Briefing = require('../models/Briefing');
const logger = require('../utils/logger');

class BriefingChatService {
  static getClient() {
    if (!config.anthropicApiKey) {
      throw new Error('ANTHROPIC_API_KEY not configured');
    }
    return new Anthropic({ apiKey: config.anthropicApiKey });
  }

  static buildSystemPrompt(briefing) {
    return `You are a friendly recruitment assistant conducting a pre-interview briefing with a candidate. Your goal is to ensure the candidate fully understands the role before they proceed to a manager interview.

Role: ${briefing.requisition_title}

Description: ${briefing.requisition_description || 'Not provided'}

Field/Work Expectations: ${briefing.field_expectations || 'Not provided'}

Compensation Range: ${briefing.compensation_range || 'Not provided'}

Team Information: ${briefing.team_info || 'Not provided'}

Your instructions:
1. Welcome the candidate warmly and explain this is a brief conversation to make sure they have a clear picture of the role.
2. Walk them through the key aspects: what the job involves day-to-day, any field work or travel required, the team they'd be joining, and compensation expectations.
3. Ask them questions to confirm they understand and are comfortable with the requirements.
4. Be honest and transparent about challenges (e.g., "this role requires significant field time").
5. Answer their questions about the role openly.
6. Keep responses concise and conversational.
7. After covering all key points, let them know the briefing is wrapping up and they can mark it as complete.

Do NOT discuss other candidates, internal company politics, or make promises about selection.`;
  }

  static async chat(briefingId, candidateMessage) {
    const briefing = await Briefing.findById(briefingId);
    if (!briefing) throw new Error('Briefing not found');
    if (briefing.status === 'completed' || briefing.status === 'failed') {
      throw new Error('Briefing already concluded');
    }

    await Briefing.appendMessage(briefingId, 'user', candidateMessage);

    const client = this.getClient();
    const systemPrompt = this.buildSystemPrompt(briefing);

    const messages = [
      ...(briefing.transcript || []).map(m => ({ role: m.role, content: m.content })),
      { role: 'user', content: candidateMessage }
    ];

    try {
      const response = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        system: systemPrompt,
        messages,
      });

      const assistantMessage = response.content[0].text;
      await Briefing.appendMessage(briefingId, 'assistant', assistantMessage);

      return assistantMessage;
    } catch (err) {
      logger.error('Briefing chat LLM error:', err.message);
      throw new Error('Failed to get AI response. Please try again.');
    }
  }

  static async evaluate(briefingId) {
    const briefing = await Briefing.findById(briefingId);
    if (!briefing) throw new Error('Briefing not found');

    const transcript = briefing.transcript || [];
    if (transcript.length < 2) {
      const result = await Briefing.complete(briefingId, {
        summary: 'Briefing incomplete - insufficient conversation.',
        passed: false,
      });
      return result;
    }

    try {
      const client = this.getClient();
      const evalPrompt = `Review this pre-interview briefing transcript between a recruitment assistant and a candidate for the role "${briefing.requisition_title}".

Transcript:
${transcript.map(m => `${m.role}: ${m.content}`).join('\n\n')}

Evaluate whether the candidate demonstrates:
1. Understanding of the role's core responsibilities
2. Awareness of field/work expectations and logistics
3. Comfort with compensation range (if discussed)
4. Genuine interest and realistic expectations

Respond with a JSON object:
{"passed": true/false, "summary": "2-3 sentence assessment"}`;

      const response = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        messages: [{ role: 'user', content: evalPrompt }],
      });

      const text = response.content[0].text;
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      const evaluation = jsonMatch ? JSON.parse(jsonMatch[0]) : { passed: true, summary: text };

      const result = await Briefing.complete(briefingId, evaluation);
      return result;
    } catch (err) {
      logger.error('Briefing evaluation error:', err.message);
      // Default to pass if LLM fails
      const result = await Briefing.complete(briefingId, {
        summary: 'Evaluation unavailable - defaulting to pass.',
        passed: true,
      });
      return result;
    }
  }
}

module.exports = BriefingChatService;
