import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

export async function POST(request: NextRequest) {
  try {
    const { category, description, questions, answers } = await request.json();

    if (!category || !description || !questions || !answers) {
      return NextResponse.json(
        { error: 'Category, description, questions, and answers required' },
        { status: 400 }
      );
    }

    if (questions.length !== answers.length) {
      return NextResponse.json(
        { error: 'Questions and answers must match in length' },
        { status: 400 }
      );
    }

    // Build Q&A pairs for the prompt
    const qaText = questions
      .map((q: string, i: number) => `Q${i + 1}: ${q}\nA${i + 1}: ${answers[i]}`)
      .join('\n\n');

    const prompt = `You are an expert home maintenance advisor. Based on the tenant's responses, provide a practical diagnosis and guidance.

Issue Category: ${category}
Initial Description: "${description}"

Tenant's Answers:
${qaText}

Based on these answers, provide:
1. A recommendation: one of 'diy', 'maybe_diy', or 'professional_needed'
2. Clear, step-by-step guidance

Recommendation meanings:
- 'diy': This is almost certainly safe for the tenant to fix themselves. Provide clear, safe DIY instructions.
- 'maybe_diy': The tenant could try a fix first, but if it doesn't work, they'll need a professional. Provide cautious DIY steps with clear "stop and call professional if..." points.
- 'professional_needed': This needs a licensed professional. Explain why and what to expect.

Respond ONLY with valid JSON (no markdown, no extra text):
{
  "recommendation": "diy" | "maybe_diy" | "professional_needed",
  "guidance": "Multi-line step-by-step guidance or explanation. Use \\n for line breaks."
}`;

    const response = await client.messages.create({
      model: 'claude-opus-5',
      max_tokens: 1000,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type');
    }

    // Parse the JSON response
    const diagnosis = JSON.parse(content.text);

    if (!diagnosis.recommendation || !diagnosis.guidance) {
      throw new Error('Invalid diagnosis format');
    }

    // Validate recommendation value
    if (!['diy', 'maybe_diy', 'professional_needed'].includes(diagnosis.recommendation)) {
      throw new Error('Invalid recommendation value');
    }

    return NextResponse.json(diagnosis);
  } catch (error) {
    console.error('Error generating diagnosis:', error);
    return NextResponse.json(
      { error: 'Failed to generate diagnosis' },
      { status: 500 }
    );
  }
}
