import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not set. Please check your .env.local file.');
  }
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
}

const CHAT_MODEL = process.env.CHAT_MODEL || 'gpt-3.5-turbo';

// Helper function to calculate similarity between two strings
function calculateSimilarity(str1: string, str2: string): number {
  const words1 = str1.split(/\s+/);
  const words2 = str2.split(/\s+/);
  const allWords = new Set([...words1, ...words2]);
  
  let commonWords = 0;
  for (const word of allWords) {
    if (words1.includes(word) && words2.includes(word)) {
      commonWords++;
    }
  }
  
  return commonWords / allWords.size;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userQuestion, conversationHistory, recommendations, summary } = body;

    if (!userQuestion || typeof userQuestion !== 'string') {
      return NextResponse.json(
        { error: 'User question is required' },
        { status: 400 }
      );
    }

    // Validate OpenAI API key
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: 'OpenAI API key not configured' },
        { status: 500 }
      );
    }

    const openai = getOpenAIClient();

    // Build context from conversation history if provided
    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      {
        role: 'system',
        content: `You are a credit card recommendation assistant. Based on the user's question, conversation history, and the recommendations they just received, generate 4 DISTINCT and DIVERSE questions that the USER would ask the chatbot next.

CRITICAL REQUIREMENTS:
1. ALL questions must be formatted as questions the USER would ask the chatbot. They should be phrased as if the user is speaking to the chatbot.
2. PRIORITY: The FIRST 2-3 questions MUST be directly related to the user's most recent question and/or the recommendations they just received. These should be follow-up questions that explore:
   - More details about the recommended cards
   - Alternative options similar to what was recommended
   - Related features or benefits mentioned in the recommendations
   - Comparisons or clarifications about the recommended cards
3. The remaining questions (3rd-4th) should explore DIFFERENT aspects/topics that are still relevant but more diverse:
   - Different spending categories (travel, groceries, gas, dining, etc.)
   - Different card features (rewards, fees, benefits, insurance, etc.)
   - Different use cases (everyday spending, travel, business, building credit, etc.)
   - Different card types (cash back, points, travel, premium, starter, etc.)
4. EACH question must be DISTINCT - avoid similar or overlapping questions

Return JSON with this exact format:
{
  "suggestions": [
    "Question 1 (related to recent query/results)",
    "Question 2 (related to recent query/results)",
    "Question 3 (related to recent query/results OR diverse)",
    "Question 4 (diverse, different topic)"
  ]
}

EXAMPLES:
If user asked about travel cards and got recommendations:
- "Which of these cards has the best travel insurance?" (related to results)
- "Are there any travel cards with no foreign transaction fees?" (related to query)
- "What other travel benefits do these cards offer?" (related to results)
- "Show me cards with the best cash back for groceries" (diverse - different category)

BAD EXAMPLES (too similar - DO NOT USE):
- "What cards offer cash back for groceries?"
- "What cards offer cash back for gas?" (too similar to above)
- "Show me cards with cash back" (too similar)

INCORRECT Examples (questions for the user - DO NOT USE):
- "What is your budget?"
- "Do you travel often?"
- "How much do you spend monthly?"
- "What are your spending habits?"
- "Are you looking for cash back or points?"

Guidelines:
- Generate exactly 4 questions
- FIRST 2-3 questions MUST relate to the recent query and/or recommendations
- Remaining questions should be diverse and cover different topics
- ALL questions must be what the USER would ask the chatbot
- Start with question words (What, Which, Show me, I need, etc.)
- Keep questions concise (under 15 words each)
- Make them natural and conversational
- Ensure maximum diversity - avoid questions that are just slight variations of each other`,
      },
    ];

    // Add conversation history if provided
    if (conversationHistory && Array.isArray(conversationHistory) && conversationHistory.length > 0) {
      const recentHistory = conversationHistory.slice(-4); // Last 4 messages for context
      recentHistory.forEach((msg: { role: string; content: string }) => {
        messages.push({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
        });
      });
    }

    // Build context about recommendations if available
    let recommendationsContext = '';
    if (recommendations && Array.isArray(recommendations) && recommendations.length > 0) {
      const cardNames = recommendations.map((rec: any) => rec.credit_card_name || '').filter(Boolean);
      const reasons = recommendations.map((rec: any) => rec.reason || '').filter(Boolean);
      recommendationsContext = `\n\nRecommended cards: ${cardNames.join(', ')}\nReasons: ${reasons.join('; ')}`;
    }
    
    if (summary) {
      recommendationsContext += `\nSummary of recommendations: ${summary.substring(0, 200)}`;
    }

    messages.push({
      role: 'user',
      content: `User's question: "${userQuestion}"${recommendationsContext}\n\nGenerate exactly 4 DISTINCT questions that the USER would ask the chatbot next. 

CRITICAL: The FIRST 2-3 questions MUST be directly related to the user's question above and/or the recommended cards. These should be follow-up questions exploring more details, alternatives, or related features.

The remaining questions should be diverse and cover different topics (different spending categories, features, use cases, or card types).

Avoid similar or overlapping questions. These must be questions the user would type, NOT questions for the user. Return JSON.`,
    });

    const completion = await openai.chat.completions.create({
      model: CHAT_MODEL,
      messages: messages,
      temperature: 0.8, // Slightly higher temperature for more diversity
      max_tokens: 200, // Increased to allow for 4 distinct questions
      response_format: { type: 'json_object' },
    });

    const responseText = completion.choices[0]?.message?.content || '{}';
    const parsed = JSON.parse(responseText);
    const suggestions = parsed.suggestions || [];

    // Ensure we have 4 distinct suggestions
    const validSuggestions = suggestions
      .filter((s: any) => typeof s === 'string' && s.trim().length > 0)
      .slice(0, 4);

    // Remove duplicates and very similar suggestions
    const distinctSuggestions: string[] = [];
    for (const suggestion of validSuggestions) {
      const isDuplicate = distinctSuggestions.some(existing => {
        const similarity = calculateSimilarity(existing.toLowerCase(), suggestion.toLowerCase());
        return similarity > 0.7; // If more than 70% similar, consider it a duplicate
      });
      if (!isDuplicate) {
        distinctSuggestions.push(suggestion);
      }
    }

    // If we don't have enough distinct suggestions, add fallback ones
    if (distinctSuggestions.length < 4) {
      const fallbacks = [
        'What cards offer the best cash back rewards?',
        'Show me cards with no annual fee',
        'Which cards have the best travel benefits?',
        'What are the best cards for everyday spending?',
      ];
      
      for (const fallback of fallbacks) {
        if (distinctSuggestions.length >= 4) break;
        const isDuplicate = distinctSuggestions.some(existing => {
          const similarity = calculateSimilarity(existing.toLowerCase(), fallback.toLowerCase());
          return similarity > 0.7;
        });
        if (!isDuplicate) {
          distinctSuggestions.push(fallback);
        }
      }
    }

    // Return exactly 4 suggestions
    return NextResponse.json({ suggestions: distinctSuggestions.slice(0, 4) });
  } catch (error) {
    console.error('Error generating suggestions:', error);
    return NextResponse.json(
      { error: 'Failed to generate suggestions', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

