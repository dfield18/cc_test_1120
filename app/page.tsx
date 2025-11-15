'use client';

import { useState, useRef, useEffect } from 'react';
import { Recommendation } from '@/types';
import SwipeToLoad from '@/components/SwipeToLoad';
import ReactMarkdown from 'react-markdown';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  recommendations?: Recommendation[];
  summary?: string; // Summary with card links for user messages
}

const SUGGESTED_QUESTIONS = [
  { text: 'Best Card for Travel', icon: '✈️' },
  { text: 'Groceries & Gas Rewards', icon: '🛒' },
  { text: 'No Annual Fee Cards', icon: '💳' },
  { text: 'Premium Travel Cards', icon: '✨' },
];

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isRightBoxUpdating, setIsRightBoxUpdating] = useState(false);
  const [recommendationTitle, setRecommendationTitle] = useState('AI Recommendations');
  const [dynamicSuggestions, setDynamicSuggestions] = useState<string[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const assistantContainerRef = useRef<HTMLDivElement>(null);
  
  // Track when recommendations change to trigger animation
  const prevRecommendationsRef = useRef<Recommendation[]>([]);
  // Track if user has manually scrolled the left box
  const userHasScrolledLeftRef = useRef(false);
  // Track previous message count to detect new questions
  const prevMessageCountRef = useRef(0);
  
  // Track manual scrolling in left box
  useEffect(() => {
    const leftBox = chatContainerRef.current;
    if (!leftBox) return;

    const handleScroll = () => {
      // If user scrolls down (not at top), mark as manually scrolled
      if (leftBox.scrollTop > 10) {
        userHasScrolledLeftRef.current = true;
      }
    };

    leftBox.addEventListener('scroll', handleScroll);
    return () => leftBox.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    // Find the most recent assistant message with recommendations
    const mostRecentAssistantMessage = [...messages]
      .reverse()
      .find((msg) => msg.role === 'assistant' && msg.recommendations && msg.recommendations.length > 0);
    
    const currentRecommendations = mostRecentAssistantMessage?.recommendations || [];
    
    // Check if recommendations have changed
    const hasChanged = JSON.stringify(currentRecommendations) !== JSON.stringify(prevRecommendationsRef.current);
    
    // Check if a new question was asked (message count increased and last message is user)
    const currentMessageCount = messages.length;
    const lastMessage = messages[messages.length - 1];
    const isNewQuestion = currentMessageCount > prevMessageCountRef.current && lastMessage && lastMessage.role === 'user';
    
    if (isNewQuestion) {
      // Reset right box to top when new question is asked
      if (assistantContainerRef.current) {
        assistantContainerRef.current.scrollTop = 0;
      }
      // Reset left box scroll tracking - allow auto-scroll
      userHasScrolledLeftRef.current = false;
      // Note: Left box scrolling is handled in the separate useEffect below
      prevMessageCountRef.current = currentMessageCount;
    }
    
    if (hasChanged && currentRecommendations.length > 0) {
      setIsRightBoxUpdating(true);
      // Scroll to top of right box when new recommendations arrive
      if (assistantContainerRef.current) {
        assistantContainerRef.current.scrollTop = 0;
      }
      // Reset after animation completes (2000ms - 2 seconds)
      setTimeout(() => {
        setIsRightBoxUpdating(false);
      }, 2000);
      prevRecommendationsRef.current = currentRecommendations;
    } else if (currentRecommendations.length === 0) {
      prevRecommendationsRef.current = [];
    }
  }, [messages]);

  useEffect(() => {
    // After a response is received (when we have both user question and assistant response),
    // scroll the left box to show the most recent question at the top
    if (messages.length > 0 && chatContainerRef.current) {
      // Check if we have at least one user message and one assistant response
      const hasUserMessage = messages.some((msg) => msg.role === 'user');
      const hasAssistantResponse = messages.some((msg) => msg.role === 'assistant' || (msg.role === 'user' && msg.summary));
      
      // Only scroll after we have a response (not just when question is asked)
      if (hasUserMessage && hasAssistantResponse && !isLoading) {
        // Find the last user message index
        const userMessages = messages.filter((msg) => msg.role === 'user');
        const lastUserMessageIndex = userMessages.length - 1;
        
        // Small delay to ensure DOM is updated
        setTimeout(() => {
          if (chatContainerRef.current) {
            // Get all user message elements within the left box
            const messageElements = chatContainerRef.current.querySelectorAll('[data-message-index]');
            if (messageElements.length > 0 && lastUserMessageIndex >= 0) {
              // Find the element for the most recent user message
              const lastMessageElement = Array.from(messageElements).find((el) => {
                const index = parseInt(el.getAttribute('data-message-index') || '-1');
                return index === lastUserMessageIndex;
              });
              
              if (lastMessageElement) {
                // Calculate the position relative to the scrollable container
                const container = chatContainerRef.current;
                const element = lastMessageElement as HTMLElement;
                
                // Get the element's position relative to the container
                const elementRect = element.getBoundingClientRect();
                const containerRect = container.getBoundingClientRect();
                
                // Calculate scroll position: current scroll + (element position relative to container viewport)
                const scrollPosition = container.scrollTop + (elementRect.top - containerRect.top);
                
                // Scroll only the left box container, not the page
                container.scrollTo({
                  top: scrollPosition,
                  behavior: 'smooth'
                });
              }
            }
          }
        }, 200);
      }
    }
  }, [messages, isLoading]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput('');
    setIsLoading(true);

    // Add user message
    const newMessages: Message[] = [
      ...messages,
      { role: 'user', content: userMessage },
    ];
    setMessages(newMessages);

    try {
      // Prepare conversation history (exclude recommendations from assistant messages)
      const conversationHistory = newMessages
        .filter((msg) => msg.role === 'user' || msg.role === 'assistant')
        .map((msg) => ({
          role: msg.role,
          content: msg.content,
        }));

      const response = await fetch('/api/recommendations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          message: userMessage,
          conversationHistory: conversationHistory,
        }),
      });

      const data = await response.json();
      
      // Check if the response contains an error
      if (!response.ok || data.error) {
        const errorMessage = data.error || 'Failed to get recommendations';
        const errorDetails = data.details ? `\n\nDetails: ${data.details}` : '';
        throw new Error(`${errorMessage}${errorDetails}`);
      }
      
      console.log('API Response data:', { 
        hasRecommendations: !!data.recommendations, 
        recommendationsCount: data.recommendations?.length || 0,
        recommendations: data.recommendations,
        summary: data.summary,
        title: data.title
      });
      
      // Update the title if provided
      if (data.title) {
        setRecommendationTitle(data.title);
      }
      
      // Update the user message with summary
      const updatedUserMessages = newMessages.map((msg, idx) => {
        if (idx === newMessages.length - 1 && msg.role === 'user') {
          return {
            ...msg,
            summary: data.summary || '',
            recommendations: data.recommendations || [],
          };
        }
        return msg;
      });

      // Add assistant response only if there are recommendations
      // For general answers, don't add an assistant message (right box stays unchanged)
      if (data.recommendations && Array.isArray(data.recommendations) && data.recommendations.length > 0) {
        console.log('Adding assistant message with', data.recommendations.length, 'recommendations');
        setMessages([
          ...updatedUserMessages,
          {
            role: 'assistant',
            content: '', // No summary in right box, only cards
            recommendations: data.recommendations,
          },
        ]);
      } else {
        console.log('No recommendations found, only updating user message');
        // General answer - only update user message, don't add assistant message
        setMessages(updatedUserMessages);
      }

      // Generate dynamic suggestions after every question is answered
      try {
        const suggestionsResponse = await fetch('/api/suggestions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            userQuestion: userMessage,
            conversationHistory: conversationHistory,
            recommendations: data.recommendations || [],
            summary: data.summary || '',
          }),
        });

        if (suggestionsResponse.ok) {
          const suggestionsData = await suggestionsResponse.json();
          if (suggestionsData.suggestions && Array.isArray(suggestionsData.suggestions)) {
            setDynamicSuggestions(suggestionsData.suggestions);
          }
        }
      } catch (error) {
        console.error('Error generating suggestions:', error);
        // Don't show error to user, just continue without suggestions
      }
    } catch (error) {
      console.error('Error:', error);
      const errorMessage = error instanceof Error 
        ? error.message 
        : 'Sorry, I encountered an error. Please try again.';
      setMessages([
        ...newMessages,
        {
          role: 'assistant',
          content: `❌ Error: ${errorMessage}\n\nPlease check:\n- Your OpenAI API key is set correctly in .env.local\n- The Google Sheet is public and accessible\n- Check the browser console and server logs for more details`,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSuggestedQuestion = async (question: string) => {
    // Automatically send the suggested question
    if (isLoading) return;
    
    setInput('');
    setIsLoading(true);

    // Add user message
    const newMessages: Message[] = [
      ...messages,
      { role: 'user', content: question },
    ];
    setMessages(newMessages);

    try {
      // Prepare conversation history
      const conversationHistory = newMessages
        .filter((msg) => msg.role === 'user' || msg.role === 'assistant')
        .map((msg) => ({
          role: msg.role,
          content: msg.content,
        }));

      const response = await fetch('/api/recommendations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          message: question,
          conversationHistory: conversationHistory,
        }),
      });

      const data = await response.json();
      
      // Check if the response contains an error
      if (!response.ok || data.error) {
        const errorMessage = data.error || 'Failed to get recommendations';
        const errorDetails = data.details ? `\n\nDetails: ${data.details}` : '';
        throw new Error(`${errorMessage}${errorDetails}`);
      }
      
      console.log('API Response data:', { 
        hasRecommendations: !!data.recommendations, 
        recommendationsCount: data.recommendations?.length || 0,
        recommendations: data.recommendations,
        summary: data.summary,
        title: data.title
      });
      
      // Update the title if provided
      if (data.title) {
        setRecommendationTitle(data.title);
      }
      
      // Update the user message with summary
      const updatedUserMessages = newMessages.map((msg, idx) => {
        if (idx === newMessages.length - 1 && msg.role === 'user') {
          return {
            ...msg,
            summary: data.summary || '',
            recommendations: data.recommendations || [],
          };
        }
        return msg;
      });

      // Add assistant response only if there are recommendations
      // For general answers, don't add an assistant message (right box stays unchanged)
      if (data.recommendations && Array.isArray(data.recommendations) && data.recommendations.length > 0) {
        console.log('Adding assistant message with', data.recommendations.length, 'recommendations');
        setMessages([
          ...updatedUserMessages,
          {
            role: 'assistant',
            content: '', // No summary in right box, only cards
            recommendations: data.recommendations,
          },
        ]);
      } else {
        console.log('No recommendations found, only updating user message');
        // General answer - only update user message, don't add assistant message
        setMessages(updatedUserMessages);
      }

      // Generate dynamic suggestions after every question is answered
      try {
        const suggestionsResponse = await fetch('/api/suggestions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            userQuestion: question,
            conversationHistory: conversationHistory,
            recommendations: data.recommendations || [],
            summary: data.summary || '',
          }),
        });

        if (suggestionsResponse.ok) {
          const suggestionsData = await suggestionsResponse.json();
          if (suggestionsData.suggestions && Array.isArray(suggestionsData.suggestions)) {
            setDynamicSuggestions(suggestionsData.suggestions);
          }
        }
      } catch (error) {
        console.error('Error generating suggestions:', error);
        // Don't show error to user, just continue without suggestions
      }
    } catch (error) {
      console.error('Error:', error);
      const errorMessage = error instanceof Error 
        ? error.message 
        : 'Sorry, I encountered an error. Please try again.';
      setMessages([
        ...newMessages,
        {
          role: 'assistant',
          content: `❌ Error: ${errorMessage}\n\nPlease check:\n- Your OpenAI API key is set correctly in .env.local\n- The Google Sheet is public and accessible\n- Check the browser console and server logs for more details`,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Helper function to get icon for a suggestion based on keywords
  const getSuggestionIcon = (text: string): string => {
    const lowerText = text.toLowerCase();
    if (lowerText.includes('travel') || lowerText.includes('flight') || lowerText.includes('airline')) {
      return '✈️';
    } else if (lowerText.includes('grocery') || lowerText.includes('gas') || lowerText.includes('shopping') || lowerText.includes('store')) {
      return '🛒';
    } else if (lowerText.includes('fee') || lowerText.includes('annual') || lowerText.includes('no fee')) {
      return '💳';
    } else if (lowerText.includes('premium') || lowerText.includes('luxury') || lowerText.includes('elite')) {
      return '✨';
    } else if (lowerText.includes('cash back') || lowerText.includes('cashback')) {
      return '💰';
    } else if (lowerText.includes('reward') || lowerText.includes('point')) {
      return '🎁';
    } else if (lowerText.includes('student') || lowerText.includes('college')) {
      return '🎓';
    } else if (lowerText.includes('business')) {
      return '💼';
    } else {
      return '💳'; // Default icon
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100">
      <div className="container mx-auto px-4 py-8 max-w-5xl">
        {/* Header */}
        <header className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            Credit Card Recommendation Chatbot
          </h1>
          <p className="text-gray-600">
            Get personalized credit card recommendations powered by AI
          </p>
        </header>

        {/* Chat Area - Two Column Layout */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          {/* User Messages Box */}
          <div className="bg-white rounded-lg shadow-lg p-6">
            <div className="mb-4 pb-2 border-b">
              <h3 className="text-lg font-semibold text-gray-800">Your Questions</h3>
              <p className="text-sm text-gray-600 mt-1">Ask me anything about credit cards</p>
            </div>
            <div 
              ref={chatContainerRef}
              className="h-[422px] overflow-y-auto mb-4 space-y-3"
            >
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full py-8">
                  {/* Teal-blue circular icon with starburst */}
                  <div className="w-16 h-16 bg-teal-500 rounded-full flex items-center justify-center mb-4">
                    <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/>
                    </svg>
                  </div>
                  <p className="font-bold text-gray-800 mb-2 text-center">Start a conversation!</p>
                  <p className="text-sm text-gray-600 mb-6 text-center px-4">
                    Choose a quick action below or type your own question about credit cards.
                  </p>
                  <div className="grid grid-cols-2 gap-3 w-full px-4">
                    {SUGGESTED_QUESTIONS.map((question, index) => (
                      <button
                        key={index}
                        onClick={() => handleSuggestedQuestion(question.text)}
                        className="px-4 py-3 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50 hover:border-gray-300 hover:shadow-sm transition-all duration-200 flex items-center gap-2"
                      >
                        <span className="text-lg">{question.icon}</span>
                        <span className="text-left">{question.text}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <>
                  {messages
                    .filter((msg) => msg.role === 'user')
                    .map((message, index) => {
                      // Process markdown summary and ensure card links use correct URLs
                      const processMarkdownSummary = (summary: string, recommendations?: Recommendation[]) => {
                        if (!summary) return summary;
                        
                        // If there are recommendations, ensure markdown links use the correct URLs
                        if (recommendations && recommendations.length > 0) {
                          let processedSummary = summary;
                          recommendations.forEach((rec) => {
                            const cardName = rec.credit_card_name;
                            // Replace markdown links [Card Name](url) with correct URLs
                            const markdownLinkRegex = new RegExp(`\\[${cardName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\]\\([^)]+\\)`, 'gi');
                            processedSummary = processedSummary.replace(
                              markdownLinkRegex,
                              `[${cardName}](${rec.apply_url})`
                            );
                          });
                          return processedSummary;
                        }
                        return summary;
                      };

                      return (
                        <div key={index} className="space-y-2" data-message-index={index}>
                          <div className="bg-blue-500 text-white rounded-lg p-3">
                            <p className="whitespace-pre-wrap text-sm">{message.content}</p>
                          </div>
                          {message.summary && (
                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-gray-700">
                              <div className="prose prose-sm max-w-none">
                                <ReactMarkdown
                                  components={{
                                    a: ({ ...props }) => (
                                      <a 
                                        {...props} 
                                        target="_blank" 
                                        rel="noopener noreferrer"
                                        className="text-blue-700 font-bold hover:text-blue-900 underline decoration-2"
                                      />
                                    ),
                                    strong: ({ ...props }) => (
                                      <strong className="font-bold text-gray-900" {...props} />
                                    ),
                                    h2: ({ ...props }) => (
                                      <h2 className="text-base font-bold text-gray-900 mt-4 mb-3" {...props} />
                                    ),
                                    h3: ({ ...props }) => (
                                      <h3 className="text-base font-bold text-gray-900 mt-3 mb-2" {...props} />
                                    ),
                                    p: ({ ...props }) => (
                                      <p className="mb-3 leading-relaxed" {...props} />
                                    ),
                                    ul: ({ ...props }) => (
                                      <ul className="list-none space-y-3 my-3" {...props} />
                                    ),
                                    li: ({ ...props }) => (
                                      <li className="mb-4 leading-relaxed" {...props} />
                                    ),
                                  }}
                                >
                                  {(() => {
                                    // Process markdown and ensure all cards are included
                                    let displayText = message.recommendations && message.recommendations.length > 0
                                      ? processMarkdownSummary(message.summary, message.recommendations)
                                      : message.summary;
                                    
                                    // If we have recommendations but they're not in the summary, append them
                                    if (message.recommendations && message.recommendations.length > 0) {
                                      const summaryLower = displayText.toLowerCase();
                                      const missingCards = message.recommendations.filter(rec => {
                                        const cardNameLower = rec.credit_card_name.toLowerCase();
                                        return !summaryLower.includes(cardNameLower);
                                      });
                                      
                                      if (missingCards.length > 0) {
                                        const cardsText = missingCards.map(rec => 
                                          `• **[${rec.credit_card_name}](${rec.apply_url})** - ${rec.reason}`
                                        ).join('\n\n');
                                        displayText = displayText + '\n\n' + cardsText;
                                      }
                                    }
                                    
                                    return displayText;
                                  })()}
                                </ReactMarkdown>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  {isLoading && (
                    <div className="bg-gray-100 rounded-lg p-3">
                      <p className="text-gray-600 text-sm">Sending...</p>
                    </div>
                  )}
                  
                  {/* Dynamic Suggested Questions - After most recent answer */}
                  {dynamicSuggestions.length > 0 && messages.length > 0 && !isLoading && (
                    <div className="mt-4 pt-4 border-t border-gray-200">
                      <p className="text-xs text-gray-500 mb-3 font-medium">You might also ask:</p>
                      <div className="grid grid-cols-2 gap-3">
                        {dynamicSuggestions.slice(0, 4).map((suggestion, index) => (
                          <button
                            key={index}
                            onClick={() => handleSuggestedQuestion(suggestion)}
                            disabled={isLoading}
                            className="px-4 py-3 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50 hover:border-gray-300 hover:shadow-sm transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                          >
                            <span className="text-lg">{getSuggestionIcon(suggestion)}</span>
                            <span className="text-left flex-1">{suggestion}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
              <div ref={messagesEndRef} />
            </div>
            
            {/* Input Area */}
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Ask about credit cards..."
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                disabled={isLoading}
              />
              <button
                onClick={handleSend}
                disabled={isLoading || !input.trim()}
                className="px-4 py-2 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg hover:from-blue-600 hover:to-purple-700 disabled:from-gray-400 disabled:to-gray-400 disabled:cursor-not-allowed transition-all text-sm flex items-center justify-center min-w-[48px]"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </button>
            </div>
          </div>

          {/* Assistant Responses Box */}
          <div 
            className={`rounded-lg shadow-lg p-6 transition-all duration-1000 ease-in-out ${
              isRightBoxUpdating 
                ? 'bg-blue-100 border-2 border-blue-400 shadow-xl shadow-blue-200' 
                : 'bg-white border-2 border-transparent'
            }`}
          >
            <h3 className="text-lg font-semibold text-gray-800 mb-4 pb-2 border-b">{recommendationTitle}</h3>
            <div 
              ref={assistantContainerRef}
              className="h-[422px] overflow-y-auto mb-4 space-y-3"
            >
              {(() => {
                // Find only the most recent assistant message with recommendations
                const mostRecentAssistantMessage = [...messages]
                  .reverse()
                  .find((msg) => msg.role === 'assistant' && msg.recommendations && msg.recommendations.length > 0);

                // Show loading animation when loading, regardless of previous recommendations
                if (isLoading) {
                  return (
                    <div className="flex flex-col items-center justify-center h-full">
                      <SwipeToLoad />
                    </div>
                  );
                }

                if (!mostRecentAssistantMessage) {
                  return (
                    <div className="flex flex-col items-center justify-center h-full py-8">
                      <p className="text-gray-500 text-center">Card recommendations will appear here</p>
                    </div>
                  );
                }

                return (
                  <div className="bg-gray-100 text-gray-800 rounded-lg p-1">
                    {/* Recommendations - only show card details */}
                    {mostRecentAssistantMessage.recommendations && mostRecentAssistantMessage.recommendations.length > 0 && (
                      <div className="mt-0">
                        <p className="font-semibold mb-2 text-xs text-gray-600 px-2">Recommended Cards:</p>
                        <div className="space-y-2">
                          {mostRecentAssistantMessage.recommendations.map((rec, recIndex) => (
                            <div
                              key={recIndex}
                              className="bg-white rounded p-3 text-gray-800 border border-gray-200 mx-0"
                            >
                              <a
                                href={rec.apply_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="block mb-1"
                              >
                                <h4 className="font-semibold text-blue-600 hover:text-blue-800 hover:underline text-sm font-medium transition-colors cursor-pointer">
                                  {rec.credit_card_name}
                                </h4>
                              </a>
                              <p className="text-xs mb-2">{rec.reason}</p>
                              <a
                                href={rec.apply_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-block px-4 py-2 bg-blue-500 text-white text-sm font-medium rounded hover:bg-blue-600 transition-colors"
                              >
                                Apply Now →
                              </a>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

