import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

export async function POST(request: NextRequest) {
  try {
    const { category, description } = await request.json();

    if (!category || !description) {
      return NextResponse.json(
        { error: 'Category and description required' },
        { status: 400 }
      );
    }

    const prompt = `You are a helpful home maintenance advisor helping a tenant diagnose an issue.

Category: ${category}
Tenant's description: "${description}"

Based on this ${category} issue, generate exactly 3-4 diagnostic questions that would help determine:
1. The severity of the problem
2. Whether this is something they can safely fix themselves
3. Whether this needs a professional

Questions should be:
- Simple and easy to answer (yes/no, multiple choice, or short answer)
- Focused on observable facts (what they can see/hear/feel)
- Non-technical (use plain language, no jargon)
- Help narrow down the root cause

Return ONLY the questions as a JSON array of strings, nothing else. Example format:
["Question 1?", "Question 2?", "Question 3?"]`;

    const response = await client.messages.create({
      model: 'claude-opus-5',
      max_tokens: 500,
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

    // Parse the JSON array from the response
    const questions = JSON.parse(content.text);

    if (!Array.isArray(questions) || questions.length === 0) {
      throw new Error('Invalid questions format');
    }

    return NextResponse.json({ questions });
  } catch (error) {
    console.error('Error generating diagnostic questions:', error);
    return NextResponse.json(
      { error: 'Failed to generate questions' },
      { status: 500 }
    );
  }
}
