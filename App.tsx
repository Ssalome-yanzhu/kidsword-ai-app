import React, { useState, useEffect } from 'react';
import { Word, SentenceResult, Recommendation } from './types';
import { generateSentence, generateVisual, getRecommendations, speakText } from './services/geminiService';

const STORAGE_KEY = 'kids_word_bank_v2';

const App: React.FC = () => {
  // 1. 直接从 localStorage 初始化，防止异步加载导致的覆盖问题
  const [wordBank, setWordBank] = useState<Word[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      console.error("Load failed", e);
      return [];
    }
  });

  const [inputValue, setInputValue] = useState('');
  const [currentResult, setCurrentResult] = useState<SentenceResult | null>(null);
  const [currentWords, setCurrentWords] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [isRefreshingRecs, setIsRefreshingRecs] = useState(false);
  const [activeTab, setActiveTab] = useState<'play' | 'collection'>('play');
  

  // 2. 只有在 wordBank 发生变化时才保存
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(wordBank));
  }, [wordBank]);

  // Initial Recommendations
  useEffect(() => {
    if (activeTab === 'play' && recommendations.length === 0) {
      fetchRecs();
    }
  }, [activeTab]);

  const fetchRecs = async () => {
    setIsRefreshingRecs(true);
    try {
      const existing = wordBank.map(w => w.text);
      const recs = await getRecommendations(existing);
      setRecommendations(recs);
    } catch (error) {
      console.error("Failed to fetch recommendations", error);
    } finally {
      setIsRefreshingRecs(false);
    }
  };

  const handleGenerate = async () => {
    const words = inputValue.split(/[\s,，]+/).filter(w => w.trim().length > 0);
    if (words.length === 0) return;
    
    setIsLoading(true);
    setCurrentResult(null);
    setCurrentWords(words.map(w => w.toLowerCase()));
    
    try {
      const sentenceData = await generateSentence(words);
      const scenario = sentenceData.context?.trim() || sentenceData.sentence;
      const imageUrl = await generateVisual(scenario, sentenceData.sentence);

      const result: SentenceResult = {
        ...sentenceData,
        imageUrl
      };

      setCurrentResult(result);
      
      // 更新已在单词本中的词的使用次数，但不修改单词本的成员列表
      setWordBank(prev => prev.map(w => {
        if (words.map(tw => tw.toLowerCase()).includes(w.text)) {
          return { ...w, count: w.count + 1, lastUsed: Date.now() };
        }
        return w;
      }));
    } catch (error) {
      alert("Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  // 3. 改进的添加逻辑：如果是结果页点击，只增不减
  const addToBank = (wordText: string) => {
    const cleanWord = wordText.toLowerCase();
    const existing = wordBank.find(w => w.text === cleanWord);
    
    if (!existing) {
      const newWord: Word = {
        id: Math.random().toString(36).substr(2, 9),
        text: cleanWord,
        count: 1,
        lastUsed: Date.now()
      };
      setWordBank(prev => [newWord, ...prev]);
    }
  };

  // 4. 显式的删除逻辑：仅用于 Collection 页面
  const removeFromBank = (wordId: string) => {
    if (confirm("Delete this word from memory?")) {
      setWordBank(prev => prev.filter(w => w.id !== wordId));
    }
  };

  const useRecommendation = (word: string) => {
    setInputValue(prev => {
      const trimmed = prev.trim();
      if (!trimmed) return word;
      if (trimmed.endsWith(',') || trimmed.endsWith('，')) return `${trimmed} ${word}`;
      return `${trimmed}, ${word}`;
    });
  };

  const playSentence = async () => {
    if (!currentResult) return;
    await speakText(currentResult.sentence);
  };

  const isWordInBank = (word: string) => wordBank.some(w => w.text === word.toLowerCase());

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-24 font-['Quicksand']">
      {/* Header */}
      <header className="bg-white px-6 py-6 border-b border-slate-100 sticky top-0 z-20">
        <div className="max-w-xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 bg-indigo-500 rounded-2xl flex items-center justify-center shadow-lg rotate-3">
              <i className="fas fa-spell-check text-white text-xl"></i>
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-800 tracking-tight">KidsWord</h1>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">AI English Partner</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setActiveTab('collection')}
            className="bg-indigo-50 hover:bg-indigo-100 active:scale-[0.98] px-3 py-2 rounded-2xl flex items-center gap-2 transition-all shadow-sm border border-indigo-100/80"
            aria-label="Open Bank to view mastered words"
          >
            <i className="fas fa-award text-indigo-500 text-sm"></i>
            <span className="text-xs font-bold text-indigo-600">
              {wordBank.length} Mastered
            </span>
          </button>
        </div>
      </header>

      <main className="max-w-xl mx-auto px-4 py-8">
        {activeTab === 'play' ? (
          <div className="space-y-8 animate-fadeIn">
            
            {/* Recommendations Section */}
            {!currentResult && !isLoading && (
              <section className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest flex items-center">
                    <i className="fas fa-sparkles mr-2 text-yellow-400"></i>
                    Magic Suggestions
                  </h3>
                  <button 
                    onClick={fetchRecs} 
                    disabled={isRefreshingRecs}
                    className="text-indigo-500 text-xs font-bold flex items-center hover:opacity-70 transition-opacity"
                  >
                    <i className={`fas fa-sync-alt mr-1 ${isRefreshingRecs ? 'fa-spin' : ''}`}></i>
                    Refresh
                  </button>
                </div>
                
                <div className="grid grid-cols-2 gap-3">
                  {recommendations.length > 0 ? (
                    recommendations.map((rec, idx) => (
                      <button
                        key={idx}
                        onClick={() => useRecommendation(rec.word)}
                        className="bg-white p-4 rounded-2xl border border-indigo-50 shadow-sm hover:shadow-md hover:border-indigo-200 transition-all text-left group relative overflow-hidden"
                      >
                        <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-30 transition-opacity">
                           <i className="fas fa-plus-circle text-2xl"></i>
                        </div>
                        <div className="font-black text-indigo-600 text-lg leading-none mb-1">{rec.word}</div>
                        <div className="text-slate-500 text-xs font-bold mb-2">{rec.translation}</div>
                        <div className="text-[10px] text-slate-300 leading-tight italic line-clamp-1">{rec.reason}</div>
                      </button>
                    ))
                  ) : (
                    Array(4).fill(0).map((_, i) => (
                      <div key={i} className="bg-slate-50 h-24 rounded-2xl animate-pulse"></div>
                    ))
                  )}
                </div>
              </section>
            )}

            {/* Input Section */}
            {!currentResult && (
              <section className="bg-white rounded-[2rem] p-8 shadow-sm border border-slate-100 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500"></div>
                <h2 className="text-xl font-bold text-slate-800 mb-2">Build a Scene</h2>
                <p className="text-slate-500 text-sm mb-6">Type some words or click suggestions above.</p>
                
                <textarea
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder="e.g. cat, jump, table"
                  className="w-full bg-slate-50 border-2 border-transparent focus:border-indigo-200 rounded-2xl p-4 min-h-[120px] outline-none transition-all text-lg font-medium text-slate-700 resize-none shadow-inner"
                />
                
                <button
                  onClick={handleGenerate}
                  disabled={isLoading || !inputValue.trim()}
                  className="w-full mt-6 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 text-white py-4 rounded-2xl font-bold text-lg shadow-xl shadow-indigo-100 transition-all active:scale-[0.98] flex items-center justify-center space-x-3"
                >
                  {isLoading ? (
                    <>
                      <i className="fas fa-circle-notch fa-spin"></i>
                      <span>Drawing Magic...</span>
                    </>
                  ) : (
                    <>
                      <i className="fas fa-wand-magic-sparkles"></i>
                      <span>Create Magic Sentence</span>
                    </>
                  )}
                </button>
              </section>
            )}

            {/* Result Section */}
            {currentResult && (
              <div className="animate-slideUp space-y-6">
                <div className="bg-white rounded-[2.5rem] overflow-hidden shadow-2xl border border-slate-100">
                  <div className="relative aspect-video bg-slate-100">
                    {currentResult.imageUrl ? (
                      <img src={currentResult.imageUrl} alt="Scenario" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <i className="fas fa-image text-slate-200 text-5xl"></i>
                      </div>
                    )}
                    <button 
                      onClick={() => { setCurrentResult(null); setInputValue(''); }}
                      className="absolute top-4 right-4 bg-black/20 hover:bg-black/40 backdrop-blur-md text-white w-10 h-10 rounded-full flex items-center justify-center transition-all"
                    >
                      <i className="fas fa-times"></i>
                    </button>
                  </div>
                  
                  <div className="p-8">
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex-1">
                        <h3 className="text-2xl font-black text-slate-900 leading-tight mb-1">
                          {currentResult.sentence}
                        </h3>
                        <p className="text-indigo-500 font-bold text-lg">
                          {currentResult.translation}
                        </p>
                      </div>
                      <button
                        onClick={playSentence}
                        className="bg-indigo-100 text-indigo-600 w-14 h-14 rounded-2xl flex items-center justify-center hover:bg-indigo-200 transition-all active:scale-90 shadow-sm"
                      >
                        <i className="fas fa-volume-up text-xl"></i>
                      </button>
                    </div>

                    <div className="bg-slate-50 rounded-2xl p-4 mb-8">
                      <p className="text-slate-500 text-sm italic">
                        <i className="fas fa-quote-left mr-2 opacity-30 text-indigo-400"></i>
                        {currentResult.context}
                      </p>
                    </div>

                    <div className="space-y-4">
                      <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">Remember these words?</h4>
                      <div className="flex flex-wrap gap-2">
                        {currentWords.map((word, idx) => (
                          <button
                            key={idx}
                            onClick={() => addToBank(word)}
                            className={`flex items-center space-x-2 px-4 py-2 rounded-xl font-bold border-2 transition-all ${
                              isWordInBank(word)
                                ? 'bg-green-500 border-green-500 text-white cursor-default'
                                : 'bg-white border-slate-100 text-slate-600 hover:border-indigo-200 shadow-sm active:scale-95'
                            }`}
                          >
                            <span>{word}</span>
                            {isWordInBank(word) ? (
                              <i className="fas fa-check-circle"></i>
                            ) : (
                              <i className="fas fa-plus-circle opacity-40"></i>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => { setCurrentResult(null); setInputValue(''); }}
                  className="w-full bg-slate-200 hover:bg-slate-300 text-slate-600 py-4 rounded-2xl font-bold transition-all shadow-inner"
                >
                  Start New Journey
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="animate-fadeIn space-y-6">
            <header className="flex items-center justify-between">
              <h2 className="text-2xl font-black text-slate-800">Mastered</h2>
              <div className="text-sm text-slate-400 font-bold">Total {wordBank.length} words</div>
            </header>

            {wordBank.length === 0 ? (
              <div className="text-center py-20 bg-white rounded-[2rem] border-2 border-dashed border-slate-100 shadow-sm">
                <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                  <i className="fas fa-box-open text-slate-200 text-2xl"></i>
                </div>
                <p className="text-slate-400 font-bold">Your treasure chest is empty!</p>
                <button onClick={() => setActiveTab('play')} className="mt-4 text-indigo-500 font-bold hover:underline">
                  Go learn some words!
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {wordBank.sort((a,b) => (b.lastUsed || 0) - (a.lastUsed || 0)).map((word) => (
                  <div
                    key={word.id}
                    className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between group hover:border-indigo-100 transition-colors"
                  >
                    <div>
                      <div className="font-black text-slate-800 text-lg leading-tight">{word.text}</div>
                      <div className="text-[10px] font-bold text-slate-400 uppercase">Used {word.count} times</div>
                    </div>
                    <button
                      onClick={() => removeFromBank(word.id)}
                      className="text-slate-200 hover:text-red-400 transition-colors p-2"
                      title="Remove from bank"
                    >
                      <i className="fas fa-trash-alt text-sm"></i>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-xl border-t border-slate-100 p-4 z-30 shadow-[0_-5px_20px_rgba(0,0,0,0.03)]">
        <div className="max-w-xl mx-auto flex justify-around">
          <button
            onClick={() => setActiveTab('play')}
            className={`flex flex-col items-center space-y-1 px-8 py-2 rounded-2xl transition-all ${
              activeTab === 'play' ? 'text-indigo-600 bg-indigo-50 shadow-inner' : 'text-slate-300'
            }`}
          >
            <i className="fas fa-play-circle text-xl"></i>
            <span className="text-[10px] font-black uppercase tracking-wider">Play</span>
          </button>

          <button
            onClick={() => setActiveTab('collection')}
            className={`flex flex-col items-center space-y-1 px-8 py-2 rounded-2xl transition-all ${
              activeTab === 'collection' ? 'text-indigo-600 bg-indigo-50 shadow-inner' : 'text-slate-300'
            }`}
          >
            <i className="fas fa-th-large text-xl"></i>
            <span className="text-[10px] font-black uppercase tracking-wider">Bank</span>
          </button>
        </div>
      </nav>
    </div>
  );
};

export default App;