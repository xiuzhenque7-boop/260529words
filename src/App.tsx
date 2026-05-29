import React, { useState, useEffect, useMemo, useRef } from "react";
import { 
  BookOpen, Sparkles, Play, Volume2, Star, Trash2, Edit3, Plus, RotateCcw, 
  CheckCircle2, XCircle, FileText, Check, Eye, EyeOff, HelpCircle, Info, 
  Sliders, Settings, Activity, FileImage, ArrowRight, ChevronRight, Loader2, RefreshCw, AlertTriangle
} from "lucide-react";

import { Word, WordList, DictationSession } from "./types";
import { DEFAULT_WORDS } from "./data/defaultWords";
import { parseImportedFileContent } from "./utils/fileParser";
import { speakText } from "./utils/speech";
import PhotoOcrUploader from "./components/PhotoOcrUploader";

export default function App() {
  // --- Data & Persistence States ---
  const [words, setWords] = useState<Word[]>(() => {
    const cached = localStorage.getItem("dictation_words_v1");
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch (e) {
        console.error("Failed to restore cached words", e);
      }
    }
    return DEFAULT_WORDS;
  });

  const [collections, setCollections] = useState<WordList[]>(() => {
    const cached = localStorage.getItem("dictation_collections_v1");
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch (e) {
         console.error("Failed to restore cached collections", e);
      }
    }
    return [
      { id: "col-default", name: "GRE/日常核心词汇", words: DEFAULT_WORDS, createdTime: Date.now(), isDefault: true },
    ];
  });

  const [activeCollectionId, setActiveCollectionId] = useState<string>("all");
  const [activeTab, setActiveTab] = useState<"dictation" | "library" | "insights">("dictation");

  // --- UI Control States ---
  const [showPhotoUploader, setShowPhotoUploader] = useState(false);
  const [showFileImporter, setShowFileImporter] = useState(false);
  const [importedText, setImportedText] = useState("");
  const [showAddWordModal, setShowAddWordModal] = useState(false);
  const [editingWord, setEditingWord] = useState<Word | null>(null);

  // Form states for manual word creation/edit
  const [formWord, setFormWord] = useState("");
  const [formPhonetic, setFormPhonetic] = useState("");
  const [formTranslation, setFormTranslation] = useState("");
  const [formExampleEn, setFormExampleEn] = useState("");
  const [formExampleZh, setFormExampleZh] = useState("");
  
  // Custom collection creation state
  const [newCollectionName, setNewCollectionName] = useState("");
  const [showNewCollectionInput, setShowNewCollectionInput] = useState(false);

  // --- AI Model Verification ---
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiStatusMessage, setAiStatusMessage] = useState("");

  // --- Dictation Engine State ---
  const [session, setSession] = useState<DictationSession>({
    wordIds: [],
    currentIndex: 0,
    answers: {},
    results: {},
    status: "idle",
    mode: "audio",
    voiceRate: 0.85,
    voiceGender: "default"
  });

  const [typingAnswer, setTypingAnswer] = useState("");
  const [isAnswerRevealed, setIsAnswerRevealed] = useState(false);
  const [sentenceBlanked, setSentenceBlanked] = useState("");
  const [customSpeed, setCustomSpeed] = useState(0.85);

  const textInputRef = useRef<HTMLInputElement>(null);

  // --- Local Persistence Effects ---
  useEffect(() => {
    localStorage.setItem("dictation_words_v1", JSON.stringify(words));
  }, [words]);

  useEffect(() => {
    localStorage.setItem("dictation_collections_v1", JSON.stringify(collections));
  }, [collections]);

  // Check backend server health status and API Key configuration
  useEffect(() => {
    fetch("/api/health")
      .then((res) => res.json())
      .then((data) => {
        setHasApiKey(!!data.hasApiKey);
      })
      .catch((err) => {
        console.error("Server API key verification failed:", err);
        setHasApiKey(false);
      });
  }, []);

  // --- Computed Word Subsets ---
  const filteredWords = useMemo(() => {
    if (activeCollectionId === "all") {
      return words;
    }
    if (activeCollectionId === "starred") {
      return words.filter(w => w.isStarred);
    }
    if (activeCollectionId === "mistaken") {
      return words.filter(w => w.mistakeCount > 0);
    }
    const collection = collections.find(c => c.id === activeCollectionId);
    if (collection) {
      // Return matching global words to keep stats active
      return words.filter(w => collection.words.some(cw => cw.word.toLowerCase() === w.word.toLowerCase()));
    }
    return words;
  }, [words, collections, activeCollectionId]);

  // --- Helper to speech pronounce a word or a sentence ---
  const playSpeech = (text: string) => {
    speakText(text, customSpeed);
  };

  // Trigger sound sequence on load/index change in dictation
  const currentDictationWord = useMemo(() => {
    if (session.status !== "testing" || session.wordIds.length === 0) return null;
    const wordId = session.wordIds[session.currentIndex];
    return words.find(w => w.id === wordId) || null;
  }, [session.status, session.currentIndex, session.wordIds, words]);

  // Handle auto speech trigger
  useEffect(() => {
    if (currentDictationWord && session.status === "testing") {
      const timer = setTimeout(() => {
        if (session.mode === "audio") {
          playSpeech(currentDictationWord.word);
        } else if (session.mode === "sentence_gap") {
          playSpeech(currentDictationWord.exampleEn || currentDictationWord.word);
        } else {
          playSpeech(currentDictationWord.word);
        }
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [session.currentIndex, session.status, session.mode]);

  // Sentence gap blank converter
  useEffect(() => {
    if (currentDictationWord) {
      const sentence = currentDictationWord.exampleEn || "";
      const target = currentDictationWord.word;
      
      // Match boundaries logically to hide the target word safely
      const regex = new RegExp(`\\b${target}\\b`, "i");
      if (regex.test(sentence)) {
        setSentenceBlanked(sentence.replace(regex, "_______"));
      } else {
        // Fallback fallback if morphologic differences occur
        const wordsArr = target.split(" ");
        let resultSentence = sentence;
        wordsArr.forEach(w => {
          if (w.length > 2) {
            const subRegex = new RegExp(w, "gi");
            resultSentence = resultSentence.replace(subRegex, "_______");
          }
        });
        setSentenceBlanked(resultSentence || "Please dictation target word below.");
      }
    }
  }, [currentDictationWord]);

  // Focus utility
  useEffect(() => {
    if (session.status === "testing" && !isAnswerRevealed) {
      setTimeout(() => {
        textInputRef.current?.focus();
      }, 100);
    }
  }, [session.currentIndex, session.status, isAnswerRevealed]);

  // --- Action Handlers ---

  // Start Dictation Session
  const handleStartDictation = (modeSelected: "audio" | "visual" | "sentence_gap") => {
    if (filteredWords.length === 0) {
      alert("当前词单为空，请先添加或导入一些英文单词。");
      return;
    }

    // Shuffle words inside session for better active practice
    const shuffledIds = [...filteredWords]
      .sort(() => Math.random() - 0.5)
      .map(w => w.id);

    setSession({
      wordIds: shuffledIds,
      currentIndex: 0,
      answers: {},
      results: {},
      status: "testing",
      mode: modeSelected,
      voiceRate: customSpeed,
      voiceGender: "default"
    });
    setTypingAnswer("");
    setIsAnswerRevealed(false);
  };

  // Repeat spelling speech audio
  const handleRepeatVoice = () => {
    if (!currentDictationWord) return;
    if (session.mode === "sentence_gap") {
      playSpeech(currentDictationWord.exampleEn || currentDictationWord.word);
    } else {
      playSpeech(currentDictationWord.word);
    }
  };

  // Re-pronounce single word in Gap mode
  const handlePronounceIsolated = () => {
    if (!currentDictationWord) return;
    playSpeech(currentDictationWord.word);
  };

  // Submit Typing Word Answer
  const handleSubmitAnswer = () => {
    if (!currentDictationWord) return;

    const formattedAnswer = typingAnswer.trim().toLowerCase();
    const correctAnswer = currentDictationWord.word.trim().toLowerCase();
    
    const isCorrect = formattedAnswer === correctAnswer;

    // Record results inside global states
    const targetWordId = currentDictationWord.id;

    setWords(prevWords => prevWords.map(w => {
      if (w.id === targetWordId) {
        return {
          ...w,
          correctCount: isCorrect ? w.correctCount + 1 : w.correctCount,
          mistakeCount: !isCorrect ? w.mistakeCount + 1 : w.mistakeCount
        };
      }
      return w;
    }));

    setSession(prev => ({
      ...prev,
      answers: {
        ...prev.answers,
        [targetWordId]: typingAnswer
      },
      results: {
        ...prev.results,
        [targetWordId]: isCorrect ? "correct" : "incorrect"
      }
    }));

    setIsAnswerRevealed(true);
  };

  // Proceed onto next dictation card
  const handleNextWord = () => {
    if (session.currentIndex + 1 >= session.wordIds.length) {
      // Completed full set dictation session!
      setSession(prev => ({ ...prev, status: "finished" }));
    } else {
      setSession(prev => ({
        ...prev,
        currentIndex: prev.currentIndex + 1
      }));
      setTypingAnswer("");
      setIsAnswerRevealed(false);
    }
  };

  const handleSkipWord = () => {
    if (!currentDictationWord) return;
    const targetWordId = currentDictationWord.id;

    setSession(prev => ({
      ...prev,
      answers: {
        ...prev.answers,
        [targetWordId]: ""
      },
      results: {
        ...prev.results,
        [targetWordId]: "skipped"
      }
    }));

    setIsAnswerRevealed(true);
  };

  // Reset or prematurely cancel active dictation session
  const handleQuitSession = () => {
    if (window.confirm("确认要结束本次听写操练吗？已完成进度将仍会计入统计。")) {
      setSession(prev => ({ ...prev, status: "idle" }));
    }
  };

  const handleRestartFailedWordsOnly = () => {
    // Collect inaccurate and skipped words
    const failedIds = session.wordIds.filter(id => {
      const outcome = session.results[id];
      return outcome === "incorrect" || outcome === "skipped" || !outcome;
    });

    if (failedIds.length === 0) {
      alert("太棒了！所有单词听写完全正确，没有错误单词。");
      return;
    }

    setSession(prev => ({
      ...prev,
      wordIds: failedIds,
      currentIndex: 0,
      answers: {},
      results: {},
      status: "testing"
    }));
    setTypingAnswer("");
    setIsAnswerRevealed(false);
  };

  const handleRestartFullSessionAgain = () => {
    setSession(prev => ({
      ...prev,
      currentIndex: 0,
      answers: {},
      results: {},
      status: "testing"
    }));
    setTypingAnswer("");
    setIsAnswerRevealed(false);
  };

  // Word collection actions
  const handleCreateNewCollection = () => {
    const name = newCollectionName.trim();
    if (!name) return;
    const newCol: WordList = {
      id: "col-" + Date.now(),
      name,
      words: [],
      createdTime: Date.now()
    };
    setCollections([...collections, newCol]);
    setNewCollectionName("");
    setShowNewCollectionInput(false);
    setActiveCollectionId(newCol.id);
  };

  const handleDeleteCollection = (id: string, name: string) => {
    if (window.confirm(`确认删除 "${name}" 词单吗？词单内的单词不会被从系统总库中删除。`)) {
      setCollections(collections.filter(c => c.id !== id));
      setActiveCollectionId("all");
    }
  };

  // --- File Text Importer ---
  const handleProcessTextImport = () => {
    if (!importedText.trim()) return;
    const parsed = parseImportedFileContent(importedText);
    if (parsed.length === 0) {
      alert("未识别出有效内容。请保证每行包含一个英文单词。");
      return;
    }

    const brandNewWords: Word[] = parsed.map((item, index) => {
      const finalWordText = (item.word || "").trim();
      return {
        id: "word-node-" + Date.now() + "-" + index,
        word: finalWordText,
        phonetic: item.phonetic || "",
        translation: item.translation || "",
        exampleEn: item.exampleEn || "",
        exampleZh: item.exampleZh || "",
        createdTime: Date.now() + index,
        correctCount: 0,
        mistakeCount: 0
      };
    });

    // Check duplicates globally
    const uniqueNews = brandNewWords.filter(nw => !words.some(w => w.word.toLowerCase() === nw.word.toLowerCase()));
    
    setWords(prev => [ ...uniqueNews, ...prev ]);

    // If imported in custom collection, add it
    if (activeCollectionId !== "all" && activeCollectionId !== "starred" && activeCollectionId !== "mistaken") {
      setCollections(cols => cols.map(c => {
        if (c.id === activeCollectionId) {
          return {
            ...c,
            words: [ ...uniqueNews, ...c.words ]
          };
        }
        return c;
      }));
    }

    setImportedText("");
    setShowFileImporter(false);
    alert(`成功导入 ${brandNewWords.length} 个单词（已自动过滤 ${brandNewWords.length - uniqueNews.length} 个重复单词）。`);
  };

  // Photo import payload processing
  const handleImportedOcrWords = (ocrList: { word: string; translation?: string }[]) => {
    const targetPayload: Word[] = ocrList.map((item, idx) => ({
      id: "word-ocr-" + Date.now() + "-" + idx,
      word: item.word.toLowerCase().trim(),
      phonetic: "",
      translation: item.translation || "图片文字提取",
      exampleEn: "",
      exampleZh: "",
      createdTime: Date.now() + idx,
      correctCount: 0,
      mistakeCount: 0
    }));

    // Filter duplicates
    const finalUniques = targetPayload.filter(tw => !words.some(w => w.word.toLowerCase() === tw.word.toLowerCase()));

    setWords(prev => [ ...finalUniques, ...prev ]);

    if (activeCollectionId !== "all" && activeCollectionId !== "starred" && activeCollectionId !== "mistaken") {
      setCollections(cols => cols.map(c => {
        if (c.id === activeCollectionId) {
          return {
            ...c,
            words: [ ...finalUniques, ...c.words ]
          };
        }
        return c;
      }));
    }

    alert(`照片提取导入成功：成功存入 ${finalUniques.length} 个英文单词。`);
  };

  // Star Toggle
  const handleToggleStar = (id: string) => {
    setWords(prev => prev.map(w => {
      if (w.id === id) {
        return { ...w, isStarred: !w.isStarred };
      }
      return w;
    }));
  };

  // Clear Word dictation stats
  const handleResetWordStats = (id: string) => {
    setWords(prev => prev.map(w => {
      if (w.id === id) {
        return { ...w, correctCount: 0, mistakeCount: 0 };
      }
      return w;
    }));
  };

  const handleDeleteWord = (id: string, wordText: string) => {
    if (window.confirm(`确认要把单词 "${wordText}" 从词库中永久删除吗？`)) {
      setWords(prev => prev.filter(w => w.id !== id));
      // Remove from collections as well
      setCollections(cols => cols.map(c => ({
        ...c,
        words: c.words.filter(cw => cw.id !== id)
      })));
    }
  };

  // Save manual added / edited word
  const handleSaveWordForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formWord.trim()) {
      alert("请输入英文单词");
      return;
    }

    if (editingWord) {
      // Modify
      setWords(prev => prev.map(w => {
        if (w.id === editingWord.id) {
          return {
            ...w,
            word: formWord.trim(),
            phonetic: formPhonetic.trim(),
            translation: formTranslation.trim(),
            exampleEn: formExampleEn.trim(),
            exampleZh: formExampleZh.trim()
          };
        }
        return w;
      }));
      alert("修改单词成功！");
    } else {
      // Create new
      const generatedId = "manual-word-" + Date.now();
      const newW: Word = {
        id: generatedId,
        word: formWord.trim(),
        phonetic: formPhonetic.trim(),
        translation: formTranslation.trim(),
        exampleEn: formExampleEn.trim(),
        exampleZh: formExampleZh.trim(),
        createdTime: Date.now(),
        correctCount: 0,
        mistakeCount: 0
      };

      // Check duplicates
      if (words.some(w => w.word.toLowerCase() === newW.word.toLowerCase())) {
        if (!window.confirm(`词库中已存在名为 "${newW.word}" 的单词。是否继续强制添加重复项？`)) {
          return;
        }
      }

      setWords(prev => [newW, ...prev]);

      // If viewing custom collection, map inside
      if (activeCollectionId !== "all" && activeCollectionId !== "starred" && activeCollectionId !== "mistaken") {
        setCollections(cols => cols.map(c => {
          if (c.id === activeCollectionId) {
            return {
              ...c,
              words: [newW, ...c.words]
            };
          }
          return c;
        }));
      }
      alert("新增单词成功！");
    }

    // Reset modals
    setShowAddWordModal(false);
    setEditingWord(null);
    clearWordForm();
  };

  const clearWordForm = () => {
    setFormWord("");
    setFormPhonetic("");
    setFormTranslation("");
    setFormExampleEn("");
    setFormExampleZh("");
  };

  const handleEditClick = (wordObj: Word) => {
    setEditingWord(wordObj);
    setFormWord(wordObj.word);
    setFormPhonetic(wordObj.phonetic || "");
    setFormTranslation(wordObj.translation || "");
    setFormExampleEn(wordObj.exampleEn || "");
    setFormExampleZh(wordObj.exampleZh || "");
    setShowAddWordModal(true);
  };

  const handleAddNewWordClick = () => {
    setEditingWord(null);
    clearWordForm();
    setShowAddWordModal(true);
  };

  // --- GEMINI INTELLIGENT AUTO-ENRICH LOGIC ---
  const handleAiAutoEnrichAll = async () => {
    const uncompleted = filteredWords.filter(w => !w.phonetic || !w.exampleEn || !w.translation || w.translation === "图片文字提取");
    if (uncompleted.length === 0) {
      alert("当前过滤列表下的所有单词信息都很健全，无需批量补充啦！您也可以点击单个单词右侧按钮重新生成。");
      return;
    }

    // Process first 15 words to respect limits and keep it rapid
    const batch = uncompleted.slice(0, 15).map(w => w.word);
    
    setAiLoading(true);
    setAiStatusMessage(`正在通过 Gemini API 批量生成最新音标与例句中 (共 ${batch.length} 个单词)...`);

    try {
      const response = await fetch("/api/enrich-words", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ words: batch }),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "AIP Enrichment Request Failed");
      }

      const enrichedList = result.data || [];
      
      // Merge successfully
      setWords(prevWords => prevWords.map(existing => {
        const enriched = enrichedList.find((el: any) => el.word.toLowerCase() === existing.word.toLowerCase());
        if (enriched) {
          return {
            ...existing,
            // Only update fields if they were lacking, or always fill in if exists
            phonetic: enriched.phonetic || existing.phonetic,
            translation: enriched.translation || existing.translation,
            exampleEn: enriched.exampleEn || existing.exampleEn,
            exampleZh: enriched.exampleZh || existing.exampleZh,
          };
        }
        return existing;
      }));

      // Update active list representations instantly
      alert(`AI 智能信息补全完成！已自动为 ${batch.length} 个英文单词绑定标准音标、最准中文释义及高水准双语听写例句。`);
    } catch (e: any) {
      console.error(e);
      alert(`智能生成失败: ${e.message || "请检查网络或是否配置了有效的 Gemini API 密钥。"}`);
    } finally {
      setAiLoading(false);
      setAiStatusMessage("");
    }
  };

  // Individual item AI Enrich
  const handleAiAutoEnrichSingle = async (targetWord: Word) => {
    setAiLoading(true);
    setAiStatusMessage(`正在为 "${targetWord.word}" 独立生成释义音标及例句...`);

    try {
      const response = await fetch("/api/enrich-words", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ words: [targetWord.word] }),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Gemini enrichment error");
      }

      const enriched = result.data?.[0];
      if (enriched) {
        setWords(prevWords => prevWords.map(w => {
          if (w.id === targetWord.id) {
            return {
              ...w,
              phonetic: enriched.phonetic || w.phonetic,
              translation: enriched.translation || w.translation,
              exampleEn: enriched.exampleEn || w.exampleEn,
              exampleZh: enriched.exampleZh || w.exampleZh
            };
          }
          return w;
        }));
        alert(`"${targetWord.word}" 智能补充成功！已添加 IPA、词义解释以及双语应用场景。`);
      } else {
        throw new Error("Empty enrichment result payload.");
      }
    } catch (err: any) {
      console.error(err);
      alert(`生成出错: ${err.message || "未能联网或 Gemini API 调用失败限制。"}`);
    } finally {
      setAiLoading(false);
      setAiStatusMessage("");
    }
  };

  // Detailed difference highlighter to help users learn from spelling errors
  const renderSpellCheckComparison = (userObj: string, correctObj: string) => {
    const userChars = userObj.toLowerCase().split("");
    const correctChars = correctObj.toLowerCase().split("");

    return (
      <div className="flex flex-col items-center">
        <div id="compare-text-container" className="flex flex-wrap justify-center gap-0.5 mt-2 bg-slate-100 rounded-lg p-3 text-lg font-mono tracking-tight select-all">
          <span className="text-slate-500 font-sans text-xs mr-2 self-center">您的拼写:</span>
          {userChars.length === 0 ? (
            <span className="text-red-500 italic text-sm">空 (Skipped)</span>
          ) : (
            userChars.map((ch, i) => {
              const matched = correctChars[i] === ch;
              return (
                <span key={i} className={`px-0.5 rounded font-bold ${matched ? "text-emerald-600 bg-emerald-50" : "text-red-600 bg-red-100 line-through"}`}>
                  {ch}
                </span>
              );
            })
          )}
        </div>

        <div className="flex flex-wrap justify-center gap-0.5 mt-2 bg-emerald-50 rounded-lg p-3 text-lg font-mono tracking-tight">
          <span className="text-emerald-700 font-sans text-xs mr-2 self-center">正确拼写:</span>
          {correctChars.map((ch, i) => {
            const userCh = userChars[i];
            const isMatch = userCh === ch;
            return (
              <span key={i} className={`px-0.5 rounded font-bold ${isMatch ? "text-emerald-700" : "text-indigo-600 bg-indigo-100 font-extrabold"}`}>
                {ch}
              </span>
            );
          })}
        </div>
      </div>
    );
  };

  // Spaced-repetition mastery scores
  const masteryPercentage = useMemo(() => {
    if (words.length === 0) return 0;
    const totalCorrect = words.reduce((acc, w) => acc + w.correctCount, 0);
    const totalMistakes = words.reduce((acc, w) => acc + w.mistakeCount, 0);
    const sum = totalCorrect + totalMistakes;
    if (sum === 0) return 100; // empty dictations means pristine beginning
    return Math.round((totalCorrect / sum) * 100);
  }, [words]);

  return (
    <div className="flex flex-col h-screen bg-slate-50 font-sans text-slate-800 select-none overflow-hidden">
      
      {/* --- Sleek Design Top Navigation --- */}
      <nav id="navbar" className="h-16 flex items-center justify-between px-8 bg-white border-b border-slate-200">
        <div id="brand" className="flex items-center gap-3">
          <div className="w-9 h-9 bg-indigo-600 rounded-lg flex items-center justify-center shadow-md">
            <span className="text-white font-bold leading-none text-lg">L</span>
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-indigo-950 flex items-center gap-2">
              LinguistAI <span className="text-xs font-normal text-slate-500 bg-slate-100 px-2 py-0.5 rounded">单词智能听写</span>
            </h1>
          </div>
        </div>

        {/* Tab Links */}
        <div id="nav-tabs" className="flex gap-8 items-center">
          <button 
            onClick={() => {
              if (session.status === "testing") {
                if (!window.confirm("正在进行听写，切换面板将退出当前进度的交互卡片。确认切换吗？")) return;
                setSession(prev => ({ ...prev, status: "idle" }));
              }
              setActiveTab("dictation");
            }}
            className={`font-medium pb-1 pt-1 border-b-2 transition text-sm cursor-pointer ${
              activeTab === "dictation" 
                ? "text-indigo-600 border-indigo-600 font-semibold" 
                : "text-slate-500 border-transparent hover:text-indigo-600"
            }`}
          >
            听写操练 (Dictation)
          </button>
          <button 
            onClick={() => {
              if (session.status === "testing") {
                if (!window.confirm("正在进行听写，切换面板将退出当前进度的交互卡片。确认切换吗？")) return;
                setSession(prev => ({ ...prev, status: "idle" }));
              }
              setActiveTab("library");
            }}
            className={`font-medium pb-1 pt-1 border-b-2 transition text-sm cursor-pointer ${
              activeTab === "library" 
                ? "text-indigo-600 border-indigo-600 font-semibold" 
                : "text-slate-500 border-transparent hover:text-indigo-600"
            }`}
          >
            我的词库 (Library)
          </button>
          <button 
            onClick={() => {
              if (session.status === "testing") {
                if (!window.confirm("正在进行听写，进入数据面板将退出当前听写。确认吗？")) return;
                setSession(prev => ({ ...prev, status: "idle" }));
              }
              setActiveTab("insights");
            }}
            className={`font-medium pb-1 pt-1 border-b-2 transition text-sm cursor-pointer ${
              activeTab === "insights" 
                ? "text-indigo-600 border-indigo-600 font-semibold" 
                : "text-slate-500 border-transparent hover:text-indigo-600"
            }`}
          >
            智能分析 (Insights)
          </button>
        </div>

        {/* API key settings, rate info, profile */}
        <div className="flex items-center gap-4">
          {hasApiKey === false && (
            <div className="hidden md:flex items-center gap-1.5 px-3 py-1 bg-amber-50 text-amber-700 rounded-full border border-amber-200 text-xs">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>本地模式 (Gemini key未配置)</span>
            </div>
          )}
          {hasApiKey === true && (
            <div className="hidden md:flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-700 rounded-full border border-emerald-100 text-xs">
              <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
              <span>AI Engine 联结中 (Gemini 3.5)</span>
            </div>
          )}

          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <span className="font-mono">Speed rate:</span>
            <select 
              value={customSpeed} 
              onChange={(e) => setCustomSpeed(parseFloat(e.target.value))}
              className="bg-slate-100 hover:bg-slate-200 border-0 rounded px-1.5 py-0.5 text-slate-700 font-semibold focus:ring-0 focus:outline-none"
            >
              <option value="0.6">慢速 0.6x</option>
              <option value="0.75">适中 0.75x</option>
              <option value="0.85">标准 0.85x</option>
              <option value="1.0">常规级 1.0x</option>
              <option value="1.15">拔高 1.15x</option>
            </select>
          </div>
          
          <div className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-xs font-bold text-slate-600">
            A
          </div>
        </div>
      </nav>

      {/* Loading Cover for batch AI processing */}
      {aiLoading && (
        <div id="ai-loading-shield" className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex flex-col items-center justify-center text-white z-50">
          <div className="bg-white text-slate-800 p-6 rounded-2xl shadow-2xl max-w-md w-full mx-4 flex flex-col items-center text-center">
            <Loader2 className="w-12 h-12 text-indigo-600 animate-spin mb-4" />
            <h4 className="font-bold text-lg text-slate-900">GenAI 智能补全作业中</h4>
            <p className="text-sm text-slate-500 mt-2 leading-relaxed">{aiStatusMessage}</p>
            <p className="text-xs text-indigo-600 mt-3 font-semibold">Gemini 3.5-flash • 极速语音与语义网络</p>
          </div>
        </div>
      )}

      {/* --- Main Content Layout --- */}
      <div className="flex-1 flex overflow-hidden p-6 gap-6">
        
        {/* --- Left Sidebar: Word Collections --- */}
        <aside id="sidebar" className="w-72 bg-white rounded-2xl border border-slate-200 p-5 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
              <BookOpen className="w-4 h-4 text-indigo-600" />
              我的归档词册
            </h2>
            <button 
              onClick={() => setShowNewCollectionInput(!showNewCollectionInput)} 
              className="text-indigo-600 hover:bg-indigo-50 p-1 rounded-md transition"
              title="新建词本"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          {showNewCollectionInput && (
            <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 mb-4 flex flex-col gap-2">
              <input
                type="text"
                placeholder="词单名称, 如: Unit 3"
                value={newCollectionName}
                onChange={(e) => setNewCollectionName(e.target.value)}
                className="w-full text-xs p-2 border border-slate-300 rounded focus:border-indigo-500 bg-white"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateNewCollection();
                }}
              />
              <div className="flex justify-end gap-1.5">
                <button 
                  onClick={() => setShowNewCollectionInput(false)}
                  className="px-2 py-1 text-[10px] text-slate-500 hover:bg-slate-200 rounded"
                >
                  取消
                </button>
                <button 
                  onClick={handleCreateNewCollection}
                  className="px-2.5 py-1 text-[10px] bg-indigo-600 text-white font-semibold rounded hover:bg-indigo-700"
                >
                  创建
                </button>
              </div>
            </div>
          )}

          {/* Special smart presets list */}
          <div className="mb-4">
            <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-2">智能汇总</p>
            <div className="space-y-1">
              <div 
                onClick={() => {
                  setActiveCollectionId("all");
                  if (session.status === "testing") setSession(prev => ({ ...prev, status: "idle" }));
                }}
                className={`flex justify-between items-center p-2 rounded-xl cursor-pointer transition text-xs ${
                  activeCollectionId === "all" 
                    ? "bg-indigo-50 text-indigo-900 font-semibold border border-indigo-100" 
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                <span>🌐 所有总库单词</span>
                <span className="font-mono bg-slate-200/50 text-slate-600 px-1.5 py-0.5 rounded text-[10px]">{words.length}</span>
              </div>

              <div 
                onClick={() => {
                  setActiveCollectionId("starred");
                  if (session.status === "testing") setSession(prev => ({ ...prev, status: "idle" }));
                }}
                className={`flex justify-between items-center p-2 rounded-xl cursor-pointer transition text-xs ${
                  activeCollectionId === "starred" 
                    ? "bg-indigo-50 text-indigo-900 font-semibold border border-indigo-100" 
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                <span>⭐ 双星收藏词</span>
                <span className="font-mono bg-slate-200/50 text-slate-600 px-1.5 py-0.5 rounded text-[10px]">
                  {words.filter(w => w.isStarred).length}
                </span>
              </div>

              <div 
                onClick={() => {
                  setActiveCollectionId("mistaken");
                  if (session.status === "testing") setSession(prev => ({ ...prev, status: "idle" }));
                }}
                className={`flex justify-between items-center p-2 rounded-xl cursor-pointer transition text-xs ${
                  activeCollectionId === "mistaken" 
                    ? "bg-indigo-50 text-indigo-900 font-semibold border border-indigo-100" 
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                <span>❌ 错题累积集</span>
                <span className="font-mono bg-slate-200/50 text-slate-600 px-1.5 py-0.5 rounded text-[10px]">
                  {words.filter(w => w.mistakeCount > 0).length}
                </span>
              </div>
            </div>
          </div>

          {/* User Custom collections list */}
          <div className="flex-1 overflow-y-auto mb-4 border-t border-slate-100 pt-3">
            <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-2">我创建的词册</p>
            {collections.length === 0 ? (
              <p className="text-xs text-slate-400 italic text-center py-4">暂无自设词本</p>
            ) : (
              <div className="space-y-1">
                {collections.map((col) => {
                  // Compute word count of this set
                  const cWords = words.filter(w => col.words.some(cw => cw.word.toLowerCase() === w.word.toLowerCase()));
                  const count = cWords.length;

                  return (
                    <div 
                      key={col.id}
                      className={`group flex items-center justify-between p-2 rounded-xl cursor-pointer transition text-xs ${
                        activeCollectionId === col.id 
                          ? "bg-indigo-50 text-indigo-900 font-semibold border border-indigo-100" 
                          : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                      }`}
                      onClick={() => {
                        setActiveCollectionId(col.id);
                        if (session.status === "testing") setSession(prev => ({ ...prev, status: "idle" }));
                      }}
                    >
                      <span className="truncate max-w-[140px]" title={col.name}>📁 {col.name}</span>
                      <div className="flex items-center gap-1">
                        <span className="font-mono bg-slate-200/50 text-slate-600 px-1.5 py-0.5 rounded text-[10px]">{count}</span>
                        {!col.isDefault && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteCollection(col.id, col.name);
                            }}
                            className="hidden group-hover:block text-slate-400 hover:text-red-500 transition px-1"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Buttons to quick upload */}
          <div className="pt-4 border-t border-slate-100 space-y-2">
            <button 
              onClick={() => setShowPhotoUploader(true)}
              className="w-full py-2.5 px-3 bg-indigo-600 text-white rounded-xl text-xs font-semibold hover:bg-indigo-700 transition shadow-sm flex items-center justify-center gap-1.5"
            >
              <FileImage className="w-4 h-4" />
              上传照片智能识词
            </button>
            <button 
              onClick={() => setShowFileImporter(true)}
              className="w-full py-2 px-3 border border-slate-200 text-slate-700 hover:text-indigo-600 rounded-xl text-xs font-semibold hover:bg-slate-50 transition flex items-center justify-center gap-1.5"
            >
              <FileText className="w-4 h-4 text-slate-500" />
              网页/文件/CSV导入
            </button>
          </div>
        </aside>

        {/* --- Center: Dynamic Working Area --- */}
        <main className="flex-1 flex flex-col min-w-0">
          
          {/* TAB 1: Dictation Studio */}
          {activeTab === "dictation" && (
            <div className="flex-1 flex flex-col bg-white rounded-3xl border border-slate-200 relative overflow-hidden">
              
              {/* Pre-start setup screen */}
              {session.status === "idle" && (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center max-w-2xl mx-auto">
                  <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mb-6">
                    <Volume2 className="w-8 h-8 animate-bounce" />
                  </div>
                  <h2 className="text-2xl font-bold tracking-tight text-slate-900 mb-2">
                    拼写/听写自测中心
                  </h2>
                  <p className="text-sm text-slate-500 leading-relaxed mb-6">
                    当前备考词册: <span className="font-semibold text-indigo-600">
                      {activeCollectionId === "all" ? "所有总库" : 
                       activeCollectionId === "starred" ? "双星收藏" : 
                       activeCollectionId === "mistaken" ? "错题累积编" : 
                       collections.find(c => c.id === activeCollectionId)?.name}
                    </span> (共包含 <span className="font-bold underline">{filteredWords.length}</span> 个可用单词)。
                    选择下方模式，即可自主发起循环自测，AI 配套实时音标释义，助您告别死记硬背。
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full max-w-xl">
                    <button 
                      onClick={() => handleStartDictation("audio")}
                      className="bg-white border-2 border-slate-200 hover:border-indigo-500 rounded-2xl p-5 text-left transition hover:shadow-lg hover:shadow-indigo-50"
                    >
                      <div className="w-8 h-8 bg-indigo-50 text-indigo-600 rounded-lg flex items-center justify-center mb-3">
                        🔊
                      </div>
                      <h4 className="font-bold text-slate-800 text-sm mb-1">听音辩词 (Audio)</h4>
                      <p className="text-xs text-slate-400">只播放标准发音，耳熟即能拼，培养纯正语感。</p>
                    </button>

                    <button 
                      onClick={() => handleStartDictation("visual")}
                      className="bg-white border-2 border-slate-200 hover:border-indigo-500 rounded-2xl p-5 text-left transition hover:shadow-lg hover:shadow-indigo-50"
                    >
                      <div className="w-8 h-8 bg-amber-50 text-amber-600 rounded-lg flex items-center justify-center mb-3">
                        👁️
                      </div>
                      <h4 className="font-bold text-slate-800 text-sm mb-1">看汉默英 (Visual)</h4>
                      <p className="text-xs text-slate-400">给出中文核心词义及现代标准音标，拼写出对应英文。</p>
                    </button>

                    <button 
                      onClick={() => handleStartDictation("sentence_gap")}
                      className="bg-white border-2 border-slate-200 hover:border-indigo-500 rounded-2xl p-5 text-left transition hover:shadow-lg hover:shadow-indigo-50"
                    >
                      <div className="w-8 h-8 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center mb-3">
                        ✍️
                      </div>
                      <h4 className="font-bold text-slate-800 text-sm mb-1">例句空白听写 (Gap)</h4>
                      <p className="text-xs text-slate-400">结合整句双语语境和空白听写，深入理解实际运用。</p>
                    </button>
                  </div>

                  {filteredWords.length === 0 && (
                    <div className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-xl px-4 py-3 mt-8 flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                      当前词汇册为空。请先通过右侧或左下角“上传照片”或“导入文件”进行单词导入。
                    </div>
                  )}
                </div>
              )}

              {/* Dictation interactive testing board */}
              {session.status === "testing" && currentDictationWord && (
                <div className="flex-1 flex flex-col items-center justify-center p-8 md:p-12">
                  
                  {/* Progress Line */}
                  <div className="absolute top-0 left-0 w-full h-1.5 bg-slate-100">
                    <div 
                      className="bg-indigo-500 h-full transition-all duration-300" 
                      style={{ width: `${((session.currentIndex) / session.wordIds.length) * 100}%` }}
                    ></div>
                  </div>

                  <div className="absolute top-6 left-8 flex items-center gap-2">
                    <button 
                      onClick={handleQuitSession}
                      className="text-xs font-semibold text-slate-400 hover:text-red-500 transition flex items-center gap-1 px-2.5 py-1 hover:bg-slate-50 rounded"
                    >
                      ← 退出听写
                    </button>
                  </div>

                  <div className="absolute top-6 right-8 text-xs font-semibold text-slate-400">
                    进度: {session.currentIndex + 1} / {session.wordIds.length} 词
                  </div>

                  {/* Testing Card Content */}
                  <div className="w-full max-w-xl text-center flex flex-col items-center justify-center">
                    
                    {/* Dictation Modes Specific Hints */}
                    {session.mode === "audio" && (
                      <div className="flex flex-col items-center">
                        <span className="px-3 py-1 bg-indigo-50 text-indigo-700 text-[10px] font-bold rounded-full uppercase tracking-wider mb-6">
                          听音辨词模式
                        </span>
                        
                        <button 
                          onClick={handleRepeatVoice}
                          className="w-20 h-20 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center hover:bg-indigo-100 transition shadow-md hover:scale-105 active:scale-95 duration-150 mb-4"
                          title="点击发音"
                        >
                          <Volume2 className="w-10 h-10" />
                        </button>
                        <p className="text-xs text-slate-400 mb-6">点击或按 Enter 可重复播放听力</p>

                        {/* Clue button: reveal translation placeholder */}
                        {isAnswerRevealed ? (
                          <div className="mb-4">
                            <span className="text-xs text-slate-400 font-mono block mb-1">国际音标 / 释义:</span>
                            <p className="text-sm font-semibold text-slate-700">{currentDictationWord.phonetic || "未补全音标"}</p>
                            <p className="text-sm font-medium text-indigo-700 mt-1">{currentDictationWord.translation || "未补全释义"}</p>
                          </div>
                        ) : (
                          <div className="flex gap-2">
                            <span className="text-xs text-slate-400 bg-slate-100 px-2.5 py-1 rounded">释义已隐藏</span>
                          </div>
                        )}
                      </div>
                    )}

                    {session.mode === "visual" && (
                      <div className="w-full">
                        <span className="px-3 py-1 bg-amber-50 text-amber-700 text-[10px] font-bold rounded-full uppercase tracking-wider mb-6 inline-block">
                          看译拼词模式
                        </span>
                        
                        <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100 mb-6">
                          <span className="text-[10px] font-bold text-slate-400 tracking-wider uppercase block mb-1">
                            中文含义
                          </span>
                          <h3 className="text-xl font-bold text-slate-800 leading-normal mb-2">
                            {currentDictationWord.translation || "暂无翻译内容，可在库中一键补充"}
                          </h3>
                          {currentDictationWord.phonetic && (
                            <p className="text-sm font-mono text-slate-400 italic">
                              音标: {currentDictationWord.phonetic}
                            </p>
                          )}
                        </div>

                        <button 
                          onClick={handleRepeatVoice}
                          className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-xs font-semibold inline-flex items-center gap-1 transition mb-6"
                        >
                          <Volume2 className="w-3.5 h-3.5" /> 听发音提示
                        </button>
                      </div>
                    )}

                    {session.mode === "sentence_gap" && (
                      <div className="w-full">
                        <span className="px-3 py-1 bg-emerald-50 text-emerald-700 text-[10px] font-bold rounded-full uppercase tracking-wider mb-6 inline-block">
                          例句挖空听写模式
                        </span>

                        <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100 mb-6 text-left">
                          <span className="text-[10px] font-bold text-slate-400 tracking-wider uppercase block mb-2">
                            语境例句 FILL-IN-THE-BLANK
                          </span>
                          <p className="text-lg text-slate-700 italic font-serif leading-relaxed" id="sentence-text">
                            "{sentenceBlanked}"
                          </p>
                          
                          <div className="mt-4 pt-3 border-t border-slate-200/60">
                            <span className="text-[10px] font-bold text-slate-400 tracking-wider uppercase block mb-0.5">
                              例句翻译
                            </span>
                            <p className="text-xs text-slate-500 leading-relaxed">
                              {currentDictationWord.exampleZh || "未提供例句，可通过 AI 联网一键补全"}
                            </p>
                          </div>
                        </div>

                        <div className="flex gap-2 justify-center mb-6">
                          <button 
                            onClick={handleRepeatVoice}
                            className="px-3 py-1 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded-lg text-xs font-semibold inline-flex items-center gap-1 transition"
                          >
                            <Volume2 className="w-3.5 h-3.5" /> 听长句整音
                          </button>
                          <button 
                            onClick={handlePronounceIsolated}
                            className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-xs font-semibold inline-flex items-center gap-1 transition"
                          >
                            <Volume2 className="w-3.5 h-3.5 animate-pulse" /> 独听单词音
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Submit spelling field */}
                    <div className="w-full mt-4">
                      {isAnswerRevealed ? (
                        <div id="result-view" className="space-y-4">
                          {/* Checked evaluation */}
                          <div className="flex justify-center items-center gap-2">
                            {session.results[currentDictationWord.id] === "correct" ? (
                              <div className="flex items-center gap-1 py-1.5 px-4 bg-emerald-50 text-emerald-700 rounded-full border border-emerald-100 font-bold text-sm">
                                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                                <span>答对啦！</span>
                              </div>
                            ) : session.results[currentDictationWord.id] === "skipped" ? (
                              <div className="flex items-center gap-1 py-1.5 px-4 bg-slate-100 text-slate-600 rounded-full font-bold text-sm">
                                <HelpCircle className="w-4 h-4 text-slate-500" />
                                <span>跳过</span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1 py-1.5 px-4 bg-red-50 text-red-700 rounded-full border border-red-100 font-bold text-sm animate-shake">
                                <XCircle className="w-4 h-4 text-red-600" />
                                <span>拼写错误</span>
                              </div>
                            )}
                          </div>

                          {/* Comparisons */}
                          {renderSpellCheckComparison(session.answers[currentDictationWord.id] || "", currentDictationWord.word)}

                          {/* Secondary info details */}
                          <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 mt-2 text-left">
                            <span className="text-[10px] font-bold text-slate-400 block mb-0.5">词汇卡片详情:</span>
                            <p className="text-sm font-bold text-slate-800">{currentDictationWord.word} <span className="text-xs font-mono font-normal text-slate-500">{currentDictationWord.phonetic}</span></p>
                            <p className="text-xs text-slate-600 mt-1">{currentDictationWord.translation}</p>
                            
                            {currentDictationWord.exampleEn && (
                              <div className="mt-2.5 pt-2 border-t border-slate-200/50 text-xs">
                                <p className="italic text-slate-500 font-serif">"{currentDictationWord.exampleEn}"</p>
                                <p className="text-slate-400 mt-0.5">{currentDictationWord.exampleZh}</p>
                              </div>
                            )}
                          </div>

                          {/* Core flow forward action button */}
                          <div className="pt-4 flex justify-between items-center bg-slate-50/50 p-3 rounded-xl border border-slate-100">
                            <button
                              onClick={() => handleToggleStar(currentDictationWord.id)}
                              className={`p-2.5 rounded-lg border transition ${
                                currentDictationWord.isStarred 
                                  ? "bg-amber-50 border-amber-200 text-amber-500" 
                                  : "border-slate-200 text-slate-400 hover:text-amber-500 hover:bg-slate-50"
                              }`}
                              title={currentDictationWord.isStarred ? "取消收藏" : "收藏该词"}
                            >
                              <Star className="w-5 h-5 fill-current" />
                            </button>

                            <button
                              onClick={handleNextWord}
                              className="px-8 py-3 bg-indigo-600 text-white font-bold rounded-xl shadow-lg shadow-indigo-100 hover:bg-indigo-700 active:bg-indigo-800 transition flex items-center gap-1"
                            >
                              {session.currentIndex + 1 >= session.wordIds.length ? "完成自测" : "下一词 (Next)"} 
                              <ArrowRight className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="relative">
                          <input 
                            type="text" 
                            ref={textInputRef}
                            value={typingAnswer}
                            onChange={(e) => setTypingAnswer(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleSubmitAnswer();
                            }}
                            placeholder="请在这里拼写英文单词并敲击回车 Enter..." 
                            className="w-full text-2xl text-center py-4 px-6 border-b-2 border-slate-300 focus:border-indigo-500 focus:outline-none bg-transparent transition-all font-mono tracking-wide"
                            autoComplete="off"
                            autoCapitalize="off"
                            autoCorrect="off"
                            spellCheck="false"
                          />
                          <div className="mt-4 flex justify-between items-center text-xs text-slate-400">
                            <button 
                              onClick={handleSkipWord}
                              className="hover:text-amber-600 px-2 py-1 hover:bg-amber-50 rounded"
                            >
                              暂时跳过该词 (Skip)
                            </button>
                            <div className="flex items-center gap-1.5 font-mono">
                              <span>按 <b>Enter</b> 提交判定</span>
                            </div>
                            <button 
                              onClick={handleSubmitAnswer}
                              className="font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 px-3 py-1 rounded"
                            >
                              提交拼写
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                  </div>
                </div>
              )}

              {/* Dictation completed statistics summary dashboard */}
              {session.status === "finished" && (
                <div id="stats-dashboard" className="flex-1 flex flex-col items-center justify-center p-8 text-center max-w-xl mx-auto">
                  <div className="w-20 h-20 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mb-6 shadow-md">
                    <CheckCircle2 className="w-10 h-10" />
                  </div>
                  <h2 className="text-2xl font-bold tracking-tight text-slate-900 mb-1">
                    完成自测操练！
                  </h2>
                  <p className="text-xs text-slate-400 mb-6 font-mono">
                    测试范围: {activeCollectionId === "all" ? "总词单" : "特定词组归档"}
                  </p>

                  {/* Summary of statistics counts */}
                  <div className="grid grid-cols-3 gap-3 w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 mb-6">
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 block">测试词数</span>
                      <span className="text-2xl font-extrabold text-slate-800 font-mono">{session.wordIds.length}</span>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 block text-emerald-600">正确数量</span>
                      <span className="text-2xl font-extrabold text-emerald-600 font-mono">
                        {Object.values(session.results).filter(v => v === "correct").length}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 block text-red-500">拼错/跳过</span>
                      <span className="text-2xl font-extrabold text-red-500 font-mono">
                        {Object.values(session.results).filter(v => v === "incorrect" || v === "skipped").length}
                      </span>
                    </div>
                  </div>

                  {/* Detail outcomes listings */}
                  <div className="w-full text-left max-h-[160px] overflow-y-auto mb-6 bg-slate-50 p-2.5 rounded-lg border border-slate-100 space-y-1.5 shadow-inner">
                    <p className="text-[10px] font-bold text-slate-400 tracking-wider">结果词单:</p>
                    {session.wordIds.map((id, index) => {
                      const matchedW = words.find(w => w.id === id);
                      if (!matchedW) return null;
                      const resVal = session.results[id];
                      return (
                        <div key={id} className="flex justify-between items-center text-xs pb-1 border-b border-slate-200/40 last:border-0">
                          <span className="font-semibold text-slate-700">
                            {index + 1}. <span className="font-mono">{matchedW.word}</span>
                          </span>
                          <span className="text-[11px] text-slate-400 max-w-[200px] truncate">{matchedW.translation}</span>
                          <div>
                            {resVal === "correct" ? (
                              <span className="text-[10px] text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded font-bold">✓ 对</span>
                            ) : resVal === "skipped" ? (
                              <span className="text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded font-bold">跳过</span>
                            ) : (
                              <span className="text-[10px] text-red-500 bg-red-50 px-1.5 py-0.5 rounded font-bold">
                                ✗错: {session.answers[id] || "空"}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex flex-col sm:flex-row gap-3 w-full">
                    <button
                      onClick={handleRestartFailedWordsOnly}
                      className="flex-1 py-3 bg-amber-500 text-white font-bold rounded-xl hover:bg-amber-600 transition flex items-center justify-center gap-1 text-sm shadow-md"
                    >
                      <RotateCcw className="w-4 h-4" /> 吃透错题 (错词复测)
                    </button>
                    <button
                      onClick={handleRestartFullSessionAgain}
                      className="flex-1 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition flex items-center justify-center gap-1 text-sm shadow-md"
                    >
                      <RefreshCw className="w-4 h-4" /> 重新测一遍当前包
                    </button>
                    <button
                      onClick={() => setSession(prev => ({ ...prev, status: "idle" }))}
                      className="flex-1 py-3 border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 font-bold transition text-sm"
                    >
                      关闭并返回
                    </button>
                  </div>
                </div>
              )}

            </div>
          )}

          {/* TAB 2: Library Dictionary Table view */}
          {activeTab === "library" && (
            <div className="flex-1 flex flex-col bg-white rounded-3xl border border-slate-200 overflow-hidden">
              
              {/* Header inside library */}
              <div className="p-5 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50/50">
                <div>
                  <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
                    词库内容管理: 
                    <span className="text-indigo-600 underline">
                      {activeCollectionId === "all" ? "全部核心词库" : 
                       activeCollectionId === "starred" ? "双星收藏" : 
                       activeCollectionId === "mistaken" ? "错题本" : 
                       collections.find(c => c.id === activeCollectionId)?.name}
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">
                    当前分类下包含 <span className="font-bold text-slate-800">{filteredWords.length}</span> 个单词。
                    支持自由录入、对释义不完整项发起智能 AI 进行双语例句与音标生成。
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={handleAiAutoEnrichAll}
                    className="py-1.5 px-3 bg-indigo-50 border border-indigo-100 hover:bg-indigo-100 text-indigo-700 text-xs font-bold rounded-xl flex items-center gap-1.5 transition"
                    title="自动通过 AI 帮助所有音标、翻译、和例句都是空白的单词生成细节内容"
                  >
                    <Sparkles className="w-3.5 h-3.5" /> Bulk AI Auto-Enrich (智能批量生成)
                  </button>

                  <button
                    onClick={handleAddNewWordClick}
                    className="py-1.5 px-3 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition shadow"
                  >
                    <Plus className="w-4 h-4" /> 新增单词
                  </button>
                </div>
              </div>

              {/* Grid content inside list */}
              <div className="flex-1 overflow-y-auto">
                {filteredWords.length === 0 ? (
                  <div className="flex flex-col items-center justify-center p-12 text-center text-slate-400">
                    <BookOpen className="w-12 h-12 text-slate-300 mb-2" />
                    <p className="text-sm font-semibold">当前目录下暂时没有单词哦</p>
                    <p className="text-xs text-slate-400 max-w-sm mt-1">
                      您可在左侧点击“新建词本”，或者点击照片提取和导入文本直接增加词汇。
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {filteredWords.map((item, index) => {
                      const completeStatus = !!(item.phonetic && item.exampleEn && item.translation);

                      return (
                        <div 
                          key={item.id} 
                          className="p-4 hover:bg-indigo-50/10 transition flex flex-col md:flex-row md:items-start gap-4"
                        >
                          {/* Col 1: Word detail */}
                          <div className="md:w-52 flex-shrink-0 min-w-0">
                            <div className="flex items-center gap-2">
                              <button 
                                onClick={() => handleToggleStar(item.id)}
                                className="text-slate-300 hover:text-amber-500 transition"
                              >
                                <Star className={`w-4 h-4 ${item.isStarred ? "text-amber-500 fill-current" : ""}`} />
                              </button>
                              
                              <h4 className="font-bold text-slate-800 text-base font-mono truncate">{item.word}</h4>
                            </div>

                            {item.phonetic ? (
                              <p className="text-xs font-mono text-slate-500 mt-1 italic tracking-tight">{item.phonetic}</p>
                            ) : (
                              <span className="text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded font-semibold mt-1 inline-block">
                                Lacks Pronunciation
                              </span>
                            )}

                            {/* Self pronounce button mini */}
                            <button
                              onClick={() => playSpeech(item.word)}
                              className="text-indigo-600 hover:text-indigo-800 text-[11px] font-semibold mt-2.5 inline-flex items-center gap-1"
                            >
                              🔊 试听发音
                            </button>
                          </div>

                          {/* Col 2: Translation definition & Context */}
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-slate-800 bg-slate-50 inline-block px-2.5 py-1 rounded-lg border border-slate-100 max-h-[80px] overflow-y-auto">
                              {item.translation || "释义未补充（AI 正在待命，支持一键补全）"}
                            </div>

                            {item.exampleEn ? (
                              <div className="mt-3 bg-indigo-50/10 border-l-2 border-indigo-400 p-2 text-xs rounded-r-lg space-y-1">
                                <p className="italic font-serif text-slate-600 leading-relaxed font-semibold">"{item.exampleEn}"</p>
                                <p className="text-slate-400">{item.exampleZh}</p>
                              </div>
                            ) : (
                              <div className="text-[11px] text-slate-400 italic mt-3 flex items-center gap-1 bg-slate-50 p-2 rounded">
                                <Info className="w-3.5 h-3.5" /> 暂无关联听写例句。AI 自动补全可提供沉浸式例句。
                              </div>
                            )}
                          </div>

                          {/* Col 3: Dictation statistics & Control triggers */}
                          <div className="md:w-44 flex-shrink-0 flex md:flex-col justify-between items-end gap-2 text-xs">
                            <div className="text-right">
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">听写统计</span>
                              <div className="flex gap-2 items-center mt-1">
                                <span className="bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded font-mono" title="正确次数">✓{item.correctCount || 0}</span>
                                <span className="bg-red-50 text-red-600 px-1.5 py-0.5 rounded font-mono" title="拼错次数">✗{item.mistakeCount || 0}</span>
                                {(item.correctCount > 0 || item.mistakeCount > 0) && (
                                  <button 
                                    onClick={() => handleResetWordStats(item.id)}
                                    className="text-slate-400 hover:text-indigo-600 rounded px-1"
                                    title="重置统计"
                                  >
                                    ↷
                                  </button>
                                )}
                              </div>
                            </div>

                            <div className="flex gap-1.5 mt-2">
                              {!completeStatus && (
                                <button
                                  onClick={() => handleAiAutoEnrichSingle(item)}
                                  className="p-1 text-indigo-600 hover:bg-indigo-50 border border-indigo-200 rounded"
                                  title="AI 信息智能补全 (IPA & 例句)"
                                >
                                  <Sparkles className="w-3.5 h-3.5" />
                                </button>
                              )}
                              <button
                                onClick={() => handleEditClick(item)}
                                className="p-1 text-slate-500 hover:bg-slate-100 border border-slate-200 rounded"
                                title="手动编辑"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteWord(item.id, item.word)}
                                className="p-1 text-red-500 hover:bg-red-50 border border-red-100 rounded"
                                title="除名单词"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: Insights Smart statistics dashboard views */}
          {activeTab === "insights" && (
            <div className="flex-1 bg-white rounded-3xl border border-slate-200 p-8 overflow-y-auto">
              <div>
                <h3 className="text-xl font-bold text-slate-900 mb-1">
                  备考智能分析 (LinguistAI Insights)
                </h3>
                <p className="text-xs text-slate-500 leading-relaxed mb-6">
                  自动汇总您的历史拼写精确度数据、发掘弱势痛点词，结合艾宾浩斯抗遗忘记忆理论设计。
                </p>
              </div>

              {/* Bento Grid Analytics */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                
                {/* Visual Circle gauge mockup */}
                <div className="border border-slate-200 rounded-2xl p-6 flex flex-col items-center justify-center text-center bg-indigo-900 text-white relative overflow-hidden">
                  <div className="relative z-10 w-full flex flex-col items-center">
                    <span className="text-xs text-indigo-200 block mb-2 tracking-wider">首拼联结正确率 (Accuracy)</span>
                    <div className="w-24 h-24 rounded-full border-4 border-emerald-400 bg-indigo-950 flex items-center justify-center mb-3 shadow">
                      <span className="text-2xl font-extrabold font-mono tracking-tighter">{masteryPercentage}%</span>
                    </div>
                    <p className="text-[11px] text-indigo-300">
                      基准词库已完成自测平均成功率。
                    </p>
                  </div>
                  {/* Backdrop shapes */}
                  <div className="absolute -bottom-10 -right-10 w-32 h-32 bg-indigo-700 rounded-full opacity-20"></div>
                </div>

                <div className="border border-slate-200 rounded-2xl p-6 flex flex-col bg-white">
                  <span className="text-xs text-slate-400 block mb-2 tracking-wider">词本掌握分度 (Summary)</span>
                  
                  <div className="space-y-3 flex-1 flex flex-col justify-center">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-500">词本库储备英文词</span>
                      <span className="font-bold underline font-mono text-slate-800">{words.length} 词</span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-100 rounded-full">
                      <div className="h-full bg-indigo-600 rounded-full" style={{ width: `${Math.min(100, words.length * 2)}%` }}></div>
                    </div>

                    <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-500">高频拼错弱项词 (Mistakes)</span>
                      <span className="font-bold text-red-500 font-mono">
                        {words.filter(w => w.mistakeCount > 0).length} 词
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-100 rounded-full">
                      <div className="h-full bg-red-400 rounded-full" style={{ width: `${(words.filter(w => w.mistakeCount > 0).length / Math.max(1, words.length)) * 100}%` }}></div>
                    </div>
                  </div>
                </div>

                <div className="border border-emerald-100 bg-emerald-50 rounded-2xl p-6 flex flex-col">
                  <h4 className="font-bold text-emerald-900 text-sm mb-1">
                    📖 艾宾浩斯抗遗忘小贴士
                  </h4>
                  <p className="text-xs text-emerald-700 italic leading-relaxed flex-1 mt-2">
                    "在初次记忆单词后，第20分钟、1小时、第9小时、1天和第2天是科学重复遗忘的敏感警戒期。定期通过本软件的<b>“吃透错题”</b>听写，能将短期拼写记忆快速固化为深层长期词汇储备！"
                  </p>
                  <p className="text-[10px] text-emerald-600 mt-4 font-bold uppercase">Spaced Repetition Practice</p>
                </div>
              </div>

              {/* Hardest Words table warning listings */}
              <div className="border border-slate-200 rounded-xl p-5">
                <div className="flex justify-between items-center mb-4 pb-2 border-b border-slate-100">
                  <h4 className="font-bold text-slate-800 text-sm flex items-center gap-1.5">
                    <AlertTriangle className="text-red-500 w-4 h-4" />
                    我的高频拼错词 (攻坚清单)
                  </h4>
                  <span className="text-xs text-slate-500">按拼错次数倒序排列</span>
                </div>

                {words.filter(w => w.mistakeCount > 0).length === 0 ? (
                  <p className="text-xs text-slate-400 italic text-center py-6">
                    暂无错词历史记录！说明您的听写表现优异，继续保持。
                  </p>
                ) : (
                  <div className="space-y-2">
                    {words
                      .filter(w => w.mistakeCount > 0)
                      .sort((a, b) => b.mistakeCount - a.mistakeCount)
                      .slice(0, 10)
                      .map((w, index) => {
                        return (
                          <div key={w.id} className="p-3 bg-red-50/20 rounded-xl flex items-center justify-between text-xs border border-red-100/30">
                            <div className="flex items-center gap-3">
                              <span className="font-bold text-red-600 font-mono">#{index + 1}</span>
                              <div>
                                <h5 className="font-bold text-slate-800 font-mono text-sm">{w.word}</h5>
                                <p className="text-slate-500 text-[11px] truncate max-w-sm">{w.translation}</p>
                              </div>
                            </div>

                            <div className="text-right flex items-center gap-2">
                              <span className="text-slate-500">拼错:</span>
                              <span className="text-red-600 font-extrabold font-mono text-sm bg-red-50 rounded px-2.5 py-0.5">
                                {w.mistakeCount} 次
                              </span>
                            </div>
                          </div>
                        );
                      })
                    }
                  </div>
                )}
              </div>

            </div>
          )}

        </main>

        {/* --- Right Sidebar: Dynamic Study Widget tips --- */}
        <aside id="right-panel" className="w-80 flex flex-col gap-6">
          
          {/* Quick instructions widget */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <h3 className="font-extrabold text-slate-900 text-sm mb-3">使用流程指南</h3>
            <div className="space-y-4">
              <div className="flex gap-3 text-xs">
                <div className="w-5 h-5 rounded-full bg-indigo-50 text-indigo-600 font-bold flex items-center justify-center flex-shrink-0 mt-0.5 font-mono">
                  1
                </div>
                <p className="text-slate-600 leading-relaxed">
                  在左边选择<b>建个词单</b>，或直接在现有词组内录入生词。
                </p>
              </div>

              <div className="flex gap-3 text-xs">
                <div className="w-5 h-5 rounded-full bg-indigo-50 text-indigo-600 font-bold flex items-center justify-center flex-shrink-0 mt-0.5 font-mono">
                  2
                </div>
                <p className="text-slate-600 leading-relaxed">
                  点击<b>导入文件</b>（行分割，逗号或横杠分割释义），或者直接<b>拍照识别提取</b>（支持照片OCR识别）。
                </p>
              </div>

              <div className="flex gap-3 text-xs">
                <div className="w-5 h-5 rounded-full bg-indigo-50 text-indigo-600 font-bold flex items-center justify-center flex-shrink-0 mt-0.5 font-mono">
                  3
                </div>
                <p className="text-slate-600 leading-relaxed">
                  点击高级的<b>批量智能补全</b>。Gemini API 自动为刚导入的只有单词的词单添加国际 DJ 语法音标、中英结合真实听写场景例句。
                </p>
              </div>

              <div className="flex gap-3 text-xs">
                <div className="w-5 h-5 rounded-full bg-indigo-50 text-indigo-600 font-bold flex items-center justify-center flex-shrink-0 mt-0.5 font-mono">
                  4
                </div>
                <p className="text-slate-600 leading-relaxed">
                  点击听写模式，在<b>听音辨词 / 挖空听写</b>间一键开战，并在拼错后可清晰比较拼写字母错误点。
                </p>
              </div>
            </div>
          </div>

          {/* Quick study metrics stats card */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
            <h3 className="font-extrabold text-slate-900 text-sm mb-3 flex items-center gap-1">
              <Activity className="w-4 h-4 text-emerald-500" />
              当前阶段性数据
            </h3>
            <div className="grid grid-cols-2 gap-2 text-center text-xs">
              <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                <span className="text-slate-400 text-[10px] block font-bold">听写储备词</span>
                <span className="text-lg font-extrabold text-slate-800 font-mono mt-0.5 block">{words.length}</span>
              </div>
              <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                <span className="text-slate-400 text-[10px] block font-bold">收藏夹</span>
                <span className="text-lg font-extrabold text-amber-500 font-mono mt-0.5 block">
                  {words.filter(w => w.isStarred).length}
                </span>
              </div>
            </div>
            
            {/* Quick action: Clear database completely to restore defaults */}
            <div className="mt-4 pt-3 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => {
                  if (window.confirm("确定要删除所有自定义生词并恢复系统默认词库吗？此操作无法撤销。")) {
                    localStorage.removeItem("dictation_words_v1");
                    localStorage.removeItem("dictation_collections_v1");
                    setWords(DEFAULT_WORDS);
                    setCollections([
                      { id: "col-default", name: "GRE/日常核心词汇", words: DEFAULT_WORDS, createdTime: Date.now(), isDefault: true }
                    ]);
                    alert("词库已被恢复为系统出厂初始化默认状态。");
                  }
                }}
                className="text-[10px] text-red-500 hover:underline hover:text-red-700 font-medium transition cursor-pointer"
              >
                清空数据恢复预设词
              </button>
            </div>
          </div>

          {/* AI Info details */}
          <div className="bg-slate-900 text-white rounded-2xl p-5 shadow-inner relative overflow-hidden">
            <div className="relative z-10">
              <div className="flex items-center gap-1.5 mb-2 text-indigo-200">
                <Sparkles className="w-4 h-4 text-indigo-400 animate-pulse" />
                <span className="text-[11px] font-bold tracking-wider uppercase">AI Word Integration</span>
              </div>
              <h4 className="font-bold text-sm text-white">Gemini 零延迟分析</h4>
              <p className="text-[11px] text-slate-300 leading-relaxed mt-1">
                采用 Gemini 3.5 视觉与语义理解引擎，可以自动识别分析导入图像中潦草的字母，并以纯净标准的 JSON 结果格式返回入账。
              </p>
            </div>
            <div className="absolute -bottom-10 -right-10 w-28 h-28 bg-indigo-700/30 rounded-full blur-lg"></div>
          </div>

        </aside>

      </div>

      {/* --- FLOATING OVERLAY DIALOG MODAL 1: OCR Photo upload --- */}
      {showPhotoUploader && (
        <PhotoOcrUploader 
          onImportWords={handleImportedOcrWords}
          onClose={() => setShowPhotoUploader(false)}
        />
      )}

      {/* --- FLOATING OVERLAY DIALOG MODAL 2: Text paste CSV file importer --- */}
      {showFileImporter && (
        <div id="file-importer-container" className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div id="file-importer-modal" className="bg-white rounded-2xl shadow-2xl w-full max-w-xl flex flex-col overflow-hidden animate-fade-in">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <div>
                <h3 className="font-bold text-slate-900 text-base">
                  输入单词文本 / 导入 CSV / 本地文件
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  支持每行录入一个词，或用逗号等符号将 英文和汉语翻译隔开导入：
                </p>
              </div>
              <button 
                onClick={() => setShowFileImporter(false)}
                className="text-slate-400 hover:text-slate-600 font-sans text-xl px-2"
              >
                ×
              </button>
            </div>

            <div className="p-6 flex flex-col gap-4">
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-[11px] text-slate-500 leading-relaxed font-mono">
                示例格式A（单列单词，支持后续AI补全）:<br />
                <b>challenge</b><br />
                <b>accomplish</b><br /><br />
                示例格式B（逗号CSV，包含释义及音标词库）:<br />
                <b>challenge, n.挑战, /ˈtʃæl.ɪndʒ/, Example sentence, 翻译例句</b>
              </div>

              <textarea
                rows={8}
                placeholder="请把你的自定义词汇包复制粘贴到此输入框，每行代表一个单词记录..."
                value={importedText}
                onChange={(e) => setImportedText(e.target.value)}
                className="w-full text-xs p-3 border border-slate-300 rounded-xl focus:border-indigo-500 focus:outline-none bg-slate-50/50"
              />

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  onClick={() => setShowFileImporter(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  取消
                </button>
                <button
                  onClick={handleProcessTextImport}
                  className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-md"
                >
                  确认解析并导入
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- FLOATING OVERLAY DIALOG MODAL 3: Manual Word Add / Edit Form Dialog --- */}
      {showAddWordModal && (
        <div id="word-modal-container" className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div id="word-modal" className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
              <h3 className="font-bold text-slate-900 text-sm">
                {editingWord ? `手动编辑单词: ${editingWord.word}` : "添加新单词入词单"}
              </h3>
              <button 
                onClick={() => {
                  setShowAddWordModal(false);
                  setEditingWord(null);
                  clearWordForm();
                }}
                className="text-slate-400 hover:text-slate-600"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSaveWordForm} className="p-6 space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-500 block mb-1">英文单词 *</label>
                <input
                  type="text"
                  required
                  placeholder="如: opportunity"
                  value={formWord}
                  onChange={(e) => setFormWord(e.target.value)}
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-lg bg-slate-50/50 focus:border-indigo-400 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-500 block mb-1">音标 (Phonetic Symbol)</label>
                  <input
                    type="text"
                    placeholder="如: /ˌɒp.əˈtʃuː.nə.ti/"
                    value={formPhonetic}
                    onChange={(e) => setFormPhonetic(e.target.value)}
                    className="w-full text-xs p-2.5 border border-slate-300 rounded-lg bg-slate-50/50 focus:border-indigo-400"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 block mb-1">中文翻译释义 (Chinese Translation)</label>
                  <input
                    type="text"
                    placeholder="如: n. 机会，时机，良机"
                    value={formTranslation}
                    onChange={(e) => setFormTranslation(e.target.value)}
                    className="w-full text-xs p-2.5 border border-slate-300 rounded-lg bg-slate-50/50 focus:border-indigo-400"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-500 block mb-1">对应英文听写用例句 (Example Sentence)</label>
                <textarea
                  rows={2}
                  placeholder="如: Studying abroad is a wonderful opportunity to learn."
                  value={formExampleEn}
                  onChange={(e) => setFormExampleEn(e.target.value)}
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-lg bg-slate-50/50 focus:border-indigo-400 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-500 block mb-1">例句中文翻译 (Sentence Translation)</label>
                <textarea
                  rows={2}
                  placeholder="如: 出国留学是了解新知识的一个极好机会。"
                  value={formExampleZh}
                  onChange={(e) => setFormExampleZh(e.target.value)}
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-lg bg-slate-50/50 focus:border-indigo-400 focus:outline-none"
                />
              </div>

              <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-200 text-[10px] text-slate-400 flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5 flex-shrink-0 text-slate-400" />
                <span>💡 提示：如果您只想快速输入单词，音标与例句放空提交即可，随后在单词表中点击极速“AI智能补全”。</span>
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddWordModal(false);
                    setEditingWord(null);
                    clearWordForm();
                  }}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-md"
                >
                  保存生词
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
